const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const logger = require('./logger');

// Create Turso database client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
// This function is idempotent and safe to run on every startup.
// All statements use IF NOT EXISTS, so they are no-ops on an existing database.
// When deploying to a new environment, this creates the full schema from scratch.
async function initializeDatabase() {
  try {
    logger.info('Initializing database schema...');

    // ── Users ────────────────────────────────────────────────
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        pickup_address TEXT,
        pickup_city TEXT,
        pickup_postal_code TEXT,
        pickup_country TEXT,
        pickup_instructions TEXT,
        password_setup_token TEXT DEFAULT NULL,
        password_setup_token_expires DATETIME DEFAULT NULL,
        available_withdrawal REAL NOT NULL DEFAULT 0,
        withdrawal_recipient TEXT,
        withdrawal_iban TEXT
      )
    `);

    // ── Products (legacy) ────────────────────────────────────
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
        stockable INTEGER NOT NULL DEFAULT 0,
        stock INTEGER,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // ── Art ──────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS art (
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
        type TEXT NOT NULL DEFAULT 'Físico',
        weight INTEGER,
        dimensions TEXT,
        removed INTEGER NOT NULL DEFAULT 0,
        for_auction INTEGER NOT NULL DEFAULT 0,
        for_draw INTEGER NOT NULL DEFAULT 0,
        ai_generated INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // ── Others ───────────────────────────────────────────────
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
        weight INTEGER,
        dimensions TEXT,
        removed INTEGER NOT NULL DEFAULT 0,
        for_auction INTEGER NOT NULL DEFAULT 0,
        for_draw INTEGER NOT NULL DEFAULT 0,
        ai_generated INTEGER NOT NULL DEFAULT 0,
        can_copack INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // ── Other variants ───────────────────────────────────────
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

    // ── Shipping methods ─────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipping_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK(type IN ('delivery', 'pickup')),
        max_weight INTEGER,
        max_dimensions TEXT,
        estimated_delivery_days INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        article_type TEXT NOT NULL DEFAULT 'all' CHECK(article_type IN ('art', 'others', 'all')),
        max_articles INTEGER NOT NULL DEFAULT 1 CHECK(max_articles >= 1)
      )
    `);

    // ── Shipping zones ───────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipping_method_id INTEGER NOT NULL,
        seller_id INTEGER NOT NULL,
        country TEXT,
        postal_code TEXT,
        cost REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── Orders ───────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revolut_order_token TEXT,
        payment_provider TEXT DEFAULT 'revolut',
        stripe_payment_intent_id TEXT,
        stripe_payment_method_id TEXT,
        stripe_customer_id TEXT,
        reserved_at DATETIME,
        payment_mismatch INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ── Order items (legacy) ─────────────────────────────────
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

    // ── Art order items ──────────────────────────────────────
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
        commission_amount REAL,
        tracking TEXT,
        status TEXT,
        status_modified NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sendcloud_shipment_id TEXT,
        sendcloud_parcel_id TEXT,
        sendcloud_tracking_url TEXT,
        sendcloud_shipping_option_code TEXT,
        sendcloud_service_point_id TEXT,
        sendcloud_announcement_retries INTEGER DEFAULT 0,
        sendcloud_announcement_failed_at DATETIME,
        sendcloud_carrier_code TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (art_id) REFERENCES art(id)
      )
    `);

    // ── Other order items ────────────────────────────────────
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
        commission_amount REAL,
        tracking TEXT,
        status TEXT,
        status_modified NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sendcloud_shipment_id TEXT,
        sendcloud_parcel_id TEXT,
        sendcloud_tracking_url TEXT,
        sendcloud_shipping_option_code TEXT,
        sendcloud_service_point_id TEXT,
        sendcloud_announcement_retries INTEGER DEFAULT 0,
        sendcloud_announcement_failed_at DATETIME,
        sendcloud_carrier_code TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (other_id) REFERENCES others(id),
        FOREIGN KEY (other_var_id) REFERENCES other_vars(id)
      )
    `);

    // ── Postal codes ─────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS postal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postal_code TEXT NOT NULL DEFAULT '0',
        city TEXT,
        province TEXT,
        country TEXT
      )
    `);

    // ── Auctions ─────────────────────────────────────────────
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

    // ── Auction users ────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_users (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // ── Auction arts ─────────────────────────────────────────
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
        shipping_observations TEXT,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (art_id) REFERENCES art(id)
      )
    `);

    // ── Auction others ───────────────────────────────────────
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
        shipping_observations TEXT,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (other_id) REFERENCES others(id)
      )
    `);

    // ── Auction buyers ───────────────────────────────────────
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

    // ── Auction bids ─────────────────────────────────────────
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

    // ── Auction arts postal codes (polymorphic refs) ─────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_arts_postal_codes (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        art_id INTEGER NOT NULL,
        ref_type TEXT NOT NULL DEFAULT 'postal_code',
        postal_code_id INTEGER,
        ref_value TEXT,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (art_id) REFERENCES art(id),
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // ── Auction others postal codes (polymorphic refs) ──────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_others_postal_codes (
        id TEXT PRIMARY KEY,
        auction_id TEXT NOT NULL,
        other_id INTEGER NOT NULL,
        ref_type TEXT NOT NULL DEFAULT 'postal_code',
        postal_code_id INTEGER,
        ref_value TEXT,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (other_id) REFERENCES others(id),
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // ── Auction authorised payment data ──────────────────────
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

    // ── Events ───────────────────────────────────────────────
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

    // ── Event attendees ──────────────────────────────────────
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
        ip_address TEXT,
        chat_banned INTEGER NOT NULL DEFAULT 0,
        access_password TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        verification_code_hash TEXT,
        verification_code_expires_at DATETIME,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    // ── Event bans ───────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS event_bans (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        email TEXT,
        ip_address TEXT,
        reason TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    // ── Draws ────────────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS draws (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        product_id INTEGER NOT NULL,
        product_type TEXT NOT NULL CHECK(product_type IN ('art','other')),
        price REAL NOT NULL,
        units INTEGER NOT NULL DEFAULT 1,
        min_participants INTEGER NOT NULL DEFAULT 30,
        max_participations INTEGER NOT NULL,
        start_datetime DATETIME NOT NULL,
        end_datetime DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','finished','cancelled')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Draw buyers ────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS draw_buyers (
        id TEXT PRIMARY KEY,
        draw_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        dni TEXT NOT NULL,
        ip_address TEXT,
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
        FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE
      )
    `);

    // ── Draw participations ────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS draw_participations (
        id TEXT PRIMARY KEY,
        draw_id TEXT NOT NULL,
        draw_buyer_id TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE,
        FOREIGN KEY (draw_buyer_id) REFERENCES draw_buyers(id)
      )
    `);

    // ── Draw authorised payment data ───────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS draw_authorised_payment_data (
        id TEXT PRIMARY KEY,
        draw_buyer_id TEXT NOT NULL,
        name TEXT,
        last_four TEXT,
        stripe_setup_intent_id TEXT,
        stripe_payment_method_id TEXT,
        stripe_customer_id TEXT,
        stripe_fingerprint TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (draw_buyer_id) REFERENCES draw_buyers(id)
      )
    `);

    // ── Draw email verifications ─────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS draw_email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        draw_id TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE
      )
    `);

    // ── Draw tables migrations (safe column additions for existing DBs) ──
    const safeAlter = async (sql) => {
      try { await db.execute(sql); } catch { /* column already exists */ }
    };
    await safeAlter('ALTER TABLE draw_buyers ADD COLUMN dni TEXT NOT NULL DEFAULT \'\'');
    await safeAlter('ALTER TABLE draw_buyers ADD COLUMN ip_address TEXT');
    await safeAlter('ALTER TABLE draw_authorised_payment_data ADD COLUMN stripe_fingerprint TEXT');
    await safeAlter('ALTER TABLE draws ADD COLUMN min_participants INTEGER NOT NULL DEFAULT 30');
    await safeAlter('ALTER TABLE draw_email_verifications ADD COLUMN ip_address TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN available_withdrawal REAL NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE orders ADD COLUMN reserved_at DATETIME');
    await safeAlter('ALTER TABLE orders ADD COLUMN payment_mismatch INTEGER NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN access_password TEXT');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN verification_code_hash TEXT');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN verification_code_expires_at DATETIME');
    await safeAlter('ALTER TABLE others ADD COLUMN can_copack INTEGER NOT NULL DEFAULT 1');
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN sendcloud_shipment_id TEXT');
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN sendcloud_tracking_url TEXT');
    await safeAlter('ALTER TABLE other_order_items ADD COLUMN sendcloud_shipment_id TEXT');
    await safeAlter('ALTER TABLE other_order_items ADD COLUMN sendcloud_tracking_url TEXT');
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN sendcloud_parcel_id TEXT');
    await safeAlter('ALTER TABLE other_order_items ADD COLUMN sendcloud_parcel_id TEXT');
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0');
    await safeAlter('ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_retries INTEGER DEFAULT 0');
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME');
    await safeAlter('ALTER TABLE other_order_items ADD COLUMN sendcloud_announcement_failed_at DATETIME');

    // ── Withdrawals ──────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        iban TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT NULL,
        admin_notes TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // ── User Sendcloud configuration ─────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_sendcloud_configuration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        sender_name TEXT,
        sender_company_name TEXT,
        sender_address_1 TEXT,
        sender_address_2 TEXT,
        sender_house_number TEXT,
        sender_city TEXT,
        sender_postal_code TEXT,
        sender_country TEXT DEFAULT 'ES',
        sender_phone TEXT,
        sender_email TEXT,
        require_signature INTEGER NOT NULL DEFAULT 0,
        fragile_goods INTEGER NOT NULL DEFAULT 0,
        insurance_type TEXT NOT NULL DEFAULT 'none' CHECK(insurance_type IN ('none', 'full_value', 'fixed')),
        insurance_fixed_amount REAL,
        first_mile TEXT NOT NULL DEFAULT 'dropoff' CHECK(first_mile IN ('pickup', 'dropoff', 'pickup_dropoff', 'fulfilment')),
        last_mile TEXT NOT NULL DEFAULT 'home_delivery' CHECK(last_mile IN ('home_delivery', 'service_point', 'mailbox', 'locker', 'locker_or_service_point')),
        preferred_carriers TEXT,
        excluded_carriers TEXT,
        default_hs_code TEXT,
        origin_country TEXT DEFAULT 'ES',
        vat_number TEXT,
        eori_number TEXT,
        self_packs INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── Sendcloud pickups ──────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sendcloud_pickups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        seller_id INTEGER NOT NULL,
        sendcloud_pickup_id TEXT,
        carrier_code TEXT NOT NULL,
        status TEXT DEFAULT 'ANNOUNCING',
        pickup_address TEXT,
        time_slot_start DATETIME NOT NULL,
        time_slot_end DATETIME NOT NULL,
        special_instructions TEXT,
        total_weight_kg REAL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (seller_id) REFERENCES users(id)
      )
    `);

    // ── Shipping zones postal codes (polymorphic refs) ───────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shipping_zones_postal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipping_zone_id INTEGER NOT NULL,
        ref_type TEXT NOT NULL DEFAULT 'postal_code',
        postal_code_id INTEGER,
        ref_value TEXT,
        FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE,
        FOREIGN KEY (postal_code_id) REFERENCES postal_codes(id)
      )
    `);

    // ── Indexes ──────────────────────────────────────────────
    // Shipping
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_method ON shipping_zones(shipping_method_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_seller ON shipping_zones(seller_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_country ON shipping_zones(country)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_postal ON shipping_zones(postal_code)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_szpc_zone_ref ON shipping_zones_postal_codes(shipping_zone_id, ref_type)`);

    // Orders
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token ON orders(token)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON orders(stripe_payment_intent_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_orders_reserved_at ON orders(status, reserved_at)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_order_items_order ON art_order_items(order_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_other_order_items_order ON other_order_items(order_id)`);

    // Products
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_seller ON art(seller_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_status ON art(status, visible, removed)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_others_seller ON others(seller_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_others_status ON others(status, visible, removed)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_other_vars_other ON other_vars(other_id)`);

    // Users
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_password_setup_token ON users(password_setup_token)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

    // Auctions
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_bids_buyer ON auction_bids(auction_buyer_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_buyers_auction ON auction_buyers(auction_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status)`);

    // Events
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);

    // Draws
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_draw_participations_draw ON draw_participations(draw_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_draw_participations_buyer ON draw_participations(draw_buyer_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_draw_buyers_draw ON draw_buyers(draw_id)`);
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_buyers_dni_draw ON draw_buyers(dni, draw_id)`);
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_buyers_email_draw ON draw_buyers(email, draw_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_draws_status ON draws(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_draw_email_verifications_email_draw ON draw_email_verifications(email, draw_id)`);

    // Sendcloud
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_user_sendcloud_config_user ON user_sendcloud_configuration(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_oi_sendcloud_shipment ON art_order_items(sendcloud_shipment_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_other_oi_sendcloud_shipment ON other_order_items(sendcloud_shipment_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_oi_sendcloud_parcel ON art_order_items(sendcloud_parcel_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_other_oi_sendcloud_parcel ON other_order_items(sendcloud_parcel_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_art_oi_status_modified ON art_order_items(status, status_modified)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_other_oi_status_modified ON other_order_items(status, status_modified)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_sendcloud_pickups_order_seller ON sendcloud_pickups(order_id, seller_id)`);

    // Withdrawals
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id)`);

    // Postal codes
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_postal_codes_code_country ON postal_codes(postal_code, country)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_postal_codes_province_country ON postal_codes(province, country)`);

    // ── Initialize orders auto-increment to start from 1000 ──
    try {
      const result = await db.execute('SELECT COUNT(*) as count FROM orders');
      if (result.rows[0].count === 0) {
        await db.execute(`INSERT INTO orders (id, total_price, token, status) VALUES (999, 0, '__init__', 'completed')`);
        await db.execute(`DELETE FROM orders WHERE id = 999`);
        logger.info('Set orders auto-increment to start from 1000');
      }
    } catch (err) {
      // Table may already have data, skip silently
    }

    // ── Import postal codes from ES.csv if table is empty ────
    await importPostalCodes();

    logger.info('Database schema initialized successfully!');
  } catch (error) {
    logger.error({ err: error }, 'Error initializing database');
    throw error;
  }
}

// Import Spanish postal codes from the ES.csv file (tab-separated).
// Only runs when the postal_codes table is empty (fresh database).
async function importPostalCodes() {
  try {
    const countResult = await db.execute('SELECT COUNT(*) as count FROM postal_codes');
    if (countResult.rows[0].count > 0) {
      return;
    }

    const csvPath = path.join(__dirname, '..', 'migrations', 'ES.csv');
    if (!fs.existsSync(csvPath)) {
      logger.info('ES.csv not found, skipping postal codes import');
      return;
    }

    logger.info('Importing postal codes from ES.csv...');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Skip header line
    const dataLines = lines.slice(1);

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let imported = 0;

    for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
      const batch = dataLines.slice(i, i + BATCH_SIZE);
      const statements = batch.map(line => {
        const [id, postal_code, city, province, country] = line.split('\t');
        return {
          sql: 'INSERT OR IGNORE INTO postal_codes (id, postal_code, city, province, country) VALUES (?, ?, ?, ?, ?)',
          args: [parseInt(id), postal_code, city, province, country],
        };
      });
      await db.batch(statements);
      imported += batch.length;
    }

    logger.info({ count: imported }, 'Imported postal codes from ES.csv');
  } catch (err) {
    logger.error({ err }, 'Error importing postal codes');
  }
}

module.exports = { db, initializeDatabase };
