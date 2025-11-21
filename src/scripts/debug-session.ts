import pool from '../config/db';
import { randomUUID } from 'crypto';

const debugSession = async () => {
  try {
    console.log('Testing session creation with exact parameters...');

    // Generate UUID for session
    const sessionId = randomUUID();
    console.log('Generated session ID:', sessionId);

    const utmParams = {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'test_quiz'
    };

    const result = await pool.query(
      `INSERT INTO user_sessions 
       (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_params)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING session_id`,
      [sessionId, 1, new Date(), 1, false, JSON.stringify(utmParams)]
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
