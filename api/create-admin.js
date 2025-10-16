const { db } = require('./config/database');
const bcrypt = require('bcrypt');

async function createAdminUser() {
  try {
    const email = 'admin@test.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if admin user already exists
    const existingUser = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });

    if (existingUser.rows.length > 0) {
      console.log('Admin user already exists');
      // Update existing user to admin role
      await db.execute({
        sql: 'UPDATE users SET role = ? WHERE email = ?',
        args: ['admin', email]
      });
      console.log('Updated existing user to admin role');
    } else {
      // Create new admin user
      await db.execute({
        sql: `INSERT INTO users (email, password_hash, role, full_name)
              VALUES (?, ?, ?, ?)`,
        args: [email, hashedPassword, 'admin', 'Admin User']
      });
      console.log('Admin user created successfully');
    }

    console.log('\nAdmin credentials:');
    console.log('Email: admin@test.com');
    console.log('Password: admin123');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
