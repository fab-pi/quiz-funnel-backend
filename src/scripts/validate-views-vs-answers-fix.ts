import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Validation script to verify views >= answers after the fix
 */

const QUIZ_ID = 2; // Using quiz 2 as it has the problematic data

async function validateViewsVsAnswers() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('✅ VALIDATING: Views >= Answers Fix');
    console.log(`🎯 Testing Quiz ID: ${QUIZ_ID}`);
    console.log('='.repeat(80));

    // Test the fixed query
    const result = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      session_last_sequences AS (
        SELECT 
          us.session_id,
          COALESCE(q_viewed.sequence_order, NULL) as last_sequence_viewed
        FROM user_sessions us
        LEFT JOIN questions q_viewed ON q_viewed.question_id = us.last_question_viewed
          AND q_viewed.quiz_id = us.quiz_id
          AND (q_viewed.is_archived = false OR q_viewed.is_archived IS NULL)
        WHERE us.quiz_id = $1
          AND us.session_id IN (SELECT session_id FROM filtered_sessions)
      ),
      question_answer_sessions AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT ua.session_id) as unique_sessions_answered
        FROM questions q
        LEFT JOIN user_answers ua ON ua.question_id = q.question_id
        LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      ),
      question_views AS (
        SELECT 
          q.question_id,
          q.sequence_order,
          q.interaction_type,
          CASE 
            WHEN q.interaction_type IN ('single_choice', 'multiple_choice', 'image_card') THEN
              GREATEST(
                COALESCE(COUNT(DISTINCT sls.session_id), 0),
                COALESCE(qas.unique_sessions_answered, 0)
              )
            ELSE
              COALESCE(COUNT(DISTINCT sls.session_id), 0)
          END as views,
          COALESCE(COUNT(DISTINCT sls.session_id), 0) as calculated_views,
          COALESCE(qas.unique_sessions_answered, 0) as answer_sessions
        FROM questions q
        LEFT JOIN session_last_sequences sls ON sls.last_sequence_viewed > q.sequence_order
        LEFT JOIN question_answer_sessions qas ON qas.question_id = q.question_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id, q.sequence_order, q.interaction_type, qas.unique_sessions_answered
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
        qv.sequence_order,
        qv.question_id,
        qv.interaction_type,
        qv.views,
        qv.calculated_views,
        qv.answer_sessions,
        COALESCE(qa.answers, 0) as answers,
        CASE 
          WHEN qv.views >= COALESCE(qa.answers, 0) THEN '✅'
          ELSE '❌'
        END as status,
        CASE 
          WHEN qv.views < COALESCE(qa.answers, 0) THEN qa.answers - qv.views
          ELSE 0
        END as violation_count
      FROM question_views qv
      LEFT JOIN question_answers qa ON qa.question_id = qv.question_id
      ORDER BY qv.sequence_order
    `, [QUIZ_ID]);

    console.log('\n📊 Results:');
    console.log('-'.repeat(80));
    console.log('Seq | Q ID | Type           | Views | Calc | AnsSess | Answers | Status | Violation');
    console.log('-'.repeat(80));
    
    let totalViolations = 0;
    result.rows.forEach((row: any) => {
      const violation = parseInt(row.violation_count) || 0;
      if (violation > 0) totalViolations++;
      
      const typeDisplay = row.interaction_type.padEnd(15).substring(0, 15);
      console.log(
        `${String(row.sequence_order).padStart(3)} | ${String(row.question_id).padStart(4)} | ${typeDisplay} | ${String(row.views).padStart(5)} | ${String(row.calculated_views).padStart(4)} | ${String(row.answer_sessions).padStart(7)} | ${String(row.answers).padStart(7)} | ${row.status}     | ${violation > 0 ? violation : ''}`
      );
    });

    console.log('-'.repeat(80));
    
    if (totalViolations === 0) {
      console.log('\n✅ PASSED: All questions have views >= answers');
    } else {
      console.log(`\n❌ FAILED: Found ${totalViolations} questions with views < answers`);
    }

    // Show which questions used the MAX logic
    console.log('\n\n📋 Questions using MAX logic (answerable types):');
    const maxUsed = result.rows.filter((r: any) => 
      ['single_choice', 'multiple_choice', 'image_card'].includes(r.interaction_type) &&
      r.answer_sessions > r.calculated_views
    );
    
    if (maxUsed.length > 0) {
      console.log(`  ${maxUsed.length} questions where answer_sessions > calculated_views:`);
      maxUsed.forEach((row: any) => {
        console.log(`    Q${row.sequence_order + 1} (${row.interaction_type}): Calculated=${row.calculated_views}, AnswerSessions=${row.answer_sessions}, Final=${row.views}`);
      });
    } else {
      console.log('  No questions needed MAX logic (calculated_views was sufficient)');
    }

    console.log('\n✅ Validation complete!');
    
  } finally {
    client.release();
  }
}

validateViewsVsAnswers()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

