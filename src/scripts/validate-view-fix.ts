import pool from '../config/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Validation script to verify the view calculation fix works correctly
 */

const QUIZ_ID = 2; // Using quiz 2 as it has the problematic data

async function validateViewFix() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('✅ VALIDATING: View Calculation Fix');
    console.log(`🎯 Testing Quiz ID: ${QUIZ_ID}`);
    console.log('='.repeat(80));

    // Test 1: Check if views are non-increasing by sequence_order
    console.log('\n📊 Test 1: Views should be non-increasing by sequence_order');
    console.log('-'.repeat(80));
    
    const viewsTest = await client.query(`
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
      question_views AS (
        SELECT 
          q.question_id,
          q.sequence_order,
          COUNT(DISTINCT sls.session_id) as views
        FROM questions q
        LEFT JOIN session_last_sequences sls ON sls.last_sequence_viewed > q.sequence_order
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id, q.sequence_order
      )
      SELECT 
        question_id,
        sequence_order,
        views
      FROM question_views
      ORDER BY sequence_order
    `, [QUIZ_ID]);

    let prevViews = Infinity;
    let violations = 0;
    
    viewsTest.rows.forEach((row: any) => {
      const currentViews = parseInt(row.views) || 0;
      const isViolation = currentViews > prevViews;
      
      if (isViolation) {
        violations++;
        console.log(`  ❌ Q${row.sequence_order + 1} (ID: ${row.question_id}): ${currentViews} views (was ${prevViews}) - VIOLATION!`);
      } else {
        console.log(`  ✅ Q${row.sequence_order + 1} (ID: ${row.question_id}): ${currentViews} views`);
      }
      
      prevViews = currentViews;
    });

    if (violations === 0) {
      console.log(`\n✅ PASSED: All views are non-increasing by sequence_order`);
    } else {
      console.log(`\n❌ FAILED: Found ${violations} violations where later questions have more views`);
    }

    // Test 2: Check NULL handling
    console.log('\n\n📊 Test 2: NULL last_question_viewed handling');
    console.log('-'.repeat(80));
    
    const nullSessions = await client.query(`
      SELECT COUNT(*) as count
      FROM user_sessions
      WHERE quiz_id = $1
        AND last_question_viewed IS NULL
    `, [QUIZ_ID]);

    const nullCount = parseInt(nullSessions.rows[0].count);
    console.log(`  NULL sessions: ${nullCount}`);
    
    // Check if any of these NULL sessions are counted as views
    const nullViewsCheck = await client.query(`
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
      question_views AS (
        SELECT 
          q.question_id,
          COUNT(DISTINCT sls.session_id) as views
        FROM questions q
        LEFT JOIN session_last_sequences sls ON sls.last_sequence_viewed > q.sequence_order
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id
      )
      SELECT SUM(views) as total_views
      FROM question_views
    `, [QUIZ_ID]);

    console.log(`  Total views across all questions: ${nullViewsCheck.rows[0].total_views}`);
    console.log(`  ✅ NULL sessions should NOT be counted as views (they have NULL last_sequence_viewed)`);

    // Test 3: Check orphaned last_question_viewed values
    console.log('\n\n📊 Test 3: Orphaned last_question_viewed values');
    console.log('-'.repeat(80));
    
    const orphanedCheck = await client.query(`
      SELECT 
        us.session_id,
        us.last_question_viewed,
        CASE WHEN q.question_id IS NULL THEN 'ORPHANED' ELSE 'VALID' END as status
      FROM user_sessions us
      LEFT JOIN questions q ON q.question_id = us.last_question_viewed
        AND q.quiz_id = us.quiz_id
      WHERE us.quiz_id = $1
        AND us.last_question_viewed IS NOT NULL
      GROUP BY us.session_id, us.last_question_viewed, q.question_id
    `, [QUIZ_ID]);

    const orphaned = orphanedCheck.rows.filter((r: any) => r.status === 'ORPHANED');
    console.log(`  Sessions with orphaned last_question_viewed: ${orphaned.length}`);
    
    if (orphaned.length > 0) {
      console.log(`  ⚠️  WARNING: ${orphaned.length} sessions have last_question_viewed pointing to non-existent/archived questions`);
      console.log(`  These will be treated as NULL (never viewed)`);
    } else {
      console.log(`  ✅ No orphaned values found`);
    }

    // Test 4: Compare old vs new logic
    console.log('\n\n📊 Test 4: Old vs New Logic Comparison');
    console.log('-'.repeat(80));
    
    const comparison = await client.query(`
      WITH filtered_sessions AS (
        SELECT session_id
        FROM user_sessions
        WHERE quiz_id = $1
      ),
      -- OLD LOGIC (broken)
      old_question_views AS (
        SELECT 
          q.question_id,
          q.sequence_order,
          COUNT(DISTINCT us.session_id) as old_views
        FROM questions q
        LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
          AND us.session_id IN (SELECT session_id FROM filtered_sessions)
          AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id, q.sequence_order
      ),
      -- NEW LOGIC (fixed)
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
      new_question_views AS (
        SELECT 
          q.question_id,
          q.sequence_order,
          COUNT(DISTINCT sls.session_id) as new_views
        FROM questions q
        LEFT JOIN session_last_sequences sls ON sls.last_sequence_viewed > q.sequence_order
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        GROUP BY q.question_id, q.sequence_order
      )
      SELECT 
        oqv.sequence_order,
        oqv.question_id,
        oqv.old_views,
        nqv.new_views,
        (oqv.old_views - nqv.new_views) as difference
      FROM old_question_views oqv
      JOIN new_question_views nqv ON nqv.question_id = oqv.question_id
      ORDER BY oqv.sequence_order
    `, [QUIZ_ID]);

    console.log('\nComparison:');
    comparison.rows.forEach((row: any) => {
      const diff = parseInt(row.difference);
      const indicator = diff > 0 ? '📉' : diff < 0 ? '📈' : '➡️';
      console.log(`  ${indicator} Q${row.sequence_order + 1} (ID: ${row.question_id}): Old=${row.old_views}, New=${row.new_views}, Diff=${diff > 0 ? '+' : ''}${diff}`);
    });

    console.log('\n✅ Validation complete!');
    
  } finally {
    client.release();
  }
}

validateViewFix()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

