import pool from '../config/db';

const checkQuizData = async () => {
  try {
    console.log('Checking quiz 9 data...');

    // Check quiz data
    const quizResult = await pool.query(
      'SELECT quiz_id, quiz_name, product_page_url, is_active, brand_logo_url, color_primary, color_secondary, color_text_default, color_text_hover FROM quizzes WHERE quiz_id = 9'
    );
    
    if (quizResult.rows.length === 0) {
      console.log('❌ Quiz 9 not found');
      return;
    }

    const quiz = quizResult.rows[0];
    console.log('📊 Quiz 9 data:');
    console.log(`  quiz_id: ${quiz.quiz_id}`);
    console.log(`  quiz_name: ${quiz.quiz_name}`);
    console.log(`  product_page_url: ${quiz.product_page_url}`);
    console.log(`  is_active: ${quiz.is_active}`);
    console.log(`  brand_logo_url: ${quiz.brand_logo_url}`);
    console.log(`  color_primary: ${quiz.color_primary}`);
    console.log(`  color_secondary: ${quiz.color_secondary}`);
    console.log(`  color_text_default: ${quiz.color_text_default}`);
    console.log(`  color_text_hover: ${quiz.color_text_hover}`);

    // Check all quizzes
    const allQuizzesResult = await pool.query(
      'SELECT quiz_id, quiz_name, color_primary, color_secondary FROM quizzes ORDER BY quiz_id'
    );
    
    console.log('\n📊 All quizzes:');
    allQuizzesResult.rows.forEach(row => {
      console.log(`  Quiz ${row.quiz_id}: ${row.quiz_name} - Primary: ${row.color_primary}, Secondary: ${row.color_secondary}`);
    });

  } catch (error) {
    console.error('❌ Error checking quiz data:', error);
  } finally {
    await pool.end();
  }
};

checkQuizData().catch(console.error);
