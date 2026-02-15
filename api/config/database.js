const { createClient } = require('@libsql/client');
const crypto = require('crypto');
require('dotenv').config();

// Create Turso database client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');

    // Create users table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('buyer', 'seller', 'admin')) DEFAULT 'buyer',
        full_name TEXT,
        slug TEXT UNIQUE,
        profile_img TEXT,
        location TEXT,
        bio TEXT,
        email_contact TEXT,
        visible INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table (legacy - keep for backward compatibility)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('physical', 'digital')),
        basename TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        visible INTEGER NOT NULL DEFAULT 1,
        is_sold INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // Create art table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS art (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        type TEXT NOT NULL,
        basename TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        visible INTEGER NOT NULL DEFAULT 1,
        is_sold INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // Create others table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS others (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        basename TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        visible INTEGER NOT NULL DEFAULT 1,
        is_sold INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // Create other_vars table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS other_vars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        other_id INTEGER NOT NULL,
        key TEXT,
        value TEXT,
        stock INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (other_id) REFERENCES others(id) ON DELETE CASCADE
      )
    `);

    // --- Orders & order items schema --------------------------------------

    // Detect legacy or mismatched schemas for orders and order item tables.
    // If found, drop and recreate them to avoid foreign key mismatches at runtime.
    try {
      const ordersInfo = await db.execute('PRAGMA table_info(orders)');
      const ordersCols = ordersInfo.rows || [];
      const hasEmailColumn = ordersCols.some((c) => c.name === 'email');
      const hasTokenColumn = ordersCols.some((c) => c.name === 'token');
      const hasBuyerIdColumn = ordersCols.some((c) => c.name === 'buyer_id');
      const hasIdPrimaryKey = ordersCols.some((c) => c.name === 'id' && c.pk === 1);

      let shouldRecreateOrders = false;

      // Legacy schema (buyer_id without email/token) or missing token column
      if (hasBuyerIdColumn || !hasEmailColumn || !hasTokenColumn || !hasIdPrimaryKey) {
        shouldRecreateOrders = true;
      }

      // Inspect child tables to ensure their FKs point to orders(id)
      const checkFk = async (tableName) => {
        try {
          const fkList = await db.execute(`PRAGMA foreign_key_list(${tableName})`);
          const rows = fkList.rows || [];
          if (rows.length === 0) return false;
          return rows.some((r) => r.table === 'orders' && r.from === 'order_id' && r.to === 'id');
        } catch (err) {
          return false;
        }
      };

      const artFkOk = await checkFk('art_order_items');
      const otherFkOk = await checkFk('other_order_items');
      const legacyFkOk = await checkFk('order_items');

      if (!artFkOk || !otherFkOk || !legacyFkOk) {
        shouldRecreateOrders = true;
      }

      if (shouldRecreateOrders) {
        console.log('Recreating orders and related item tables to fix schema/foreign key mismatches...');
        await db.execute('DROP TABLE IF EXISTS order_items');
        await db.execute('DROP TABLE IF EXISTS art_order_items');
        await db.execute('DROP TABLE IF EXISTS other_order_items');
        await db.execute('DROP TABLE IF EXISTS orders');
      }
    } catch (err) {
      console.log('Could not inspect existing orders schema (this may be expected on first run):', err.message);
    }

    // Create orders table (guest-friendly, no buyer_id)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        phone TEXT,
        guest_email TEXT,
        total_price REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        revolut_order_id TEXT,
        revolut_payment_id TEXT,
        token TEXT UNIQUE NOT NULL,
        delivery_address_line_1 TEXT,
        delivery_address_line_2 TEXT,
        delivery_postal_code TEXT,
        delivery_city TEXT,
        delivery_province TEXT,
        delivery_country TEXT,
        delivery_lat REAL,
        delivery_lng REAL,
        invoicing_address_line_1 TEXT,
        invoicing_address_line_2 TEXT,
        invoicing_postal_code TEXT,
        invoicing_city TEXT,
        invoicing_province TEXT,
        invoicing_country TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Set orders table auto-increment to start from 1000
    try {
      // Check if there are any orders already
      const ordersCountResult = await db.execute('SELECT COUNT(*) as count FROM orders');
      const ordersCount = ordersCountResult.rows[0].count;

      if (ordersCount === 0) {
        // Only set starting ID if table is empty
        // Insert a dummy row at 999 and delete it to set the next ID to 1000
        await db.execute(`INSERT INTO orders (id, total_price, status) VALUES (999, 0, 'completed')`);
        await db.execute(`DELETE FROM orders WHERE id = 999`);
        console.log('Set orders table to start from ID 1000');
      }
    } catch (err) {
      // If it fails (e.g., table already has data), just continue
      console.log('Orders table already has data, skipping ID initialization');
    }

    // Create order_items table (legacy - keep for backward compatibility)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        price_at_purchase REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Create art_order_items table (with shipping fields)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS art_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        art_id INTEGER NOT NULL,
        price_at_purchase REAL NOT NULL,
        shipping_method_id INTEGER,
        shipping_cost REAL,
        shipping_method_name TEXT,
        shipping_method_type TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (art_id) REFERENCES art(id)
      )
    `);

    // Create other_order_items table (with shipping fields)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS other_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        other_id INTEGER NOT NULL,
        other_var_id INTEGER NOT NULL,
        price_at_purchase REAL NOT NULL,
        shipping_method_id INTEGER,
        shipping_cost REAL,
        shipping_method_name TEXT,
        shipping_method_type TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (other_id) REFERENCES others(id),
        FOREIGN KEY (other_var_id) REFERENCES other_vars(id)
      )
    `);

    // Note: Legacy bids/auctions tables have been migrated to the new schema.
    // The DROP TABLE statements were removed to prevent foreign key constraint errors
    // since the new schema is now in use with data.

    // Create postal_codes reference table (may already exist if created manually)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS postal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postal_code TEXT NOT NULL DEFAULT '0',
        city TEXT,
        province TEXT,
        country TEXT NOT NULL DEFAULT 'ES'
      )
    `);

    // Create auctions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auctions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        original_end_datetime DATETIME,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','finished','cancelled')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create auction_users table (seller/authors whose products are in the auction)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_users (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create auction_arts table (art products assigned to an auction)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_arts (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        art_id INTEGER NOT NULL,
        start_price REAL NOT NULL,
        current_price REAL,
        end_price REAL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','sold','unsold')),
        position INTEGER NOT NULL DEFAULT 0,
        step_new_bid REAL NOT NULL DEFAULT 10,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (art_id) REFERENCES art(id)
      )
    `);

    // Create auction_others table (other products assigned to an auction)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_others (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        other_id INTEGER NOT NULL,
        start_price REAL NOT NULL,
        current_price REAL,
        end_price REAL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','sold','unsold')),
        position INTEGER NOT NULL DEFAULT 0,
        step_new_bid REAL NOT NULL DEFAULT 10,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (other_id) REFERENCES others(id)
      )
    `);

    // Create auction_buyers table (anonymous bidders)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_buyers (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        bid_password TEXT NOT NULL,
        delivery_address_1 TEXT,
        delivery_address_2 TEXT,
        delivery_postal_code TEXT,
        delivery_city TEXT,
        delivery_province TEXT,
        delivery_country TEXT,
        delivery_lat REAL,
        delivery_long REAL,
        invoicing_address_1 TEXT,
        invoicing_address_2 TEXT,
        invoicing_postal_code TEXT,
        invoicing_city TEXT,
        invoicing_province TEXT,
        invoicing_country TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
      )
    `);

    // Create auction_bids table (polymorphic product reference)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_bids (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        auction_buyer_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        product_type TEXT NOT NULL CHECK(product_type IN ('art','other')),
        amount REAL NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (auction_buyer_id) REFERENCES auction_buyers(id)
      )
    `);

    // Create auction_arts_postal_codes table (allowed postal codes per art product in auction)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_arts_postal_codes (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        art_id INTEGER NOT NULL,
        postal_code_id INTEGER NOT NULL,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (art_id) REFERENCES art(id),
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // Create auction_others_postal_codes table (allowed postal codes per other product in auction)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_others_postal_codes (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        other_id INTEGER NOT NULL,
        postal_code_id INTEGER NOT NULL,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (other_id) REFERENCES others(id),
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // Create auction_authorised_payment_data table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_authorised_payment_data (
        id TEXT PRIMARY KEY,
        auction_buyer_id TEXT NOT NULL,
        name TEXT,
        last_four TEXT,
        stripe_setup_intent_id TEXT,
        stripe_payment_method_id TEXT,
        stripe_customer_id TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_buyer_id) REFERENCES auction_buyers(id)
      )
    `);

    // Create events table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        event_datetime DATETIME NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        host_user_id INTEGER NOT NULL,
        cover_image_url TEXT,
        access_type TEXT NOT NULL DEFAULT 'free' CHECK(access_type IN ('free', 'paid')),
        price REAL,
        currency TEXT DEFAULT 'EUR',
        format TEXT NOT NULL DEFAULT 'live' CHECK(format IN ('live', 'video')),
        content_type TEXT NOT NULL DEFAULT 'streaming' CHECK(content_type IN ('streaming', 'video')),
        category TEXT NOT NULL CHECK(category IN ('masterclass', 'charla', 'entrevista', 'ama', 'video')),
        video_url TEXT,
        max_attendees INTEGER,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','finished','cancelled')),
        livekit_room_name TEXT,
        video_started_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_user_id) REFERENCES users(id)
      )
    `);

    // Create event_attendees table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS event_attendees (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        access_token_hash TEXT,
        stripe_payment_intent_id TEXT,
        stripe_customer_id TEXT,
        amount_paid REAL,
        currency TEXT,
        status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','paid','joined','cancelled')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    // Run migrations to add new columns if they don't exist
    console.log('Running database migrations...');

    try {
      // Add email_contact to users if it doesn't exist
      await db.execute(`ALTER TABLE users ADD COLUMN email_contact TEXT`);
      console.log('Added email_contact column to users table');
    } catch (err) {
      // Column likely already exists
      if (!err.message.includes('duplicate column')) {
        console.log('email_contact column already exists or error:', err.message);
      }
    }

    try {
      // Add visible to products if it doesn't exist
      await db.execute(`ALTER TABLE products ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`);
      console.log('Added visible column to products table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('visible column already exists or error:', err.message);
      }
    }

    try {
      // Add status to products if it doesn't exist
      await db.execute(`ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
      console.log('Added status column to products table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('status column already exists or error:', err.message);
      }
    }

    try {
      // Add stockable to products if it doesn't exist
      await db.execute(`ALTER TABLE products ADD COLUMN stockable INTEGER NOT NULL DEFAULT 0`);
      console.log('Added stockable column to products table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('stockable column already exists or error:', err.message);
      }
    }

    try {
      // Add stock to products if it doesn't exist (NULL for non-stockable products)
      await db.execute(`ALTER TABLE products ADD COLUMN stock INTEGER`);
      console.log('Added stock column to products table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('stock column already exists or error:', err.message);
      }
    }

    // guest_email, email, phone and address/Revolut columns are now part of the
    // base orders schema definition above. We drop older migrations that would
    // reintroduce deprecated contact/contact_type columns.

    // Add pickup address fields to users table
    try {
      await db.execute(`ALTER TABLE users ADD COLUMN pickup_address TEXT`);
      console.log('Added pickup_address column to users table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('pickup_address column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE users ADD COLUMN pickup_city TEXT`);
      console.log('Added pickup_city column to users table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('pickup_city column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE users ADD COLUMN pickup_postal_code TEXT`);
      console.log('Added pickup_postal_code column to users table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('pickup_postal_code column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE users ADD COLUMN pickup_country TEXT`);
      console.log('Added pickup_country column to users table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('pickup_country column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE users ADD COLUMN pickup_instructions TEXT`);
      console.log('Added pickup_instructions column to users table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('pickup_instructions column already exists or error:', err.message);
      }
    }

    // Remove legacy system guest user if it exists
    try {
      await db.execute(`DELETE FROM users WHERE email = 'SYSTEM_GUEST@kuadrat.internal'`);
      console.log('Removed legacy SYSTEM_GUEST user if present');
    } catch (err) {
      console.log('Could not remove legacy SYSTEM_GUEST user (may not exist):', err.message);
    }

    // Add removed column to art table
    try {
      await db.execute(`ALTER TABLE art ADD COLUMN removed INTEGER NOT NULL DEFAULT 0`);
      console.log('Added removed column to art table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('removed column already exists in art table or error:', err.message);
      }
    }

    // Add removed column to others table
    try {
      await db.execute(`ALTER TABLE others ADD COLUMN removed INTEGER NOT NULL DEFAULT 0`);
      console.log('Added removed column to others table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('removed column already exists in others table or error:', err.message);
      }
    }

    // Add missing columns to orders table
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN token TEXT`);
      console.log('Added token column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('token column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token ON orders(token)`);
      console.log('Ensured unique index on orders.token');
    } catch (err) {
      console.log('Could not ensure unique index on orders.token:', err.message);
    }

    // Backfill missing tokens for existing rows
    try {
      const missing = await db.execute('SELECT id FROM orders WHERE token IS NULL OR token = ""');
      if (missing.rows.length > 0) {
        for (const row of missing.rows) {
          const token = crypto.randomBytes(24).toString('hex');
          await db.execute({ sql: 'UPDATE orders SET token = ? WHERE id = ?', args: [token, row.id] });
        }
        console.log(`Backfilled tokens for ${missing.rows.length} existing orders`);
      }
    } catch (err) {
      console.log('Could not backfill order tokens:', err.message);
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_address_line_1 TEXT`);
      console.log('Added delivery_address_line_1 column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_address_line_1 column already exists or error:', err.message);
      }
    }

    // Add Revolut linkage columns to orders table
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN revolut_order_id TEXT`);
      console.log('Added revolut_order_id column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('revolut_order_id column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN revolut_payment_id TEXT`);
      console.log('Added revolut_payment_id column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('revolut_payment_id column already exists or error:', err.message);
      }
    }

    // Add Revolut order token column (public ID used in Revolut Pay redirects)
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN revolut_order_token TEXT`);
      console.log('Added revolut_order_token column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('revolut_order_token column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_address_line_2 TEXT`);
      console.log('Added delivery_address_line_2 column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_address_line_2 column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_postal_code TEXT`);
      console.log('Added delivery_postal_code column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_postal_code column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_city TEXT`);
      console.log('Added delivery_city column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_city column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_province TEXT`);
      console.log('Added delivery_province column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_province column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_country TEXT`);
      console.log('Added delivery_country column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_country column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_lat REAL`);
      console.log('Added delivery_lat column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_lat column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN delivery_lng REAL`);
      console.log('Added delivery_lng column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('delivery_lng column already exists or error:', err.message);
      }
    }

    // Add invoicing address fields to orders table
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_address_line_1 TEXT`);
      console.log('Added invoicing_address_line_1 column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_address_line_1 column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_address_line_2 TEXT`);
      console.log('Added invoicing_address_line_2 column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_address_line_2 column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_postal_code TEXT`);
      console.log('Added invoicing_postal_code column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_postal_code column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_city TEXT`);
      console.log('Added invoicing_city column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_city column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_province TEXT`);
      console.log('Added invoicing_province column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_province column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN invoicing_country TEXT`);
      console.log('Added invoicing_country column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('invoicing_country column already exists or error:', err.message);
      }
    }

    // Add Stripe payment columns to orders table
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN payment_provider TEXT DEFAULT 'revolut'`);
      console.log('Added payment_provider column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('payment_provider column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT`);
      console.log('Added stripe_payment_intent_id column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('stripe_payment_intent_id column already exists or error:', err.message);
      }
    }

    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN stripe_payment_method_id TEXT`);
      console.log('Added stripe_payment_method_id column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('stripe_payment_method_id column already exists or error:', err.message);
      }
    }

    // Add stripe_customer_id column to orders table
    try {
      await db.execute(`ALTER TABLE orders ADD COLUMN stripe_customer_id TEXT`);
      console.log('Added stripe_customer_id column to orders table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('stripe_customer_id column already exists or error:', err.message);
      }
    }

    // Add commission_amount column to art_order_items table
    try {
      await db.execute(`ALTER TABLE art_order_items ADD COLUMN commission_amount REAL`);
      console.log('Added commission_amount column to art_order_items table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('commission_amount column already exists in art_order_items or error:', err.message);
      }
    }

    // Add commission_amount column to other_order_items table
    try {
      await db.execute(`ALTER TABLE other_order_items ADD COLUMN commission_amount REAL`);
      console.log('Added commission_amount column to other_order_items table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('commission_amount column already exists in other_order_items or error:', err.message);
      }
    }

    // Add for_auction column to art table
    try {
      await db.execute(`ALTER TABLE art ADD COLUMN for_auction INTEGER NOT NULL DEFAULT 0`);
      console.log('Added for_auction column to art table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('for_auction column already exists in art table or error:', err.message);
      }
    }

    // Add for_auction column to others table
    try {
      await db.execute(`ALTER TABLE others ADD COLUMN for_auction INTEGER NOT NULL DEFAULT 0`);
      console.log('Added for_auction column to others table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('for_auction column already exists in others table or error:', err.message);
      }
    }

    // Add shipping_observations column to auction_arts table
    try {
      await db.execute(`ALTER TABLE auction_arts ADD COLUMN shipping_observations TEXT`);
      console.log('Added shipping_observations column to auction_arts table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('shipping_observations column already exists in auction_arts table or error:', err.message);
      }
    }

    // Add shipping_observations column to auction_others table
    try {
      await db.execute(`ALTER TABLE auction_others ADD COLUMN shipping_observations TEXT`);
      console.log('Added shipping_observations column to auction_others table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('shipping_observations column already exists in auction_others table or error:', err.message);
      }
    }

    // Create shipping_zones_postal_codes junction table (n-to-n: zones <-> postal_codes)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipping_zones_postal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipping_zone_id INTEGER NOT NULL,
        postal_code_id INTEGER NOT NULL,
        FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE,
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // Unique index to prevent duplicate zone-postal_code pairs
    try {
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_szpc_zone_postal
        ON shipping_zones_postal_codes(shipping_zone_id, postal_code_id)
      `);
    } catch (err) {
      // Index may already exist
    }

    // Migration: move existing shipping_zones.postal_code data to the junction table
    try {
      // Find zones that have a postal_code value and haven't been migrated yet
      const zonesToMigrate = await db.execute(`
        SELECT sz.id as zone_id, sz.postal_code, pc.id as postal_code_id
        FROM shipping_zones sz
        INNER JOIN postal_codes pc ON pc.postal_code = sz.postal_code
        WHERE sz.postal_code IS NOT NULL
          AND sz.postal_code != ''
          AND NOT EXISTS (
            SELECT 1 FROM shipping_zones_postal_codes szpc
            WHERE szpc.shipping_zone_id = sz.id
          )
      `);

      for (const row of zonesToMigrate.rows) {
        try {
          await db.execute({
            sql: 'INSERT INTO shipping_zones_postal_codes (shipping_zone_id, postal_code_id) VALUES (?, ?)',
            args: [row.zone_id, row.postal_code_id],
          });
        } catch (insertErr) {
          // Skip duplicates
        }
      }

      if (zonesToMigrate.rows.length > 0) {
        console.log(`Migrated ${zonesToMigrate.rows.length} shipping zone postal codes to junction table`);
      }
    } catch (err) {
      console.log('Shipping zones postal code migration skipped or error:', err.message);
    }

    // Add video_started_at to events if it doesn't exist
    try {
      await db.execute(`ALTER TABLE events ADD COLUMN video_started_at DATETIME`);
      console.log('Added video_started_at column to events table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        console.log('video_started_at column already exists or error:', err.message);
      }
    }

    // Migrate events table to add 'video' to category CHECK constraint
    try {
      const hasVideo = await db.execute(`SELECT COUNT(*) as cnt FROM events WHERE category = 'video'`);
      // Test if the constraint allows 'video' by checking table info
      const tableInfo = await db.execute(`PRAGMA table_info(events)`);
      const categoryCol = tableInfo.rows.find(r => r.name === 'category');
      // If the CHECK doesn't include 'video', recreate the table
      if (categoryCol && !String(categoryCol.type || '').includes('video')) {
        await db.execute(`CREATE TABLE IF NOT EXISTS events_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          event_datetime DATETIME NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 60,
          host_user_id INTEGER NOT NULL,
          cover_image_url TEXT,
          access_type TEXT NOT NULL DEFAULT 'free' CHECK(access_type IN ('free', 'paid')),
          price REAL,
          currency TEXT DEFAULT 'EUR',
          format TEXT NOT NULL DEFAULT 'live' CHECK(format IN ('live', 'video')),
          content_type TEXT NOT NULL DEFAULT 'streaming' CHECK(content_type IN ('streaming', 'video')),
          category TEXT NOT NULL CHECK(category IN ('masterclass', 'charla', 'entrevista', 'ama', 'video')),
          video_url TEXT,
          max_attendees INTEGER,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','finished','cancelled')),
          livekit_room_name TEXT,
          video_started_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (host_user_id) REFERENCES users(id)
        )`);
        await db.execute(`INSERT OR IGNORE INTO events_new SELECT id, title, slug, description, event_datetime, duration_minutes, host_user_id, cover_image_url, access_type, price, currency, format, content_type, category, video_url, max_attendees, status, livekit_room_name, video_started_at, created_at FROM events`);
        await db.execute(`DROP TABLE events`);
        await db.execute(`ALTER TABLE events_new RENAME TO events`);
        console.log('Migrated events table to include video category');
      }
    } catch (err) {
      console.log('Events category migration skipped or error:', err.message);
    }

    console.log('Database schema initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { db, initializeDatabase };
