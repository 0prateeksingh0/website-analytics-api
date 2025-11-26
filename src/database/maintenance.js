/**
 * Database Maintenance Script
 * 
 * This script handles:
 * - Creating future partitions for analytics_events table
 * - Dropping old partitions based on retention policy
 * - Refreshing materialized views
 * - Analyzing tables for query optimization
 * 
 * Run this script periodically (e.g., via cron job or scheduled task)
 */

const { query } = require('./db');

/**
 * Create partitions for the next N months
 */
async function createFuturePartitions(monthsAhead = 6) {
  console.log(`Creating partitions for the next ${monthsAhead} months...`);
  try {
    await query('SELECT create_future_partitions($1)', [monthsAhead]);
    console.log('✓ Future partitions created successfully');
    return true;
  } catch (error) {
    console.error('✗ Error creating future partitions:', error.message);
    return false;
  }
}

/**
 * Drop old partitions based on retention policy
 */
async function dropOldPartitions(monthsToKeep = 12) {
  console.log(`Dropping partitions older than ${monthsToKeep} months...`);
  try {
    await query('SELECT drop_old_partitions($1)', [monthsToKeep]);
    console.log('✓ Old partitions dropped successfully');
    return true;
  } catch (error) {
    console.error('✗ Error dropping old partitions:', error.message);
    return false;
  }
}

/**
 * Refresh materialized views
 */
async function refreshMaterializedViews() {
  console.log('Refreshing materialized views...');
  try {
    await query('SELECT refresh_daily_analytics()');
    console.log('✓ Materialized views refreshed successfully');
    return true;
  } catch (error) {
    console.error('✗ Error refreshing materialized views:', error.message);
    return false;
  }
}

/**
 * Analyze tables for query optimization
 */
async function analyzeTables() {
  console.log('Analyzing tables...');
  const tables = ['users', 'apps', 'api_keys', 'analytics_events'];
  
  try {
    for (const table of tables) {
      await query(`ANALYZE ${table}`);
      console.log(`✓ Analyzed table: ${table}`);
    }
    return true;
  } catch (error) {
    console.error('✗ Error analyzing tables:', error.message);
    return false;
  }
}

/**
 * Vacuum tables to reclaim storage
 */
async function vacuumTables() {
  console.log('Vacuuming tables...');
  const tables = ['users', 'apps', 'api_keys'];
  
  try {
    for (const table of tables) {
      await query(`VACUUM ANALYZE ${table}`);
      console.log(`✓ Vacuumed table: ${table}`);
    }
    return true;
  } catch (error) {
    console.error('✗ Error vacuuming tables:', error.message);
    return false;
  }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  console.log('Fetching database statistics...');
  try {
    // Get table sizes
    const sizeResult = await query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY size_bytes DESC;
    `);

    console.log('\nTable Sizes:');
    sizeResult.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.size}`);
    });

    // Get partition information
    const partitionResult = await query(`
      SELECT 
        c.relname as partition_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size
      FROM pg_inherits
      JOIN pg_class c ON c.oid = pg_inherits.inhrelid
      JOIN pg_class p ON p.oid = pg_inherits.inhparent
      WHERE p.relname = 'analytics_events'
      ORDER BY c.relname;
    `);

    console.log('\nPartition Sizes:');
    partitionResult.rows.forEach(row => {
      console.log(`  ${row.partition_name}: ${row.size}`);
    });

    // Get index sizes
    const indexResult = await query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY pg_relation_size(indexname::regclass) DESC
      LIMIT 10;
    `);

    console.log('\nTop 10 Largest Indexes:');
    indexResult.rows.forEach(row => {
      console.log(`  ${row.indexname} (${row.tablename}): ${row.size}`);
    });

    return true;
  } catch (error) {
    console.error('✗ Error fetching database stats:', error.message);
    return false;
  }
}

/**
 * Run all maintenance tasks
 */
async function runMaintenance(options = {}) {
  const {
    createPartitions = true,
    dropPartitions = false,
    refreshViews = true,
    analyze = true,
    vacuum = false,
    showStats = true,
    monthsAhead = 6,
    monthsToKeep = 12,
  } = options;

  console.log('=== Database Maintenance Started ===\n');
  const startTime = Date.now();

  const results = {
    success: [],
    failed: [],
  };

  if (createPartitions) {
    const success = await createFuturePartitions(monthsAhead);
    (success ? results.success : results.failed).push('Create Partitions');
  }

  if (dropPartitions) {
    const success = await dropOldPartitions(monthsToKeep);
    (success ? results.success : results.failed).push('Drop Old Partitions');
  }

  if (refreshViews) {
    const success = await refreshMaterializedViews();
    (success ? results.success : results.failed).push('Refresh Views');
  }

  if (analyze) {
    const success = await analyzeTables();
    (success ? results.success : results.failed).push('Analyze Tables');
  }

  if (vacuum) {
    const success = await vacuumTables();
    (success ? results.success : results.failed).push('Vacuum Tables');
  }

  if (showStats) {
    const success = await getDatabaseStats();
    (success ? results.success : results.failed).push('Database Stats');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n=== Database Maintenance Completed ===');
  console.log(`Duration: ${duration}s`);
  console.log(`Successful: ${results.success.length}`);
  console.log(`Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('Failed tasks:', results.failed.join(', '));
  }

  return results.failed.length === 0;
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    createPartitions: !args.includes('--no-create-partitions'),
    dropPartitions: args.includes('--drop-old-partitions'),
    refreshViews: !args.includes('--no-refresh-views'),
    analyze: !args.includes('--no-analyze'),
    vacuum: args.includes('--vacuum'),
    showStats: !args.includes('--no-stats'),
  };

  runMaintenance(options)
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  createFuturePartitions,
  dropOldPartitions,
  refreshMaterializedViews,
  analyzeTables,
  vacuumTables,
  getDatabaseStats,
  runMaintenance,
};

