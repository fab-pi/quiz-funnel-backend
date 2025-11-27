import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Comprehensive test script to analyze analytics queries and data integrity
 * Tests quiz_id = 1 as specified by the user
 */

const QUIZ_ID = 1;

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  data?: any;
  issues?: string[];
}

const results: TestResult[] = [];

async function runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
  try {
    console.log(`\n🧪 Running: ${testName}`);
    const result = await testFn();
    results.push({
      testName,
      passed: true,
      message: 'Test passed',
      data: result
    });
    console.log(`✅ PASSED: ${testName}`);
  } catch (error: any) {
    results.push({
      testName,
      passed: false,
      message: error.message || 'Test failed',
      issues: [error.message]
    });
    console.log(`❌ FAILED: ${testName} - ${error.message}`);
  }
}

async function test1_RawDataCounts() {
  const client = await pool.connect();
  try {
    // Count total sessions for quiz
    const sessionsResult = await client.query(
      'SELECT COUNT(*) as total FROM user_sessions WHERE quiz_id = $1',
      [QUIZ_ID]
    );
    const totalSessions = parseInt(sessionsResult.rows[0].total);

    // Count total answers for quiz
    const answersResult = await client.query(`
      SELECT COUNT(*) as total
      FROM user_answers ua
      JOIN user_sessions us ON us.session_id = ua.session_id
      WHERE us.quiz_id = $1
    `, [QUIZ_ID]);
    const totalAnswers = parseInt(answersResult.rows[0].total);

    // Count answers per question
    const answersPerQuestion = await client.query(`
      SELECT 
        q.question_id,
        q.sequence_order,
        q.question_text,
        COUNT(ua.answer_id) as answer_count
      FROM questions q
      LEFT JOIN user_answers ua ON ua.question_id = q.question_id
      LEFT JOIN user_sessions us ON us.session_id = ua.session_id AND us.quiz_id = $1
      WHERE q.quiz_id = $1
        AND (q.is_archived = false OR q.is_archived IS NULL)
      GROUP BY q.question_id, q.sequence_order, q.question_text
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    // Count views per question (sessions that reached each question)
    const viewsPerQuestion = await client.query(`
      SELECT 
        q.question_id,
        q.sequence_order,
        COUNT(DISTINCT us.session_id) as view_count
      FROM questions q
      LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
        AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
      WHERE q.quiz_id = $1
        AND (q.is_archived = false OR q.is_archived IS NULL)
      GROUP BY q.question_id, q.sequence_order
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    return {
      totalSessions,
      totalAnswers,
      answersPerQuestion: answersPerQuestion.rows,
      viewsPerQuestion: viewsPerQuestion.rows
    };
  } finally {
    client.release();
  }
}

async function test2_QuestionDetailsQuery() {
  const client = await pool.connect();
  try {
    // Replicate the exact query from getQuestionDetails (without date filter)
    const result = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      question_views AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT us.session_id) as views
        FROM questions q
        LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
          AND us.session_id IN (SELECT session_id FROM filtered_sessions)
          AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
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
      SELECT 
        q.question_id,
        q.question_text,
        q.interaction_type,
        COALESCE(qv.views, 0) as views,
        COALESCE(qa.answers, 0) as answers,
        CASE 
          WHEN COALESCE(qv.views, 0) = 0 THEN 0
          ELSE ROUND((COALESCE(qa.answers, 0)::numeric / qv.views::numeric * 100), 2)
        END as answer_rate,
        CASE 
          WHEN COALESCE(qv.views, 0) = 0 THEN 0
          ELSE ROUND(((qv.views - COALESCE(qa.answers, 0))::numeric / qv.views::numeric * 100), 2)
        END as drop_rate
      FROM questions q
      LEFT JOIN question_views qv ON qv.question_id = q.question_id
      LEFT JOIN question_answers qa ON qa.question_id = q.question_id
      WHERE q.quiz_id = $1 
        AND (q.is_archived = false OR q.is_archived IS NULL)
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    return result.rows;
  } finally {
    client.release();
  }
}

async function test3_DataIntegrityCheck() {
  const client = await pool.connect();
  try {
    const issues: string[] = [];

    // Check for answers without corresponding sessions
    const orphanedAnswers = await client.query(`
      SELECT COUNT(*) as count
      FROM user_answers ua
      LEFT JOIN user_sessions us ON us.session_id = ua.session_id
      WHERE us.session_id IS NULL
    `);
    if (parseInt(orphanedAnswers.rows[0].count) > 0) {
      issues.push(`Found ${orphanedAnswers.rows[0].count} orphaned answers (no session)`);
    }

    // Check for answers from sessions of different quiz
    const crossQuizAnswers = await client.query(`
      SELECT COUNT(*) as count
      FROM user_answers ua
      JOIN user_sessions us ON us.session_id = ua.session_id
      JOIN questions q ON q.question_id = ua.question_id
      WHERE us.quiz_id != q.quiz_id
    `);
    if (parseInt(crossQuizAnswers.rows[0].count) > 0) {
      issues.push(`Found ${crossQuizAnswers.rows[0].count} answers from sessions of different quiz`);
    }

    // Check for answers > views per question
    const answerViewMismatch = await client.query(`
      WITH question_views AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT us.session_id) as views
        FROM questions q
        LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
          AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
        WHERE q.quiz_id = $1
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      ),
      question_answers AS (
        SELECT 
          q.question_id,
          COUNT(ua.answer_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN user_sessions us ON us.session_id = ua.session_id AND us.quiz_id = $1
        WHERE q.quiz_id = $1
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      )
      SELECT 
        qv.question_id,
        qv.views,
        qa.answers
      FROM question_views qv
      JOIN question_answers qa ON qa.question_id = qv.question_id
      WHERE qa.answers > qv.views
    `, [QUIZ_ID]);

    if (answerViewMismatch.rows.length > 0) {
      issues.push(`Found ${answerViewMismatch.rows.length} questions with answers > views`);
      issues.push(`Details: ${JSON.stringify(answerViewMismatch.rows)}`);
    }

    return { issues, count: issues.length };
  } finally {
    client.release();
  }
}

async function test4_ViewCalculationLogic() {
  const client = await pool.connect();
  try {
    // Detailed analysis of how views are calculated
    const detailedViews = await client.query(`
      SELECT 
        q.question_id,
        q.sequence_order,
        q.question_text,
        COUNT(DISTINCT us.session_id) as total_sessions,
        COUNT(DISTINCT CASE 
          WHEN us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL 
          THEN us.session_id 
        END) as sessions_that_reached_question,
        COUNT(DISTINCT CASE 
          WHEN us.last_question_viewed = q.question_id 
          THEN us.session_id 
        END) as sessions_stopped_at_question,
        COUNT(DISTINCT CASE 
          WHEN us.last_question_viewed > q.question_id 
          THEN us.session_id 
        END) as sessions_continued_past_question
      FROM questions q
      LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id
      WHERE q.quiz_id = $1
        AND (q.is_archived = false OR q.is_archived IS NULL)
      GROUP BY q.question_id, q.sequence_order, q.question_text
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    return detailedViews.rows;
  } finally {
    client.release();
  }
}

async function test5_AnswerCalculationLogic() {
  const client = await pool.connect();
  try {
    // Detailed analysis of how answers are calculated
    const detailedAnswers = await client.query(`
      SELECT 
        q.question_id,
        q.sequence_order,
        q.question_text,
        COUNT(DISTINCT ua.answer_id) as total_answers,
        COUNT(DISTINCT ua.session_id) as unique_sessions_with_answers,
        COUNT(DISTINCT us.session_id) as total_sessions_for_quiz
      FROM questions q
      LEFT JOIN user_answers ua ON ua.question_id = q.question_id
      LEFT JOIN user_sessions us ON us.session_id = ua.session_id AND us.quiz_id = $1
      WHERE q.quiz_id = $1
        AND (q.is_archived = false OR q.is_archived IS NULL)
      GROUP BY q.question_id, q.sequence_order, q.question_text
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    return detailedAnswers.rows;
  } finally {
    client.release();
  }
}

async function test6_DateRangeFiltering() {
  const client = await pool.connect();
  try {
    // Test with no date filter
    const noFilter = await client.query(`
      SELECT COUNT(*) as count
      FROM user_sessions
      WHERE quiz_id = $1
    `, [QUIZ_ID]);

    // Test with date filter (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const withFilter = await client.query(`
      SELECT COUNT(*) as count
      FROM user_sessions
      WHERE quiz_id = $1
        AND start_timestamp >= $2
        AND start_timestamp <= $3
    `, [QUIZ_ID, thirtyDaysAgo, today]);

    // Check if date filter is applied in question_answers CTE
    const questionAnswersWithFilter = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
          AND start_timestamp >= $2
          AND start_timestamp <= $3
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
      SELECT * FROM question_answers
      ORDER BY question_id
    `, [QUIZ_ID, thirtyDaysAgo, today]);

    return {
      noFilterCount: parseInt(noFilter.rows[0].count),
      withFilterCount: parseInt(withFilter.rows[0].count),
      questionAnswersWithFilter: questionAnswersWithFilter.rows
    };
  } finally {
    client.release();
  }
}

async function test7_SessionAnswerRelationship() {
  const client = await pool.connect();
  try {
    // Check if same session can have multiple answers to same question
    const duplicateAnswers = await client.query(`
      SELECT 
        ua.session_id,
        ua.question_id,
        COUNT(*) as answer_count
      FROM user_answers ua
      JOIN user_sessions us ON us.session_id = ua.session_id
      WHERE us.quiz_id = $1
      GROUP BY ua.session_id, ua.question_id
      HAVING COUNT(*) > 1
    `, [QUIZ_ID]);

    // Check session details with their answers
    const sessionDetails = await client.query(`
      SELECT 
        us.session_id,
        us.start_timestamp,
        us.last_question_viewed,
        us.is_completed,
        COUNT(ua.answer_id) as total_answers,
        ARRAY_AGG(DISTINCT ua.question_id ORDER BY ua.question_id) as answered_questions
      FROM user_sessions us
      LEFT JOIN user_answers ua ON ua.session_id = us.session_id
      WHERE us.quiz_id = $1
      GROUP BY us.session_id, us.start_timestamp, us.last_question_viewed, us.is_completed
      ORDER BY us.start_timestamp DESC
      LIMIT 10
    `, [QUIZ_ID]);

    return {
      duplicateAnswers: duplicateAnswers.rows,
      sessionDetails: sessionDetails.rows
    };
  } finally {
    client.release();
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('📊 ANALYTICS QUERY TEST SUITE');
  console.log(`🎯 Testing Quiz ID: ${QUIZ_ID}`);
  console.log('='.repeat(80));

  await runTest('Test 1: Raw Data Counts', test1_RawDataCounts);
  await runTest('Test 2: Question Details Query (Replication)', test2_QuestionDetailsQuery);
  await runTest('Test 3: Data Integrity Check', test3_DataIntegrityCheck);
  await runTest('Test 4: View Calculation Logic', test4_ViewCalculationLogic);
  await runTest('Test 5: Answer Calculation Logic', test5_AnswerCalculationLogic);
  await runTest('Test 6: Date Range Filtering', test6_DateRangeFiltering);
  await runTest('Test 7: Session-Answer Relationship', test7_SessionAnswerRelationship);

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEST REPORT');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  // Detailed results
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.testName}`);
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (result.issues && result.issues.length > 0) {
      console.log(`   Issues:`);
      result.issues.forEach(issue => console.log(`     - ${issue}`));
    }
    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data, null, 2).substring(0, 500)}...`);
    }
  });

  // Summary of issues
  const allIssues = results
    .filter(r => r.issues && r.issues.length > 0)
    .flatMap(r => r.issues || []);

  if (allIssues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('🚨 CRITICAL ISSUES FOUND');
    console.log('='.repeat(80));
    allIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue}`);
    });
  }

  await pool.end();
}

main().catch(console.error);

