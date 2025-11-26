const { Pool } = require('pg');
require('dotenv').config();

// Main pool for write operations
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'analytics_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // Increased pool size for better concurrency
  max: parseInt(process.env.DB_POOL_MAX) || 50,
  min: parseInt(process.env.DB_POOL_MIN) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Enable query timeout to prevent long-running queries
  query_timeout: 30000,
  // Connection retry
  application_name: 'analytics_api',
  // Prepared statements for better performance
  statement_timeout: 30000,
  max_lifetime_seconds: 3600, // Recycle connections after 1 hour
});

// Read replica pool for read-heavy operations (falls back to main pool if not configured)
const readPool = process.env.DB_READ_HOST ? new Pool({
  host: process.env.DB_READ_HOST,
  port: process.env.DB_READ_PORT || 5432,
  database: process.env.DB_NAME || 'analytics_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_READ_POOL_MAX) || 100,
  min: parseInt(process.env.DB_READ_POOL_MIN) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  query_timeout: 30000,
  application_name: 'analytics_api_read',
  statement_timeout: 30000,
  max_lifetime_seconds: 3600,
}) : pool;

// Events
pool.on('connect', (client) => {
  console.log('Database write connection established');
  // Set session parameters for optimal performance
  client.query('SET statement_timeout = 30000');
  client.query('SET lock_timeout = 10000');
});

pool.on('error', (err) => {
  console.error('Unexpected database write error:', err);
  // Don't exit immediately, let the pool recover
});

pool.on('remove', () => {
  console.log('Database write connection removed from pool');
});

if (readPool !== pool) {
  readPool.on('connect', (client) => {
    console.log('Database read connection established');
    client.query('SET statement_timeout = 30000');
    client.query('SET lock_timeout = 10000');
  });

  readPool.on('error', (err) => {
    console.error('Unexpected database read error:', err);
  });
}

// Query helper for write operations
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow query detected', { duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Query helper for read operations (uses read replica if available)
const queryRead = async (text, params) => {
  const start = Date.now();
  try {
    const res = await readPool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow read query detected', { duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database read query error:', error);
    throw error;
  }
};

// Batch insert helper for high-throughput inserts
const batchInsert = async (table, columns, values, batchSize = 1000) => {
  if (!values || values.length === 0) {
    return { rowCount: 0 };
  }

  const client = await pool.connect();
  let totalRows = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map((_, batchIdx) => {
        const offset = batchIdx * columns.length;
        return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(',')})`;
      }).join(',');

      const flatValues = batch.flat();
      const text = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`;

      const res = await client.query(text, flatValues);
      totalRows += res.rowCount;
    }

    await client.query('COMMIT');
    return { rowCount: totalRows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Health check helper
const healthCheck = async () => {
  try {
    const writeCheck = await pool.query('SELECT 1 as health');
    const readCheck = await readPool.query('SELECT 1 as health');
    return {
      write: writeCheck.rows[0].health === 1,
      read: readCheck.rows[0].health === 1,
      writePoolSize: pool.totalCount,
      readPoolSize: readPool.totalCount,
      writeIdleCount: pool.idleCount,
      readIdleCount: readPool.idleCount,
      writeWaitingCount: pool.waitingCount,
      readWaitingCount: readPool.waitingCount,
    };
  } catch (error) {
    throw error;
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Closing database connections...');
  await pool.end();
  if (readPool !== pool) {
    await readPool.end();
  }
  console.log('Database connections closed');
};

module.exports = {
  pool,
  readPool,
  query,
  queryRead,
  transaction,
  batchInsert,
  healthCheck,
  shutdown,
};

