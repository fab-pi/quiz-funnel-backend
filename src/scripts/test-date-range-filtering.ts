import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test script to verify date range filtering works correctly for answers
 */

const QUIZ_ID = 1;

async function testDateRangeFiltering() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('🧪 TESTING: Date Range Filtering for Answers');
    console.log('='.repeat(80));

    // First, get all answers with their timestamps
    const allAnswers = await client.query(`
      SELECT 
        ua.answer_id,
        ua.answer_timestamp,
        us.start_timestamp as session_start,
        q.question_id,
        q.question_text
      FROM user_answers ua
      JOIN user_sessions us ON us.session_id = ua.session_id
      JOIN questions q ON q.question_id = ua.question_id
      WHERE us.quiz_id = $1
      ORDER BY ua.answer_timestamp
    `, [QUIZ_ID]);

    console.log(`\n📊 Total answers in database: ${allAnswers.rows.length}`);
    console.log('\nAnswer timestamps:');
    allAnswers.rows.forEach((row: any, idx: number) => {
      console.log(`  ${idx + 1}. Answer ${row.answer_id.substring(0, 8)}... - Question ${row.question_id} - ${row.answer_timestamp}`);
    });

    // Test 1: No date filter (should return all)
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 1: No Date Filter');
    console.log('='.repeat(80));
    
    const noFilter = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT ua.session_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      )
      SELECT * FROM question_answers ORDER BY question_id
    `, [QUIZ_ID]);

    console.log('Results (no filter):');
    noFilter.rows.forEach((row: any) => {
      console.log(`  Question ${row.question_id}: ${row.answers} answers`);
    });

    // Test 2: Date filter - last 7 days
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 2: Date Filter - Last 7 Days');
    console.log('='.repeat(80));
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    console.log(`Date range: ${sevenDaysAgo.toISOString()} to ${today.toISOString()}`);

    // Count answers in this range
    const answersInRange = allAnswers.rows.filter((row: any) => {
      const answerDate = new Date(row.answer_timestamp);
      return answerDate >= sevenDaysAgo && answerDate <= today;
    });
    console.log(`\nExpected answers in range: ${answersInRange.length}`);

    const withFilter = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT ua.session_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
          AND ua.answer_timestamp >= $2
          AND ua.answer_timestamp <= $3
        GROUP BY q.question_id
      )
      SELECT * FROM question_answers ORDER BY question_id
    `, [QUIZ_ID, sevenDaysAgo, today]);

    console.log('\nResults (with date filter):');
    withFilter.rows.forEach((row: any) => {
      console.log(`  Question ${row.question_id}: ${row.answers} answers`);
    });

    // Test 3: Date filter - specific date range (e.g., only today)
    console.log('\n\n' + '='.repeat(80));
    console.log('TEST 3: Date Filter - Only Today');
    console.log('='.repeat(80));
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    console.log(`Date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

    const answersToday = allAnswers.rows.filter((row: any) => {
      const answerDate = new Date(row.answer_timestamp);
      return answerDate >= todayStart && answerDate <= todayEnd;
    });
    console.log(`\nExpected answers today: ${answersToday.length}`);

    const todayFilter = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT ua.session_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
          AND ua.answer_timestamp >= $2
          AND ua.answer_timestamp <= $3
        GROUP BY q.question_id
      )
      SELECT * FROM question_answers ORDER BY question_id
    `, [QUIZ_ID, todayStart, todayEnd]);

    console.log('\nResults (today only):');
    todayFilter.rows.forEach((row: any) => {
      console.log(`  Question ${row.question_id}: ${row.answers} answers`);
    });

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total answers: ${allAnswers.rows.length}`);
    console.log(`Answers in last 7 days: ${answersInRange.length}`);
    console.log(`Answers today: ${answersToday.length}`);
    
    if (noFilter.rows[0]?.answers !== allAnswers.rows.length) {
      console.log('\n⚠️  WARNING: No filter count does not match total answers');
    } else {
      console.log('\n✅ No filter count matches total answers');
    }

    console.log('\n✅ Test complete!');
    
  } finally {
    client.release();
  }
}

testDateRangeFiltering()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

