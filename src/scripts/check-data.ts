import pool from '../config/db';

const checkData = async () => {
  try {
    console.log('🔍 Checking current database data...');
    
    // Check quizzes
    const quizzes = await pool.query('SELECT quiz_id, quiz_name, creation_date FROM quizzes ORDER BY quiz_id');
    console.log(`\n📊 Quizzes (${quizzes.rows.length}):`);
    quizzes.rows.forEach(quiz => {
      console.log(`   ID: ${quiz.quiz_id} | Name: ${quiz.quiz_name} | Created: ${quiz.creation_date}`);
    });
    
    // Check questions
    const questions = await pool.query('SELECT question_id, quiz_id, question_text FROM questions ORDER BY quiz_id, sequence_order');
    console.log(`\n❓ Questions (${questions.rows.length}):`);
    questions.rows.forEach(q => {
      console.log(`   ID: ${q.question_id} | Quiz: ${q.quiz_id} | Text: ${q.question_text.substring(0, 50)}...`);
    });
    
    // Check user sessions
    const sessions = await pool.query('SELECT session_id, quiz_id, start_timestamp FROM user_sessions ORDER BY session_id');
    console.log(`\n👥 User Sessions (${sessions.rows.length}):`);
    sessions.rows.forEach(session => {
      console.log(`   Session: ${session.session_id} | Quiz: ${session.quiz_id} | Started: ${session.start_timestamp}`);
    });
    
    // Check user answers
    const answers = await pool.query('SELECT answer_id, session_id, question_id FROM user_answers ORDER BY answer_id');
    console.log(`\n💬 User Answers (${answers.rows.length}):`);
    answers.rows.forEach(answer => {
      console.log(`   Answer: ${answer.answer_id} | Session: ${answer.session_id} | Question: ${answer.question_id}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
};

checkData().catch(console.error);

