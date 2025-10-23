const { initializeDatabase } = require('./config/database');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    await initializeDatabase();
    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
