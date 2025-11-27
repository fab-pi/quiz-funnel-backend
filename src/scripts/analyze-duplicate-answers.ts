import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Detailed analysis of duplicate answers issue
 */

const QUIZ_ID = 1;

async function analyzeDuplicateAnswers() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('🔍 DETAILED ANALYSIS: Duplicate Answers Issue');
    console.log('='.repeat(80));

    // Get all sessions with their answers for question 1
    const sessionAnswers = await client.query(`
      SELECT 
        us.session_id,
        us.start_timestamp,
        us.last_question_viewed,
        us.is_completed,
        ua.answer_id,
        ua.answer_timestamp,
        ua.selected_option_id,
        ao.option_text
      FROM user_sessions us
      JOIN user_answers ua ON ua.session_id = us.session_id
      JOIN answer_options ao ON ao.option_id = ua.selected_option_id
      WHERE us.quiz_id = $1
        AND ua.question_id = 1
      ORDER BY us.session_id, ua.answer_timestamp
    `, [QUIZ_ID]);

    console.log(`\n📊 Total answers for Question 1: ${sessionAnswers.rows.length}`);
    console.log(`📊 Unique sessions: ${new Set(sessionAnswers.rows.map(r => r.session_id)).size}`);

    // Group by session
    const bySession = new Map();
    sessionAnswers.rows.forEach(row => {
      if (!bySession.has(row.session_id)) {
        bySession.set(row.session_id, []);
      }
      bySession.get(row.session_id).push(row);
    });

    console.log('\n📋 Answers per Session:');
    console.log('-'.repeat(80));
    bySession.forEach((answers, sessionId) => {
      console.log(`\nSession: ${sessionId.substring(0, 8)}...`);
      console.log(`  Start: ${answers[0].start_timestamp}`);
      console.log(`  Last Question Viewed: ${answers[0].last_question_viewed}`);
      console.log(`  Completed: ${answers[0].is_completed}`);
      console.log(`  Total Answers: ${answers.length}`);
      answers.forEach((answer: any, idx: number) => {
        console.log(`    Answer ${idx + 1}: ${answer.option_text} (${answer.answer_timestamp})`);
      });
    });

    // Check if date range filtering affects this
    console.log('\n\n📅 Testing Date Range Filtering:');
    console.log('-'.repeat(80));
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const withDateFilter = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
          AND start_timestamp >= $2
          AND start_timestamp <= $3
      )
      SELECT COUNT(*) as count
      FROM user_answers ua
      WHERE ua.question_id = 1
        AND ua.session_id IN (SELECT session_id FROM filtered_sessions)
    `, [QUIZ_ID, thirtyDaysAgo, today]);

    console.log(`Answers with date filter (last 30 days): ${withDateFilter.rows[0].count}`);
    console.log(`Answers without date filter: ${sessionAnswers.rows.length}`);

    // Check the current query logic
    console.log('\n\n🔬 Current Query Logic Analysis:');
    console.log('-'.repeat(80));
    
    const currentQueryResult = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(ua.answer_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      )
      SELECT * FROM question_answers WHERE question_id = 1
    `, [QUIZ_ID]);

    console.log(`Current query returns: ${currentQueryResult.rows[0].answers} answers`);

    // Alternative: Count unique sessions instead
    const uniqueSessionsQuery = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT ua.session_id) as unique_sessions_answered,
          COUNT(ua.answer_id) as total_answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      )
      SELECT * FROM question_answers WHERE question_id = 1
    `, [QUIZ_ID]);

    console.log(`\nAlternative (unique sessions): ${uniqueSessionsQuery.rows[0].unique_sessions_answered} unique sessions`);
    console.log(`Total answers: ${uniqueSessionsQuery.rows[0].total_answers}`);

  } finally {
    client.release();
  }
}

analyzeDuplicateAnswers()
  .then(() => {
    console.log('\n✅ Analysis complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

