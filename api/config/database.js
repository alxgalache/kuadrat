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

    // Create orders table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_id INTEGER NOT NULL,
        total_price REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (buyer_id) REFERENCES users(id)
      )
    `);

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

    // Create art_order_items table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS art_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        art_id INTEGER NOT NULL,
        price_at_purchase REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (art_id) REFERENCES art(id)
      )
    `);

    // Create other_order_items table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS other_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        other_id INTEGER NOT NULL,
        other_var_id INTEGER NOT NULL,
        price_at_purchase REAL NOT NULL,
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

    console.log('Database schema initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { db, initializeDatabase };
