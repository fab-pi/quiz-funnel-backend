import pool from '../config/db';

const checkUserSessions = async () => {
  try {
    console.log('Checking user_sessions table schema...');

    // Check user_sessions table structure
    const userSessionsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'user_sessions'
      ORDER BY ordinal_position
    `);
    
    console.log('User_sessions table schema:');
    userSessionsSchema.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Try to insert a test session
    console.log('\nTesting session insertion...');
    const testResult = await pool.query(`
      INSERT INTO user_sessions 
      (session_id, quiz_id, last_question_viewed, is_completed, utm_source)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING session_id
    `, ['test-session-123', 1, 0, false, 'test']);

    console.log('✓ Test session inserted:', testResult.rows[0].session_id);

    // Clean up test data
    await pool.query('DELETE FROM user_sessions WHERE session_id = $1', ['test-session-123']);
    console.log('✓ Test data cleaned up');

  } catch (error) {
    console.error('Error checking user_sessions:', error);
  } finally {
    await pool.end();
  }
};

checkUserSessions().catch(console.error);
