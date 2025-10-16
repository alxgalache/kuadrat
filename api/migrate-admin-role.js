const { db } = require('./config/database');

async function migrateAdminRole() {
  try {
    console.log('Starting migration to add admin role...');

    // Disable foreign key constraints temporarily
    await db.execute('PRAGMA foreign_keys = OFF');
    console.log('Disabled foreign key constraints');

    // Backup existing users
    const usersResult = await db.execute({
      sql: 'SELECT * FROM users',
      args: []
    });
    const existingUsers = usersResult.rows;
    console.log(`Found ${existingUsers.length} existing users`);

    // Drop existing users table
    await db.execute('DROP TABLE IF EXISTS users');
    console.log('Dropped old users table');

    // Recreate users table with admin role
    await db.execute(`
      CREATE TABLE users (
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
    console.log('Created new users table with admin role');

    // Restore existing users
    for (const user of existingUsers) {
      await db.execute({
        sql: `INSERT INTO users (id, email, password_hash, role, full_name, slug, profile_img, location, bio, email_contact, visible, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          user.id,
          user.email,
          user.password_hash,
          user.role,
          user.full_name || null,
          user.slug || null,
          user.profile_img || null,
          user.location || null,
          user.bio || null,
          user.email_contact || null,
          user.visible || 0,
          user.created_at
        ]
      });
    }
    console.log('Restored existing users');

    // Re-enable foreign key constraints
    await db.execute('PRAGMA foreign_keys = ON');
    console.log('Re-enabled foreign key constraints');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    // Try to re-enable foreign keys even on error
    try {
      await db.execute('PRAGMA foreign_keys = ON');
    } catch (e) {}
    process.exit(1);
  }
}

migrateAdminRole();
