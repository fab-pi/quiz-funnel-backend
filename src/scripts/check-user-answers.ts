import pool from '../config/db';

const checkUserAnswers = async () => {
  try {
    console.log('Checking user_answers table schema...');

    // Check user_answers table structure
    const userAnswersSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'user_answers'
      ORDER BY ordinal_position
    `);
    
    console.log('User_answers table schema:');
    userAnswersSchema.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

  } catch (error) {
    console.error('Error checking user_answers:', error);
  } finally {
    await pool.end();
  }
};

checkUserAnswers().catch(console.error);
