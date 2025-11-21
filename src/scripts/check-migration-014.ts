import pool from '../config/db';

const checkMigration014 = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Migration 014 status...\n');

    // 1. Check user_sessions table structure
    console.log('1. Checking user_sessions table structure:');
    const sessionsSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_sessions'
      ORDER BY ordinal_position
    `);
    
    sessionsSchema.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
    });

    // 2. Check user_answers table structure
    console.log('\n2. Checking user_answers table structure:');
    const answersSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_answers'
      ORDER BY ordinal_position
    `);
    
    answersSchema.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default || 'none'})`);
    });

    // 3. Check for temporary columns
    console.log('\n3. Checking for temporary columns (session_id_new, answer_id_new):');
    const tempColumns = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE (table_name = 'user_sessions' OR table_name = 'user_answers')
        AND (column_name LIKE '%_new' OR column_name LIKE '%new%')
    `);
    
    if (tempColumns.rows.length > 0) {
      console.log('   ⚠️  Found temporary columns (migration might be incomplete):');
      tempColumns.rows.forEach(row => {
        console.log(`   - ${row.table_name}.${row.column_name}`);
      });
    } else {
      console.log('   ✅ No temporary columns found');
    }

    // 4. Check data counts
    console.log('\n4. Checking data:');
    const sessionsCount = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(session_id) as non_null_session_id,
        COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_session_id
      FROM user_sessions
    `);
    
    const answersCount = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(session_id) as non_null_session_id,
        COUNT(answer_id) as non_null_answer_id,
        COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_session_id,
        COUNT(CASE WHEN answer_id IS NULL THEN 1 END) as null_answer_id
      FROM user_answers
    `);

    console.log('   user_sessions:');
    console.log(`     Total rows: ${sessionsCount.rows[0].total}`);
    console.log(`     Non-null session_id: ${sessionsCount.rows[0].non_null_session_id}`);
    console.log(`     NULL session_id: ${sessionsCount.rows[0].null_session_id}`);
    
    console.log('   user_answers:');
    console.log(`     Total rows: ${answersCount.rows[0].total}`);
    console.log(`     Non-null session_id: ${answersCount.rows[0].non_null_session_id}`);
    console.log(`     NULL session_id: ${answersCount.rows[0].null_session_id}`);
    console.log(`     Non-null answer_id: ${answersCount.rows[0].non_null_answer_id}`);
    console.log(`     NULL answer_id: ${answersCount.rows[0].null_answer_id}`);

    // 5. Check primary keys
    console.log('\n5. Checking primary keys:');
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
      console.log(`   ${row.table_name}.${row.column_name} (${row.data_type})`);
    });

    // 6. Check foreign keys
    console.log('\n6. Checking foreign keys:');
    const foreignKeys = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'user_answers'
        AND kcu.column_name = 'session_id'
    `);
    
    if (foreignKeys.rows.length > 0) {
      foreignKeys.rows.forEach(row => {
        console.log(`   ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
      });
    } else {
      console.log('   ⚠️  No foreign key found on user_answers.session_id');
    }

    // 7. Sample data
    console.log('\n7. Sample data (first 3 rows):');
    const sampleSessions = await client.query('SELECT session_id, quiz_id, start_timestamp FROM user_sessions LIMIT 3');
    console.log('   user_sessions:');
    sampleSessions.rows.forEach((row, i) => {
      console.log(`     Row ${i + 1}: session_id=${row.session_id}, quiz_id=${row.quiz_id}`);
    });

    const sampleAnswers = await client.query('SELECT answer_id, session_id, question_id FROM user_answers LIMIT 3');
    console.log('   user_answers:');
    sampleAnswers.rows.forEach((row, i) => {
      console.log(`     Row ${i + 1}: answer_id=${row.answer_id}, session_id=${row.session_id}, question_id=${row.question_id}`);
    });

  } catch (error) {
    console.error('❌ Error checking migration:', error);
  } finally {
    client.release();
    await pool.end();
  }
};

checkMigration014().catch(console.error);

