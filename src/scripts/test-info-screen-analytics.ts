import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test script to verify info screen analytics work correctly
 */

const QUIZ_ID = 1;

async function testInfoScreenAnalytics() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('🧪 TESTING: Info Screen Analytics Implementation');
    console.log('='.repeat(80));

    // Get all questions with their types
    const questions = await client.query(`
      SELECT 
        question_id,
        sequence_order,
        question_text,
        interaction_type
      FROM questions
      WHERE quiz_id = $1
        AND (is_archived = false OR is_archived IS NULL)
      ORDER BY sequence_order
    `, [QUIZ_ID]);

    console.log(`\n📋 Questions in quiz ${QUIZ_ID}:`);
    questions.rows.forEach((q: any) => {
      const isInfoScreen = ['fake_loader', 'info_screen', 'result_page', 'timeline_projection'].includes(q.interaction_type);
      console.log(`  Q${q.sequence_order + 1} (ID: ${q.question_id}): ${q.interaction_type} ${isInfoScreen ? '📄 (info screen)' : '📝 (answerable)'}`);
    });

    // Test the analytics query
    console.log('\n\n📊 Testing Analytics Query:');
    console.log('-'.repeat(80));

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
          COUNT(DISTINCT ua.session_id) as answers
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      ),
      question_completions AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT CASE WHEN us.is_completed = true THEN us.session_id END) as completions
        FROM questions q
        LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id
          AND us.session_id IN (SELECT session_id FROM filtered_sessions)
          AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      ),
      next_question_views AS (
        SELECT 
          q1.question_id,
          COALESCE(qv2.views, 0) as next_views,
          CASE WHEN q2.question_id IS NULL THEN true ELSE false END as is_last_question
        FROM questions q1
        LEFT JOIN questions q2 ON q2.quiz_id = q1.quiz_id 
          AND q2.sequence_order = q1.sequence_order + 1
          AND (q2.is_archived = false OR q2.is_archived IS NULL)
        LEFT JOIN question_views qv2 ON qv2.question_id = q2.question_id
        WHERE q1.quiz_id = $1 
          AND (q1.is_archived = false OR q1.is_archived IS NULL)
      )
      SELECT 
        q.question_id,
        q.sequence_order,
        q.question_text,
        q.interaction_type,
        COALESCE(qv.views, 0) as views,
        CASE 
          WHEN q.interaction_type IN ('fake_loader', 'info_screen', 'result_page', 'timeline_projection') 
          THEN COALESCE(qv.views, 0)
          ELSE COALESCE(qa.answers, 0)
        END as answers,
        CASE 
          WHEN COALESCE(qv.views, 0) = 0 THEN 0
          WHEN q.interaction_type IN ('fake_loader', 'info_screen', 'result_page', 'timeline_projection') THEN 100.00
          ELSE ROUND((COALESCE(qa.answers, 0)::numeric / qv.views::numeric * 100), 2)
        END as answer_rate,
        CASE 
          WHEN COALESCE(qv.views, 0) = 0 THEN 0
          WHEN q.interaction_type IN ('fake_loader', 'info_screen', 'result_page', 'timeline_projection') THEN
            CASE 
              WHEN nqv.is_last_question = true THEN
                ROUND(((qv.views - COALESCE(qc.completions, 0))::numeric / qv.views::numeric * 100), 2)
              ELSE
                ROUND(((qv.views - nqv.next_views)::numeric / qv.views::numeric * 100), 2)
            END
          ELSE
            ROUND(((qv.views - COALESCE(qa.answers, 0))::numeric / qv.views::numeric * 100), 2)
        END as drop_rate,
        nqv.next_views,
        nqv.is_last_question,
        qc.completions
      FROM questions q
      LEFT JOIN question_views qv ON qv.question_id = q.question_id
      LEFT JOIN question_answers qa ON qa.question_id = q.question_id
      LEFT JOIN next_question_views nqv ON nqv.question_id = q.question_id
      LEFT JOIN question_completions qc ON qc.question_id = q.question_id
      WHERE q.quiz_id = $1 
        AND (q.is_archived = false OR q.is_archived IS NULL)
      ORDER BY q.sequence_order
    `, [QUIZ_ID]);

    console.log('\nResults:');
    result.rows.forEach((row: any) => {
      const isInfoScreen = ['fake_loader', 'info_screen', 'result_page', 'timeline_projection'].includes(row.interaction_type);
      console.log(`\nQ${row.sequence_order + 1} (${row.interaction_type}):`);
      console.log(`  Views: ${row.views}`);
      console.log(`  Answers: ${row.answers} ${isInfoScreen ? '(using views as proxy)' : '(actual answers)'}`);
      console.log(`  Answer Rate: ${row.answer_rate}% ${isInfoScreen ? '(should be 100%)' : ''}`);
      console.log(`  Drop Rate: ${row.drop_rate}%`);
      if (isInfoScreen) {
        console.log(`  Next Question Views: ${row.next_views}`);
        console.log(`  Is Last Question: ${row.is_last_question}`);
        console.log(`  Completions: ${row.completions}`);
        if (row.answer_rate !== 100) {
          console.log(`  ⚠️  WARNING: Info screen should have 100% answer rate`);
        }
        if (row.answers !== row.views) {
          console.log(`  ⚠️  WARNING: Info screen answers should equal views`);
        }
      } else {
        if (row.answers > row.views) {
          console.log(`  ⚠️  WARNING: Answers (${row.answers}) > Views (${row.views})`);
        }
      }
    });

    console.log('\n✅ Test complete!');
    
  } finally {
    client.release();
  }
}

testInfoScreenAnalytics()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

