module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'services/**/*.js',
    'routes/**/*.js',
  ],
  // Everything under tests/setup and tests/helpers is infrastructure, not specs.
  testPathIgnorePatterns: ['/node_modules/', '/tests/setup/', '/tests/helpers/'],
  // Runs in every worker before any module under test is required, so the test
  // environment is in place when config/env.js and config/database.js load.
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  // Runs after the test framework is installed; registers per-file cleanup.
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.js'],
  // Builds and tears down the local SQLite database used by the whole suite.
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  // A single SQLite file shared by parallel workers would deadlock on writes.
  maxWorkers: 1,
};
