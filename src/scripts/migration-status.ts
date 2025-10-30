import { MigrationService } from '../services/MigrationService';
import pool from '../config/db';

const migrationService = new MigrationService(pool);

const checkMigrationStatus = async () => {
  try {
    console.log('📊 Checking migration status...');
    
    const status = await migrationService.getMigrationStatus();
    
    console.log('\n📋 Migration Status:');
    console.log(`   Total migrations: ${status.total}`);
    console.log(`   Applied: ${status.applied}`);
    console.log(`   Pending: ${status.pending}`);
    
    if (status.migrations.length > 0) {
      console.log('\n📝 Migration Details:');
      status.migrations.forEach(migration => {
        const status = migration.applied ? '✅ Applied' : '⏳ Pending';
        const date = migration.appliedAt ? ` (${new Date(migration.appliedAt).toLocaleString()})` : '';
        console.log(`   ${status}: ${migration.name}${date}`);
      });
    }
    
    if (status.pending === 0) {
      console.log('\n🎉 All migrations are up to date!');
    } else {
      console.log(`\n⚠️  ${status.pending} migration(s) pending. Run 'npm run migrate' to apply them.`);
    }
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

checkMigrationStatus().catch(console.error);

