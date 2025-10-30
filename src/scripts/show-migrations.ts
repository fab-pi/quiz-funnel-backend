import pool from '../config/db';

const showMigrations = async () => {
  try {
    console.log('📋 Current Migrations Table Contents:');
    console.log('=====================================');
    
    const result = await pool.query('SELECT * FROM migrations ORDER BY id');
    
    if (result.rows.length === 0) {
      console.log('No migrations found.');
      return;
    }
    
    result.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. Migration Record:`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Name: ${row.migration_name}`);
      console.log(`   Applied At: ${new Date(row.applied_at).toLocaleString()}`);
      console.log(`   Checksum: ${row.checksum.substring(0, 16)}...`);
    });
    
    console.log(`\n📊 Total Migrations Applied: ${result.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
};

showMigrations().catch(console.error);

