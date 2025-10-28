import { MigrationService } from '../services/MigrationService';
import pool from '../config/db';

const migrationService = new MigrationService(pool);

const runMigrations = async () => {
  try {
    console.log('🚀 Starting database migrations...');
    await migrationService.runMigrations();
    console.log('✅ Migration process completed successfully!');
  } catch (error) {
    console.error('❌ Migration process failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigrations().catch(console.error);
