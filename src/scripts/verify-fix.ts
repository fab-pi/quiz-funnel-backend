import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Verify that the fix works correctly
 */

const QUIZ_ID = 1;

async function verifyFix() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('✅ VERIFYING FIX: Answer Counting Logic');
    console.log('='.repeat(80));

    // Test the fixed query
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

    console.log('\n📊 Results After Fix:');
    console.log('-'.repeat(80));
    result.rows.forEach((row: any) => {
      console.log(`\nQuestion ${row.question_id}: ${row.question_text}`);
      console.log(`  Views: ${row.views}`);
      console.log(`  Answers: ${row.answers} (unique sessions)`);
      console.log(`  Answer Rate: ${row.answer_rate}%`);
      console.log(`  Drop Rate: ${row.drop_rate}%`);
      
      // Validate
      if (row.answers > row.views) {
        console.log(`  ❌ ERROR: Answers (${row.answers}) > Views (${row.views})`);
      } else if (row.answer_rate > 100) {
        console.log(`  ❌ ERROR: Answer Rate (${row.answer_rate}%) > 100%`);
      } else if (row.drop_rate < 0) {
        console.log(`  ❌ ERROR: Drop Rate (${row.drop_rate}%) < 0%`);
      } else {
        console.log(`  ✅ VALID: Metrics are correct`);
      }
    });

    // Verify answer distribution fix
    console.log('\n\n📊 Testing Answer Distribution Fix:');
    console.log('-'.repeat(80));
    
    const distResult = await client.query(`
      WITH filtered_answers AS (
        SELECT 
          ua.session_id,
          ua.selected_option_id,
          ua.answer_timestamp,
          ROW_NUMBER() OVER (PARTITION BY ua.session_id ORDER BY ua.answer_timestamp DESC) as rn
        FROM user_answers ua
        JOIN user_sessions us ON us.session_id = ua.session_id
        WHERE ua.question_id = 1 
          AND us.quiz_id = $1
      ),
      latest_answers AS (
        SELECT selected_option_id
        FROM filtered_answers
        WHERE rn = 1
      ),
      total_answers AS (
        SELECT COUNT(*) as total
        FROM latest_answers
      )
      SELECT 
        ao.option_id,
        ao.option_text,
        COUNT(la.selected_option_id) as selection_count,
        CASE 
          WHEN (SELECT total FROM total_answers) = 0 THEN 0
          ELSE ROUND(
            (COUNT(la.selected_option_id)::numeric / (SELECT total FROM total_answers)::numeric * 100), 
            2
          )
        END as percentage
      FROM answer_options ao
      LEFT JOIN latest_answers la ON la.selected_option_id = ao.option_id
      WHERE ao.question_id = 1
        AND (ao.is_archived = false OR ao.is_archived IS NULL)
      GROUP BY ao.option_id, ao.option_text
      ORDER BY selection_count DESC
    `, [QUIZ_ID]);

    console.log(`\nTotal unique sessions that answered: ${distResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.selection_count), 0)}`);
    console.log(`Distribution:`);
    distResult.rows.forEach((row: any) => {
      console.log(`  ${row.option_text}: ${row.selection_count} (${row.percentage}%)`);
    });

    console.log('\n✅ Verification complete!');
    
  } finally {
    client.release();
  }
}

verifyFix()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

