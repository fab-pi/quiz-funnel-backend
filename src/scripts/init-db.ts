import { MigrationService } from '../services/MigrationService';
import pool from '../config/db';

const initializeDatabase = async () => {
  try {
    console.log('🚀 Initializing database...');
    
    // Run migrations first
    const migrationService = new MigrationService(pool);
    await migrationService.runMigrations();
    
    console.log('✅ Database initialization completed successfully!');
    console.log('\n📋 Available commands:');
    console.log('   npm run migrate          - Run pending migrations');
    console.log('   npm run migration-status - Check migration status');
    console.log('   npm run seed            - Seed database with test data');
    console.log('   npm run check-schema    - Check database schema');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

initializeDatabase().catch(console.error);

