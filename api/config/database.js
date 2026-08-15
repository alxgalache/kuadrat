const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const logger = require('./logger');

const databaseUrl = process.env.TURSO_DATABASE_URL || '';
const isTest = process.env.NODE_ENV === 'test';
// libsql speaks the same protocol to a local SQLite file (`file:`) and to a
// remote Turso instance (`libsql:` / `wss:` / `https:`), so the whole codebase
// is agnostic to which one is behind `db` — only the URL changes.
const isFileUrl = databaseUrl.startsWith('file:');

// ── Anti-remote guard ────────────────────────────────────────────────────────
// The reason this change exists: a test run must never be able to write to the
// preproduction database. This runs before the client is created, so nothing
// can slip through — not a stale `.env` in the container, not a failed dotenv
// override, not a future compose file injecting the wrong URL.
if (isTest && !isFileUrl) {
  console.error(
    '\n[DB GUARD] Refusing to run tests against a non-local database.\n' +
    `  NODE_ENV=test but TURSO_DATABASE_URL is "${databaseUrl || '<empty>'}".\n` +
    '  The test suite may only use a local SQLite file (a "file:" URL).\n' +
    '  Check api/.env.test and api/tests/setup/env.js — the environment file\n' +
    '  must be loaded with { override: true } so it wins over variables\n' +
    '  already injected into the process (docker-compose env_file).\n'
  );
  process.exit(1);
}

if (!isTest && isFileUrl) {
  logger.warn(
    { databaseUrl },
    'Using a LOCAL SQLite file as the database — this is expected only in test runs'
  );
}

// Create the database client. A local `file:` URL takes no auth token; passing
// one is meaningless and some libsql versions reject the combination outright.
const db = createClient(
  isFileUrl
    ? { url: databaseUrl }
    : { url: databaseUrl, authToken: process.env.TURSO_AUTH_TOKEN }
);

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
        -- Landscape-oriented variant used below the md breakpoint, where the
        -- artist card stacks and the image band is far wider than tall. NULL
        -- falls back to profile_img. hide_profile_img_mobile suppresses the
        -- image entirely on small screens, whichever variant would apply.
        profile_img_mobile TEXT,
        hide_profile_img_mobile INTEGER NOT NULL DEFAULT 0,
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
        withdrawal_iban TEXT,
        -- Stripe Connect (Change #1: stripe-connect-accounts)
        stripe_connect_account_id TEXT UNIQUE,
        stripe_connect_status TEXT
          CHECK(stripe_connect_status IN ('not_started','pending','active','restricted','rejected'))
          NOT NULL DEFAULT 'not_started',
        stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0,
        stripe_connect_requirements_due TEXT,
        stripe_connect_last_synced_at DATETIME,
        -- Datos fiscales del artista (preparados para Changes #2 y #4)
        tax_status TEXT CHECK(tax_status IN ('autonomo','sociedad')),
        tax_id TEXT,
        fiscal_full_name TEXT,
        fiscal_address_line1 TEXT,
        fiscal_address_line2 TEXT,
        fiscal_address_city TEXT,
        fiscal_address_postal_code TEXT,
        fiscal_address_province TEXT,
        fiscal_address_country TEXT NOT NULL DEFAULT 'ES',
        irpf_retention_rate REAL,
        -- Per-seller gallery commission (whole percentage, e.g. 25 = 25%).
        -- Replaces the former global DEALER_COMMISSION_* env vars.
        dealer_commission_art REAL NOT NULL DEFAULT 25,
        dealer_commission_other REAL NOT NULL DEFAULT 10,
        -- Per-seller VAT rates the artist invoices at (whole percentage).
        -- Replaces the former global TAX_VAT_* env vars. art = 10 → REBU regime,
        -- any other value (e.g. 21 = cooperativa) → standard_vat regime.
        tax_vat_art REAL NOT NULL DEFAULT 10,
        tax_vat_other REAL NOT NULL DEFAULT 21
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
        -- Limited editions: is_sold means "edition sold out" and is only ever
        -- written together with editions_sold in the same statement.
        edition_size INTEGER NOT NULL DEFAULT 1,
        editions_sold INTEGER NOT NULL DEFAULT 0,
        -- Shipping package, as opposed to the artwork: dimensions and weight
        -- above describe the piece, these describe the box it travels in.
        -- Separate columns because the carrier bills the volumetric weight of
        -- the package. Written only by the art shipping calculator; they do not
        -- appear in any product form.
        outside_dimensions TEXT,
        outside_weight INTEGER,
        packaging_cost REAL NOT NULL DEFAULT 0,
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

    // ── Product images (polymorphic: art / other / other_var) ─
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_type TEXT NOT NULL CHECK(product_type IN ('art','other','other_var')),
        product_id INTEGER NOT NULL,
        basename TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        max_articles INTEGER NOT NULL DEFAULT 1 CHECK(max_articles >= 1),
        -- Catalog of Sendcloud shipping options: one row per option code, shared
        -- by every artwork. NULL on the methods created by hand.
        sendcloud_option_code TEXT,
        sendcloud_carrier_code TEXT
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
        product_id INTEGER,
        product_type TEXT CHECK(product_type IN ('art','other')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Provenance of the row. source is what protects hand-made zones from
        -- the calculator: a regeneration deletes on (product_id, product_type,
        -- zone_group, source='sendcloud_calculator') and never touches a
        -- 'manual' row.
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','sendcloud_calculator')),
        zone_group TEXT,
        sendcloud_option_code TEXT,
        -- Frozen breakdown of cost, so the price can still be reconstructed
        -- once art.packaging_cost has moved on: cost = round(base_cost * 1.21,
        -- 2) + packaging_cost_snapshot.
        base_cost REAL,
        packaging_cost_snapshot REAL,
        calculated_at DATETIME,
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
        payment_mismatch INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        inventory_released_at DATETIME
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
        -- Fiscal regime frozen at sale time ('art_rebu' | 'standard_vat'),
        -- derived from the seller's tax_vat_art. See api/utils/vatRegime.js.
        vat_regime TEXT,
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
        dni TEXT,
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

    // ── Auction email verifications ─────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS auction_email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        auction_id TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT,
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
        provider TEXT NOT NULL DEFAULT 'livekit' CHECK(provider IN ('livekit','agora')),
        interaction_mode TEXT NOT NULL DEFAULT 'broadcast' CHECK(interaction_mode IN ('broadcast','meeting')),
        agora_channel_name TEXT,
        whiteboard_room_uuid TEXT,
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
        agora_uid INTEGER,
        speaker_granted INTEGER NOT NULL DEFAULT 0,
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
    // Stripe Connect (Change #1: stripe-connect-accounts) — users table additions
    await safeAlter('ALTER TABLE users ADD COLUMN stripe_connect_account_id TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN stripe_connect_status TEXT NOT NULL DEFAULT \'not_started\'');
    await safeAlter('ALTER TABLE users ADD COLUMN stripe_transfers_capability_active INTEGER NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE users ADD COLUMN stripe_connect_requirements_due TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN stripe_connect_last_synced_at DATETIME');
    await safeAlter('ALTER TABLE users ADD COLUMN tax_status TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN tax_id TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_full_name TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_line1 TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_line2 TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_city TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_postal_code TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_province TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN fiscal_address_country TEXT NOT NULL DEFAULT \'ES\'');
    await safeAlter('ALTER TABLE users ADD COLUMN irpf_retention_rate REAL');
    await safeAlter('ALTER TABLE users DROP COLUMN autofactura_agreement_signed_at');
    // Per-seller gallery commission (whole percentage). Replaces the former
    // global DEALER_COMMISSION_ART / DEALER_COMMISSION_OTHERS env vars.
    await safeAlter('ALTER TABLE users ADD COLUMN dealer_commission_art REAL NOT NULL DEFAULT 25');
    await safeAlter('ALTER TABLE users ADD COLUMN dealer_commission_other REAL NOT NULL DEFAULT 10');
    // Per-seller VAT rates (whole percentage). Replace the former global
    // TAX_VAT_ES / TAX_VAT_ART_ES env vars. art = 10 → REBU, otherwise standard.
    await safeAlter('ALTER TABLE users ADD COLUMN tax_vat_art REAL NOT NULL DEFAULT 10');
    await safeAlter('ALTER TABLE users ADD COLUMN tax_vat_other REAL NOT NULL DEFAULT 21');
    // Separate artist portrait for small screens, plus an opt-out. See the
    // users CREATE TABLE above for the semantics.
    await safeAlter('ALTER TABLE users ADD COLUMN profile_img_mobile TEXT');
    await safeAlter('ALTER TABLE users ADD COLUMN hide_profile_img_mobile INTEGER NOT NULL DEFAULT 0');
    // Per-item fiscal regime snapshot, frozen at sale time (see utils/vatRegime.js).
    await safeAlter('ALTER TABLE art_order_items ADD COLUMN vat_regime TEXT');
    // Backfill existing art order items: all historical sales were REBU (the only
    // regime possible before per-seller VAT rates). Idempotent — no-op on reruns.
    {
      const backfill = await db.execute(
        "UPDATE art_order_items SET vat_regime = 'art_rebu' WHERE vat_regime IS NULL"
      );
      if (backfill.rowsAffected > 0) {
        logger.info(
          `[database] Backfilled vat_regime='art_rebu' on ${backfill.rowsAffected} art_order_items`
        );
      }
    }
    // Unique partial index on stripe_connect_account_id (ALTER TABLE can't add UNIQUE in SQLite)
    await safeAlter('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_connect_account_id ON users(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL');

    // Limited editions (art-limited-editions) — edition_size is fixed at
    // creation; editions_sold counts reserved/sold copies; is_sold now means
    // "edition sold out" and is only written together with editions_sold.
    // inventory_released_at guards releaseOrderInventory against double release.
    await safeAlter('ALTER TABLE art ADD COLUMN edition_size INTEGER NOT NULL DEFAULT 1');
    await safeAlter('ALTER TABLE art ADD COLUMN editions_sold INTEGER NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE orders ADD COLUMN inventory_released_at DATETIME');
    await safeAlter('ALTER TABLE nfc_tags ADD COLUMN edition_number INTEGER');
    // Backfill: pre-edition rows sold as unique works (edition_size = 1) must
    // read as fully consumed. Idempotent — no-op on reruns.
    {
      const backfill = await db.execute(
        'UPDATE art SET editions_sold = 1 WHERE is_sold = 1 AND editions_sold = 0'
      );
      if (backfill.rowsAffected > 0) {
        logger.info(
          `[database] Backfilled editions_sold=1 on ${backfill.rowsAffected} sold art rows`
        );
      }
    }

    // Stripe Connect (Change #3: stripe-connect-events-wallet) — paid events credit
    // the host's standard_vat bucket after a 1-day grace period. `finished_at` is
    // set when the host ends the event; `host_credited_at` is set by the
    // eventCreditScheduler; `host_credit_excluded` is an admin override.
    await safeAlter('ALTER TABLE events ADD COLUMN finished_at DATETIME');
    await safeAlter('ALTER TABLE events ADD COLUMN host_credited_at DATETIME');
    await safeAlter('ALTER TABLE events ADD COLUMN host_credit_excluded INTEGER NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN commission_amount REAL');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN host_credited_at DATETIME');

    // Agora streaming provider (add-agora-streaming-provider) — per-event
    // provider selection. interaction_mode is only meaningful for Agora events;
    // agora_channel_name is set on start; whiteboard_room_uuid is the lazily
    // created Interactive Whiteboard room (optional phase). agora_uid is the
    // attendee's stable numeric RTC uid (>= 101; host is always 1) and
    // speaker_granted the current broadcast-mode promotion state.
    await safeAlter("ALTER TABLE events ADD COLUMN provider TEXT NOT NULL DEFAULT 'livekit'");
    await safeAlter("ALTER TABLE events ADD COLUMN interaction_mode TEXT NOT NULL DEFAULT 'broadcast'");
    await safeAlter('ALTER TABLE events ADD COLUMN agora_channel_name TEXT');
    await safeAlter('ALTER TABLE events ADD COLUMN whiteboard_room_uuid TEXT');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN agora_uid INTEGER');
    await safeAlter('ALTER TABLE event_attendees ADD COLUMN speaker_granted INTEGER NOT NULL DEFAULT 0');

    // Stripe Connect (Change #2: stripe-connect-manual-payouts) — two-bucket wallet.
    // `available_withdrawal` (legacy) stays as a deprecated column — zeroed by
    // the 2026-04 migration and never written by new code paths.
    await safeAlter('ALTER TABLE users ADD COLUMN available_withdrawal_art_rebu REAL NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE users ADD COLUMN available_withdrawal_standard_vat REAL NOT NULL DEFAULT 0');

    // Stripe Connect (Change #2) — extend `withdrawals` with Stripe Transfers metadata.
    // All new columns are NULLable so legacy rows (pre-Stripe-Connect) remain valid.
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN stripe_transfer_id TEXT');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN stripe_transfer_group TEXT');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN vat_regime TEXT');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN taxable_base_total REAL');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN vat_amount_total REAL');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN executed_at DATETIME');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN executed_by_admin_id INTEGER');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN failure_reason TEXT');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN reversed_at DATETIME');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN reversal_amount REAL');
    await safeAlter('ALTER TABLE withdrawals ADD COLUMN reversal_reason TEXT');
    // Unique partial index: a Stripe transfer id can appear at most once.
    await safeAlter('CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_stripe_transfer ON withdrawals(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL');
    await safeAlter('CREATE INDEX IF NOT EXISTS idx_withdrawals_vat_regime ON withdrawals(vat_regime)');

    // Art shipping calculator (sendcloud-art-shipping-calculator).
    // `art` gets the package (as opposed to the artwork) it travels in;
    // `shipping_methods` becomes a catalog keyed by Sendcloud option code; and
    // `shipping_zones` records where each generated row came from, plus the
    // frozen breakdown of its cost. Every column has a default, so an existing
    // database takes them without a single row being rewritten.
    await safeAlter('ALTER TABLE art ADD COLUMN outside_dimensions TEXT');
    await safeAlter('ALTER TABLE art ADD COLUMN outside_weight INTEGER');
    await safeAlter('ALTER TABLE art ADD COLUMN packaging_cost REAL NOT NULL DEFAULT 0');
    await safeAlter('ALTER TABLE shipping_methods ADD COLUMN sendcloud_option_code TEXT');
    await safeAlter('ALTER TABLE shipping_methods ADD COLUMN sendcloud_carrier_code TEXT');
    // SQLite cannot add a CHECK constraint through ALTER TABLE, so an existing
    // database gets the plain column: the value is only ever written by code
    // that uses the two literals, and a fresh database still carries the CHECK.
    await safeAlter("ALTER TABLE shipping_zones ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
    await safeAlter('ALTER TABLE shipping_zones ADD COLUMN zone_group TEXT');
    await safeAlter('ALTER TABLE shipping_zones ADD COLUMN sendcloud_option_code TEXT');
    await safeAlter('ALTER TABLE shipping_zones ADD COLUMN base_cost REAL');
    await safeAlter('ALTER TABLE shipping_zones ADD COLUMN packaging_cost_snapshot REAL');
    await safeAlter('ALTER TABLE shipping_zones ADD COLUMN calculated_at DATETIME');
    // The exact shape of the regeneration delete, so replacing a group's zones
    // does not scan the table.
    await safeAlter('CREATE INDEX IF NOT EXISTS idx_shipping_zones_generated ON shipping_zones(product_id, product_type, zone_group, source)');
    // One catalog row per Sendcloud option code. Partial so the hand-made
    // methods, which all have NULL here, are not forced into uniqueness.
    await safeAlter('CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_methods_sendcloud_option ON shipping_methods(sendcloud_option_code) WHERE sendcloud_option_code IS NOT NULL');

    // Auction billing — notes column for idempotency marker
    await safeAlter('ALTER TABLE orders ADD COLUMN notes TEXT');
    // Auction buyers — dni column for existing DBs
    await safeAlter('ALTER TABLE auction_buyers ADD COLUMN dni TEXT');

    // Stripe Connect (Change #2) — polymorphic pivot table linking a payout to
    // the concrete items (art/other/event_attendee) it covers, with per-item
    // VAT snapshot for the fiscal export (Change #4).
    await db.execute(`
      CREATE TABLE IF NOT EXISTS withdrawal_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        withdrawal_id INTEGER NOT NULL,
        item_type TEXT NOT NULL CHECK(item_type IN ('art_order_item','other_order_item','event_attendee')),
        item_id INTEGER NOT NULL,
        seller_earning REAL NOT NULL,
        taxable_base REAL NOT NULL,
        vat_rate REAL NOT NULL,
        vat_amount REAL NOT NULL,
        vat_regime TEXT NOT NULL CHECK(vat_regime IN ('art_rebu','standard_vat')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id)
      )
    `);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_withdrawal_items_withdrawal ON withdrawal_items(withdrawal_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_withdrawal_items_lookup ON withdrawal_items(item_type, item_id)');

    // ── Stripe Connect Events (webhook idempotency + audit log) ──
    await db.execute(`
      CREATE TABLE IF NOT EXISTS stripe_connect_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripe_event_id TEXT UNIQUE NOT NULL,
        stripe_event_type TEXT NOT NULL,
        account_id TEXT,
        payload_json TEXT NOT NULL,
        processed_at DATETIME,
        processing_error TEXT,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_account ON stripe_connect_events(account_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_stripe_connect_events_type ON stripe_connect_events(stripe_event_type)');

    // ── Withdrawals ──────────────────────────────────────────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        iban TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'reversed', 'cancelled')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT NULL,
        admin_notes TEXT DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Change #2: migrate the CHECK constraint on withdrawals.status if it still
    // uses the original three-value set. SQLite does not support ALTER CHECK, so
    // we recreate the table with the expanded constraint.
    {
      const tableInfo = await db.execute(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='withdrawals'`
      );
      const ddl = tableInfo.rows[0]?.sql || '';
      if (ddl && !ddl.includes('processing')) {
        logger.info('[database] Migrating withdrawals CHECK constraint to include new status values');
        await db.execute(`
          CREATE TABLE withdrawals_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            iban TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'reversed', 'cancelled')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME DEFAULT NULL,
            admin_notes TEXT DEFAULT NULL,
            stripe_transfer_id TEXT,
            stripe_transfer_group TEXT,
            vat_regime TEXT,
            taxable_base_total REAL,
            vat_amount_total REAL,
            executed_at DATETIME,
            executed_by_admin_id INTEGER,
            failure_reason TEXT,
            reversed_at DATETIME,
            reversal_amount REAL,
            reversal_reason TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);
        await db.execute(`INSERT INTO withdrawals_new SELECT * FROM withdrawals`);
        await db.execute(`DROP TABLE withdrawals`);
        await db.execute(`ALTER TABLE withdrawals_new RENAME TO withdrawals`);
        // Recreate indexes dropped with the old table.
        await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_stripe_transfer ON withdrawals(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL`);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_withdrawals_vat_regime ON withdrawals(vat_regime)`);
        logger.info('[database] withdrawals CHECK constraint migrated successfully');
      }
    }

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
        first_mile TEXT NOT NULL DEFAULT 'dropoff' CHECK(first_mile IN ('pickup', 'dropoff', 'pickup_dropoff', 'fulfilment', '')),
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

    // ── Invoices (PDF generation tracking + numbering) ──────
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        series TEXT NOT NULL CHECK(series IN ('A','P','C','L')),
        year INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        invoice_type TEXT NOT NULL CHECK(invoice_type IN ('buyer_rebu','buyer_standard','commission','settlement_rebu')),
        order_id INTEGER,
        withdrawal_id INTEGER,
        event_attendee_id TEXT,
        issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(series, year, sequence)
      )
    `);

    // ── NFC tags (NTAG 424 DNA stickers on Certificates of Authenticity) ──
    // Each row is one physical sticker bound to one artwork. UID is the
    // chip's factory-assigned ID (7 bytes hex = 14 chars). last_counter
    // defaults to -1 so the very first tap (counter SDM = 0) is accepted
    // by `counter > last_counter`. is_permanently_locked tracks the
    // irreversible NDEF lock applied days after personalization.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS nfc_tags (
        uid TEXT PRIMARY KEY,
        art_id INTEGER NOT NULL,
        edition_number INTEGER,
        serial_label TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active','revoked','lost','damaged')),
        last_counter INTEGER NOT NULL DEFAULT -1,
        is_permanently_locked INTEGER NOT NULL DEFAULT 0,
        personalized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        personalized_by TEXT NOT NULL,
        locked_at DATETIME,
        notes TEXT,
        FOREIGN KEY (art_id) REFERENCES art(id) ON DELETE RESTRICT
      )
    `);

    // ── Verification events (audit log for every /api/coa/verify call) ──
    // Stored even for failed attempts (malformed, invalid_cmac, unknown_tag,
    // revoked, replay) so that abuse patterns can be detected. ip_hash is
    // HMAC-SHA256(ip, IP_HASH_SALT) truncated to 32 hex chars — never the
    // raw IP, for GDPR compliance.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS verification_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT,
        counter INTEGER,
        status TEXT NOT NULL
          CHECK(status IN ('ok','invalid_cmac','replay','unknown_tag','revoked','malformed')),
        ip_hash TEXT,
        user_agent TEXT,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Marketing sends (audit log + send-once guard for marketing emails) ──
    // One row per marketing broadcast attempt (Resend Broadcasts API). Doubles
    // as the idempotency guard for AUTO announcements: a successful row for
    // (kind, entity_id) prevents a second send when the entity is edited or
    // transitions through several qualifying states. `kind='new_author'` is a
    // manual action and may be re-sent, so it is NOT covered by the unique index.
    // entity_id is TEXT to fit both INTEGER user ids and TEXT auction/draw/event
    // ids. Only 'sent' and 'failed' are recorded (skips live in the log only).
    await db.execute(`
      CREATE TABLE IF NOT EXISTS marketing_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('new_author','auction','draw','event')),
        entity_id TEXT NOT NULL,
        topic_id TEXT,
        segment_id TEXT,
        resend_broadcast_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('sent','failed')),
        subject TEXT,
        error TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Column migrations (idempotent via try/catch) ─────────
    for (const sql of [
      `ALTER TABLE shipping_zones ADD COLUMN product_id INTEGER`,
      `ALTER TABLE shipping_zones ADD COLUMN product_type TEXT CHECK(product_type IN ('art','other'))`,
    ]) {
      try { await db.execute(sql); } catch { /* column already exists */ }
    }

    // ── Indexes ──────────────────────────────────────────────
    // Shipping
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_method ON shipping_zones(shipping_method_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_seller ON shipping_zones(seller_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_country ON shipping_zones(country)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_postal ON shipping_zones(postal_code)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_shipping_zones_product ON shipping_zones(product_id, product_type)`);
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
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_type, product_id, position)`);
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_basename ON product_images(basename)`);

    // Users
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_password_setup_token ON users(password_setup_token)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

    // Auctions
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_bids_buyer ON auction_bids(auction_buyer_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_buyers_auction ON auction_buyers(auction_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_auction_email_verif_email_auction ON auction_email_verifications(email, auction_id)`);

    // Events
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
    // Change #3 — partial indexes for eventCreditScheduler lookups
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_pending_credit ON events(finished_at, host_credited_at) WHERE access_type='paid' AND host_credited_at IS NULL`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_event_attendees_credit ON event_attendees(event_id, status, host_credited_at)`);

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

    // Invoices
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_withdrawal ON invoices(withdrawal_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_event_attendee ON invoices(event_attendee_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type)`);

    // Postal codes
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_postal_codes_code_country ON postal_codes(postal_code, country)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_postal_codes_province_country ON postal_codes(province, country)`);

    // NFC tags / CoA verification
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_nfc_tags_art_id ON nfc_tags(art_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_nfc_tags_status ON nfc_tags(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_verif_events_uid ON verification_events(uid)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_verif_events_status ON verification_events(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_verif_events_occurred ON verification_events(occurred_at)`);

    // Marketing sends: send-once guard (partial unique on successful AUTO sends)
    // + lookup/history indexes.
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_sends_once ON marketing_sends(kind, entity_id) WHERE status = 'sent' AND kind IN ('auction','draw','event')`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_sends_entity ON marketing_sends(kind, entity_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_marketing_sends_created ON marketing_sends(created_at)`);

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
    // ES.csv is ~1.4 MB / tens of thousands of rows and the test database is
    // recreated from scratch on every run, so the import is skipped under test
    // in favour of the handful of seed rows in tests/setup/seed.js. Set
    // SEED_POSTAL_CODES=1 when a test genuinely needs the full table.
    if (isTest && process.env.SEED_POSTAL_CODES !== '1') {
      logger.info('Test mode: skipping ES.csv postal codes import (set SEED_POSTAL_CODES=1 to force)');
      return;
    }

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
