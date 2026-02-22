const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * Execute multiple SQL statements as an atomic batch using Turso's batch API.
 * All statements succeed or all fail together (transaction semantics).
 *
 * @param {Array<{sql: string, args: Array}>} statements - Array of SQL statements with args
 * @returns {Promise<Array>} Array of results for each statement
 */
async function executeBatch(statements) {
  if (!statements || statements.length === 0) {
    return [];
  }

  try {
    const results = await db.batch(statements, 'write');
    return results;
  } catch (err) {
    logger.error({ err, statementCount: statements.length }, 'Transaction batch failed');
    throw err;
  }
}

/**
 * Build a batch of statements and execute them atomically.
 * Provides a builder pattern for constructing transaction batches.
 *
 * Usage:
 *   const batch = createBatch();
 *   batch.add('UPDATE art SET is_sold = 1 WHERE id = ?', [artId]);
 *   batch.add('UPDATE orders SET status = ? WHERE id = ?', ['paid', orderId]);
 *   const results = await batch.execute();
 *
 * @returns {{ add: Function, execute: Function, size: Function }}
 */
function createBatch() {
  const statements = [];

  return {
    add(sql, args = []) {
      statements.push({ sql, args });
      return this;
    },

    size() {
      return statements.length;
    },

    async execute() {
      return executeBatch(statements);
    },
  };
}

module.exports = { executeBatch, createBatch };
