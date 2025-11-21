import pool from '../config/db';
import { randomUUID } from 'crypto';

const testUUIDInsert = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testing UUID INSERT directly...\n');

    const testSessionId = randomUUID();
    console.log(`Generated UUID: ${testSessionId}`);
    console.log(`Type: ${typeof testSessionId}`);

    // Test the exact INSERT from SessionService
    console.log('\n1. Testing INSERT (exact code from SessionService):');
    try {
      const result = await client.query(
        `INSERT INTO user_sessions 
         (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_params)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING session_id`,
        [
          testSessionId,
          1,
          new Date(),
          null,
          false,
          null
        ]
      );
      
      console.log(`   ✅ INSERT successful`);
      console.log(`   Returned session_id: ${result.rows[0].session_id}`);
      console.log(`   Returned type: ${typeof result.rows[0].session_id}`);
      
      // Verify it's actually in the database
      const verify = await client.query(
        'SELECT session_id, quiz_id, start_timestamp FROM user_sessions WHERE session_id = $1',
        [testSessionId]
      );
      
      if (verify.rows.length > 0) {
        console.log(`   ✅ Verified in database: ${verify.rows[0].session_id}`);
      } else {
        console.log(`   ❌ NOT FOUND in database after INSERT!`);
      }
      
      // Clean up
      await client.query('DELETE FROM user_sessions WHERE session_id = $1', [testSessionId]);
      console.log('   ✅ Test data cleaned up');
      
    } catch (error: any) {
      console.log(`   ❌ INSERT failed: ${error.message}`);
      console.log(`   Error code: ${error.code}`);
      console.log(`   Error detail: ${error.detail}`);
      console.log(`   Error hint: ${error.hint}`);
    }

    // Test with explicit UUID cast
    console.log('\n2. Testing INSERT with explicit UUID cast:');
    const testSessionId2 = randomUUID();
    try {
      const result2 = await client.query(
        `INSERT INTO user_sessions 
         (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_params)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
         RETURNING session_id`,
        [
          testSessionId2,
          1,
          new Date(),
          null,
          false,
          null
        ]
      );
      
      console.log(`   ✅ INSERT with cast successful`);
      console.log(`   Returned: ${result2.rows[0].session_id}`);
      
      // Clean up
      await client.query('DELETE FROM user_sessions WHERE session_id = $1', [testSessionId2]);
      
    } catch (error: any) {
      console.log(`   ❌ INSERT with cast failed: ${error.message}`);
    }

    // Check what's actually in the database right now
    console.log('\n3. Checking actual database state:');
    const currentSessions = await client.query(`
      SELECT session_id, quiz_id, start_timestamp 
      FROM user_sessions 
      ORDER BY start_timestamp DESC 
      LIMIT 3
    `);
    
    console.log(`   Found ${currentSessions.rows.length} recent sessions:`);
    currentSessions.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. session_id: ${row.session_id} (${typeof row.session_id}), quiz_id: ${row.quiz_id}, time: ${row.start_timestamp}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
};

testUUIDInsert().catch(console.error);

