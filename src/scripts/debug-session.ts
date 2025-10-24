import pool from '../config/db';

const debugSession = async () => {
  try {
    console.log('Testing session creation with exact parameters...');

    // Test the exact query from the route
    const sessionId = Math.floor(Math.random() * 1000000) + 1000;
    console.log('Generated session ID:', sessionId);

    const result = await pool.query(
      `INSERT INTO user_sessions 
       (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING session_id`,
      [sessionId, 1, new Date(), 1, false, 'google', 'cpc', 'test_quiz']
    );

    console.log('✅ Session created successfully:', result.rows[0].session_id);

    // Clean up
    await pool.query('DELETE FROM user_sessions WHERE session_id = $1', [result.rows[0].session_id]);
    console.log('✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Error creating session:', error);
  } finally {
    await pool.end();
  }
};

debugSession().catch(console.error);
