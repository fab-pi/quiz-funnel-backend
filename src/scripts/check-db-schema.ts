import pool from '../config/db';

const checkDBSchema = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database schema for UUID migration...\n');

    // Check user_sessions.session_id
    console.log('1. user_sessions.session_id:');
    const sessionIdInfo = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'user_sessions' AND column_name = 'session_id'
    `);
    
    if (sessionIdInfo.rows.length > 0) {
      const col = sessionIdInfo.rows[0];
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default || 'none'}`);
    } else {
      console.log('   ⚠️  Column not found!');
    }

    // Check user_answers columns
    console.log('\n2. user_answers.session_id:');
    const answerSessionIdInfo = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_answers' AND column_name = 'session_id'
    `);
    
    if (answerSessionIdInfo.rows.length > 0) {
      const col = answerSessionIdInfo.rows[0];
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default || 'none'}`);
    }

    console.log('\n3. user_answers.answer_id:');
    const answerIdInfo = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_answers' AND column_name = 'answer_id'
    `);
    
    if (answerIdInfo.rows.length > 0) {
      const col = answerIdInfo.rows[0];
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default || 'none'}`);
    }

    // Check primary keys
    console.log('\n4. Primary Keys:');
    const primaryKeys = await client.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name,
        c.data_type
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.columns c
        ON kcu.table_name = c.table_name 
        AND kcu.column_name = c.column_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name IN ('user_sessions', 'user_answers')
    `);
    
    primaryKeys.rows.forEach(row => {
      console.log(`   ${row.table_name}.${row.column_name}: ${row.data_type}`);
    });

    // Test INSERT
    console.log('\n5. Testing UUID INSERT:');
    const testUUID = '550e8400-e29b-41d4-a716-446655440000';
    try {
      const testResult = await client.query(`
        INSERT INTO user_sessions 
        (session_id, quiz_id, start_timestamp, is_completed)
        VALUES ($1::uuid, $2, $3, $4)
        RETURNING session_id
      `, [testUUID, 1, new Date(), false]);
      
      console.log(`   ✅ Test INSERT successful: ${testResult.rows[0].session_id}`);
      
      // Clean up
      await client.query('DELETE FROM user_sessions WHERE session_id = $1', [testUUID]);
      console.log('   ✅ Test data cleaned up');
    } catch (error: any) {
      console.log(`   ❌ Test INSERT failed: ${error.message}`);
      console.log(`   Error code: ${error.code}`);
    }

    // Check latest session
    console.log('\n6. Latest session in database:');
    const latestSession = await client.query(`
      SELECT session_id, quiz_id, start_timestamp 
      FROM user_sessions 
      ORDER BY start_timestamp DESC 
      LIMIT 1
    `);
    
    if (latestSession.rows.length > 0) {
      const sess = latestSession.rows[0];
      console.log(`   session_id: ${sess.session_id} (type: ${typeof sess.session_id})`);
      console.log(`   quiz_id: ${sess.quiz_id}`);
      console.log(`   timestamp: ${sess.start_timestamp}`);
    } else {
      console.log('   No sessions found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
};

checkDBSchema().catch(console.error);

