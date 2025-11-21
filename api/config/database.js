const { createClient } = require('@libsql/client');
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

    // If an old orders schema exists (with buyer_id and without email),
    // drop orders and the dependent order item tables so we can recreate
    // them with the new guest-friendly structure.
    try {
      const pragmaResult = await db.execute('PRAGMA table_info(orders)');
      const cols = pragmaResult.rows || [];
      const hasEmailColumn = cols.some((c) => c.name === 'email');
      const hasBuyerIdColumn = cols.some((c) => c.name === 'buyer_id');

      if (!hasEmailColumn && hasBuyerIdColumn) {
        console.log('Legacy orders schema detected. Recreating orders and order item tables...');
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

    // Create auctions table (for future functionality)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL UNIQUE,
        start_date DATETIME NOT NULL,
        end_date DATETIME NOT NULL,
        starting_bid REAL NOT NULL,
        current_highest_bid REAL,
        winning_user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'scheduled',
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (winning_user_id) REFERENCES users(id)
      )
    `);

    // Create bids table (for future functionality)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
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

    // Add delivery address fields to orders table
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

    console.log('Database schema initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { db, initializeDatabase };
