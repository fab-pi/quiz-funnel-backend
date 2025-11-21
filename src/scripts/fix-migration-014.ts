import pool from '../config/db';

/**
 * Fix script for Migration 014
 * This script handles the case where migration 014 left NULL values
 * It will:
 * 1. Check current state
 * 2. Generate UUIDs for NULL session_id and answer_id values
 * 3. Fix foreign key relationships
 */
const fixMigration014 = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing Migration 014 issues...\n');

    // Check current state
    console.log('1. Checking current state...');
    const sessionsCheck = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(session_id) as non_null,
        COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_count
      FROM user_sessions
    `);
    
    const answersCheck = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(session_id) as non_null_session,
        COUNT(answer_id) as non_null_answer,
        COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_session,
        COUNT(CASE WHEN answer_id IS NULL THEN 1 END) as null_answer
      FROM user_answers
    `);

    console.log(`   user_sessions: ${sessionsCheck.rows[0].total} total, ${sessionsCheck.rows[0].non_null} non-null, ${sessionsCheck.rows[0].null_count} NULL`);
    console.log(`   user_answers: ${answersCheck.rows[0].total} total`);
    console.log(`     session_id: ${answersCheck.rows[0].non_null_session} non-null, ${answersCheck.rows[0].null_session} NULL`);
    console.log(`     answer_id: ${answersCheck.rows[0].non_null_answer} non-null, ${answersCheck.rows[0].null_answer} NULL`);

    // Check column types
    const sessionIdType = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_sessions' AND column_name = 'session_id'
    `);
    
    const answerIdType = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_answers' AND column_name = 'answer_id'
    `);

    console.log(`\n2. Column types:`);
    console.log(`   user_sessions.session_id: ${sessionIdType.rows[0]?.data_type || 'NOT FOUND'}`);
    console.log(`   user_answers.answer_id: ${answerIdType.rows[0]?.data_type || 'NOT FOUND'}`);

    // Fix user_sessions.session_id
    if (sessionsCheck.rows[0].null_count > 0) {
      console.log(`\n3. Fixing user_sessions.session_id (${sessionsCheck.rows[0].null_count} NULL values)...`);
      
      if (sessionIdType.rows[0]?.data_type === 'uuid') {
        // Column is UUID type, just need to populate NULLs
        const result = await client.query(`
          UPDATE user_sessions 
          SET session_id = gen_random_uuid()
          WHERE session_id IS NULL
        `);
        console.log(`   ✅ Updated ${result.rowCount} rows with UUIDs`);
      } else {
        console.log('   ⚠️  session_id is not UUID type. Migration might have failed.');
        console.log('   Please check the migration status manually.');
        return;
      }
    } else {
      console.log(`\n3. user_sessions.session_id: ✅ All values are populated`);
    }

    // Fix user_answers.answer_id
    if (answersCheck.rows[0].null_answer > 0) {
      console.log(`\n4. Fixing user_answers.answer_id (${answersCheck.rows[0].null_answer} NULL values)...`);
      
      if (answerIdType.rows[0]?.data_type === 'uuid') {
        const result = await client.query(`
          UPDATE user_answers 
          SET answer_id = gen_random_uuid()
          WHERE answer_id IS NULL
        `);
        console.log(`   ✅ Updated ${result.rowCount} rows with UUIDs`);
      } else {
        console.log('   ⚠️  answer_id is not UUID type. Migration might have failed.');
      }
    } else {
      console.log(`\n4. user_answers.answer_id: ✅ All values are populated`);
    }

    // Fix user_answers.session_id (this is trickier - need to match with user_sessions)
    if (answersCheck.rows[0].null_session > 0) {
      console.log(`\n5. Fixing user_answers.session_id (${answersCheck.rows[0].null_session} NULL values)...`);
      console.log('   ⚠️  This is problematic - answers without session_id cannot be matched.');
      console.log('   These answers will be deleted as they are orphaned.');
      
      // Check if there's a way to match them (unlikely, but check)
      const orphanedAnswers = await client.query(`
        SELECT COUNT(*) as count
        FROM user_answers
        WHERE session_id IS NULL
      `);
      
      console.log(`   Found ${orphanedAnswers.rows[0].count} orphaned answers.`);
      console.log('   These cannot be matched to sessions and will be deleted.');
      
      const deleteResult = await client.query(`
        DELETE FROM user_answers
        WHERE session_id IS NULL
      `);
      console.log(`   ✅ Deleted ${deleteResult.rowCount} orphaned answers`);
    } else {
      console.log(`\n5. user_answers.session_id: ✅ All values are populated`);
    }

    // Verify final state
    console.log('\n6. Verifying final state...');
    const finalSessions = await client.query(`
      SELECT COUNT(*) as total, COUNT(session_id) as non_null
      FROM user_sessions
    `);
    
    const finalAnswers = await client.query(`
      SELECT COUNT(*) as total, COUNT(session_id) as non_null_session, COUNT(answer_id) as non_null_answer
      FROM user_answers
    `);

    console.log(`   user_sessions: ${finalSessions.rows[0].total} total, ${finalSessions.rows[0].non_null} with session_id`);
    console.log(`   user_answers: ${finalAnswers.rows[0].total} total`);
    console.log(`     ${finalAnswers.rows[0].non_null_session} with session_id, ${finalAnswers.rows[0].non_null_answer} with answer_id`);

    if (finalSessions.rows[0].non_null === finalSessions.rows[0].total &&
        finalAnswers.rows[0].non_null_session === finalAnswers.rows[0].total &&
        finalAnswers.rows[0].non_null_answer === finalAnswers.rows[0].total) {
      console.log('\n✅ All NULL values have been fixed!');
    } else {
      console.log('\n⚠️  Some NULL values remain. Please check manually.');
    }

  } catch (error) {
    console.error('❌ Error fixing migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

fixMigration014().catch(console.error);

