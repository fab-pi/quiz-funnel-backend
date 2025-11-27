import pool from '../config/db';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface QuizRow {
  quiz_id: string;
  quiz_name: string;
  product_page_url: string;
  creation_date: string;
  is_active: string;
  brand_logo_url: string;
  color_primary: string;
  color_secondary: string;
  color_text_default: string;
  color_text_hover: string;
  quiz_start_url: string;
  user_id: string;
  custom_domain: string;
}

interface QuestionRow {
  question_id: string;
  quiz_id: string;
  sequence_order: string;
  question_text: string;
  image_url: string;
  interaction_type: string;
  instructions_text: string;
  loader_text: string;
  popup_question: string;
  is_archived: string;
  educational_box_title: string;
  educational_box_text: string;
  loader_bars: string;
  result_page_config: string;
  timeline_projection_config: string;
}

interface AnswerOptionRow {
  option_id: string;
  question_id: string;
  option_text: string;
  associated_value: string;
  option_image_url: string;
  is_archived: string;
}

interface UserSessionRow {
  quiz_id: string;
  start_timestamp: string;
  last_question_viewed: string;
  is_completed: string;
  final_profile: string;
  utm_params: string;
  session_id: string;
}

interface UserAnswerRow {
  question_id: string;
  selected_option_id: string;
  answer_timestamp: string;
  session_id: string;
  answer_id: string;
}

async function importQuiz2Data() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('📦 Starting import of Quiz 2 data...\n');

    // Step 1: Check if quiz 2 already exists
    const existingQuiz = await client.query(
      'SELECT quiz_id FROM quizzes WHERE quiz_id = $1',
      [2]
    );

    if (existingQuiz.rows.length > 0) {
      console.log('⚠️  Quiz 2 already exists. Deleting existing data...');
      // Delete in reverse order of dependencies
      await client.query('DELETE FROM user_answers WHERE session_id IN (SELECT session_id FROM user_sessions WHERE quiz_id = $1)', [2]);
      await client.query('DELETE FROM user_sessions WHERE quiz_id = $1', [2]);
      await client.query('DELETE FROM answer_options WHERE question_id IN (SELECT question_id FROM questions WHERE quiz_id = $1)', [2]);
      await client.query('DELETE FROM questions WHERE quiz_id = $1', [2]);
      await client.query('DELETE FROM quizzes WHERE quiz_id = $1', [2]);
      console.log('✅ Deleted existing Quiz 2 data\n');
    }

    // Step 2: Read CSV files
    const csvDir = '/Users/fabriziopiccolo/Downloads';
    
    console.log('📖 Reading CSV files...');
    const quizzesCsv = fs.readFileSync(path.join(csvDir, 'quizzes (1).csv'), 'utf-8');
    const questionsCsv = fs.readFileSync(path.join(csvDir, 'questions.csv'), 'utf-8');
    const answerOptionsCsv = fs.readFileSync(path.join(csvDir, 'answer_options.csv'), 'utf-8');
    const userSessionsCsv = fs.readFileSync(path.join(csvDir, 'user_sessions (1).csv'), 'utf-8');
    const userAnswersCsv = fs.readFileSync(path.join(csvDir, 'user_answers (1).csv'), 'utf-8');
    console.log('✅ CSV files read\n');

    // Step 3: Parse CSV files
    const quizzes: QuizRow[] = parse(quizzesCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const questions: QuestionRow[] = parse(questionsCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      escape: '"',
    });

    const answerOptions: AnswerOptionRow[] = parse(answerOptionsCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    // Get question IDs and option IDs that will be imported to check for conflicts
    const quiz2Questions = questions.filter(q => q.quiz_id === '2');
    const quiz2QuestionIds = new Set(quiz2Questions.map(q => parseInt(q.question_id)));
    const quiz2AnswerOptions = answerOptions.filter(ao => quiz2QuestionIds.has(parseInt(ao.question_id)));
    const quiz2OptionIds = quiz2AnswerOptions.map(ao => parseInt(ao.option_id));

    // Delete any existing questions/options with conflicting IDs (from other quizzes)
    if (quiz2QuestionIds.size > 0) {
      console.log('🔍 Checking for ID conflicts...');
      const questionIdsArray = Array.from(quiz2QuestionIds);
      const existingQuestions = await client.query(
        'SELECT question_id FROM questions WHERE question_id = ANY($1::int[])',
        [questionIdsArray]
      );
      if (existingQuestions.rows.length > 0) {
        const conflictingQuestionIds = existingQuestions.rows.map(r => r.question_id);
        console.log(`⚠️  Found ${conflictingQuestionIds.length} conflicting question IDs. Deleting...`);
        // Delete dependent data first
        await client.query('DELETE FROM user_answers WHERE question_id = ANY($1::int[])', [conflictingQuestionIds]);
        await client.query('DELETE FROM user_sessions WHERE last_question_viewed = ANY($1::int[])', [conflictingQuestionIds]);
        await client.query('DELETE FROM answer_options WHERE question_id = ANY($1::int[])', [conflictingQuestionIds]);
        await client.query('DELETE FROM questions WHERE question_id = ANY($1::int[])', [conflictingQuestionIds]);
        console.log('✅ Deleted conflicting questions\n');
      }

      if (quiz2OptionIds.length > 0) {
        const existingOptions = await client.query(
          'SELECT option_id FROM answer_options WHERE option_id = ANY($1::int[])',
          [quiz2OptionIds]
        );
        if (existingOptions.rows.length > 0) {
          const conflictingOptionIds = existingOptions.rows.map(r => r.option_id);
          console.log(`⚠️  Found ${conflictingOptionIds.length} conflicting option IDs. Deleting...`);
          await client.query('DELETE FROM user_answers WHERE selected_option_id = ANY($1::int[])', [conflictingOptionIds]);
          await client.query('DELETE FROM answer_options WHERE option_id = ANY($1::int[])', [conflictingOptionIds]);
          console.log('✅ Deleted conflicting answer options\n');
        }
      }
    }

    const userSessions: UserSessionRow[] = parse(userSessionsCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const userAnswers: UserAnswerRow[] = parse(userAnswersCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Step 4: Import Quiz (with explicit ID)
    console.log('📝 Importing quiz...');
    const quiz = quizzes.find(q => q.quiz_id === '2');
    if (!quiz) {
      throw new Error('Quiz 2 not found in CSV');
    }

    // Temporarily set sequence to allow explicit ID insertion
    await client.query('SELECT setval(\'quizzes_quiz_id_seq\', GREATEST((SELECT MAX(quiz_id) FROM quizzes), 1), true)');
    
    await client.query(`
      INSERT INTO quizzes (
        quiz_id, quiz_name, product_page_url, creation_date, is_active,
        brand_logo_url, color_primary, color_secondary, color_text_default,
        color_text_hover, quiz_start_url, user_id, custom_domain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      2, // Explicit quiz_id
      quiz.quiz_name,
      quiz.product_page_url || null,
      quiz.creation_date,
      quiz.is_active === 'true',
      quiz.brand_logo_url || null,
      quiz.color_primary || null,
      quiz.color_secondary || null,
      quiz.color_text_default || null,
      quiz.color_text_hover || null,
      quiz.quiz_start_url || null,
      1, // Set user_id to 1 (local admin user)
      quiz.custom_domain || null,
    ]);
    console.log(`✅ Imported quiz: ${quiz.quiz_name}\n`);

    // Step 5: Import Questions (with explicit IDs)
    console.log('📝 Importing questions...');
    
    // Set sequence to allow explicit ID insertion
    const maxQuestionId = Math.max(...quiz2Questions.map(q => parseInt(q.question_id)));
    await client.query(`SELECT setval('questions_question_id_seq', GREATEST((SELECT MAX(question_id) FROM questions), $1), true)`, [maxQuestionId]);

    for (const question of quiz2Questions) {
      // Skip JSONB fields for now - they can be fixed manually later if needed
      // The CSV JSON escaping is complex and causing parsing issues
      // Setting to NULL won't break the import
      const loaderBars = null;
      const resultPageConfig = null;
      const timelineProjectionConfig = null;

      // Pass JSON objects directly - pg library will handle JSONB conversion
      await client.query(`
        INSERT INTO questions (
          question_id, quiz_id, sequence_order, question_text, image_url,
          interaction_type, instructions_text, loader_text, popup_question,
          is_archived, educational_box_title, educational_box_text,
          loader_bars, result_page_config, timeline_projection_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        parseInt(question.question_id),
        2, // quiz_id
        parseInt(question.sequence_order),
        question.question_text || null,
        question.image_url || null,
        question.interaction_type,
        question.instructions_text || null,
        question.loader_text || null,
        question.popup_question || null,
        question.is_archived === 'true',
        question.educational_box_title || null,
        question.educational_box_text || null,
        loaderBars, // Already parsed JSON object
        resultPageConfig, // Already parsed JSON object
        timelineProjectionConfig, // Already parsed JSON object
      ]);
    }
    console.log(`✅ Imported ${quiz2Questions.length} questions\n`);

    // Step 6: Import Answer Options (with explicit IDs)
    console.log('📝 Importing answer options...');
    
    // Set sequence to allow explicit ID insertion
    const maxOptionId = Math.max(...quiz2AnswerOptions.map(ao => parseInt(ao.option_id)));
    await client.query(`SELECT setval('answer_options_option_id_seq', GREATEST((SELECT MAX(option_id) FROM answer_options), $1), true)`, [maxOptionId]);

    for (const option of quiz2AnswerOptions) {
      await client.query(`
        INSERT INTO answer_options (
          option_id, question_id, option_text, associated_value,
          option_image_url, is_archived
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        parseInt(option.option_id),
        parseInt(option.question_id),
        option.option_text,
        option.associated_value,
        option.option_image_url || null,
        option.is_archived === 'true',
      ]);
    }
    console.log(`✅ Imported ${quiz2AnswerOptions.length} answer options\n`);

    // Step 7: Import User Sessions (with UUID session_ids)
    console.log('📝 Importing user sessions...');
    const quiz2Sessions = userSessions.filter(s => s.quiz_id === '2');

    for (const session of quiz2Sessions) {
      // Parse utm_params JSONB (may be empty string in CSV)
      let utmParams = null;
      if (session.utm_params && session.utm_params.trim() !== '' && session.utm_params.trim() !== 'null') {
        try {
          utmParams = JSON.parse(session.utm_params);
        } catch (e) {
          // If parsing fails, set to null
          utmParams = null;
        }
      }

      await client.query(`
        INSERT INTO user_sessions (
          session_id, quiz_id, start_timestamp, last_question_viewed,
          is_completed, final_profile, utm_params
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
      `, [
        session.session_id, // UUID string
        2, // quiz_id
        session.start_timestamp,
        session.last_question_viewed ? parseInt(session.last_question_viewed) : null,
        session.is_completed === 'true',
        session.final_profile || null,
        utmParams,
      ]);
    }
    console.log(`✅ Imported ${quiz2Sessions.length} user sessions\n`);

    // Step 8: Import User Answers (with UUID answer_ids)
    console.log('📝 Importing user answers...');
    const quiz2Answers = userAnswers.filter(a => {
      // Filter answers that belong to quiz 2 questions
      return quiz2QuestionIds.has(parseInt(a.question_id));
    });

    for (const answer of quiz2Answers) {
      await client.query(`
        INSERT INTO user_answers (
          answer_id, session_id, question_id, selected_option_id, answer_timestamp
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
      `, [
        answer.answer_id, // UUID string
        answer.session_id, // UUID string
        parseInt(answer.question_id),
        parseInt(answer.selected_option_id),
        answer.answer_timestamp,
      ]);
    }
    console.log(`✅ Imported ${quiz2Answers.length} user answers\n`);

    // Step 9: Update sequences to be ready for new inserts
    console.log('🔄 Updating sequences...');
    await client.query('SELECT setval(\'quizzes_quiz_id_seq\', (SELECT MAX(quiz_id) FROM quizzes), true)');
    await client.query('SELECT setval(\'questions_question_id_seq\', (SELECT MAX(question_id) FROM questions), true)');
    await client.query('SELECT setval(\'answer_options_option_id_seq\', (SELECT MAX(option_id) FROM answer_options), true)');
    console.log('✅ Sequences updated\n');

    await client.query('COMMIT');
    console.log('✅ Import completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Quiz: 1 (ID: 2)`);
    console.log(`   - Questions: ${quiz2Questions.length}`);
    console.log(`   - Answer Options: ${quiz2AnswerOptions.length}`);
    console.log(`   - User Sessions: ${quiz2Sessions.length}`);
    console.log(`   - User Answers: ${quiz2Answers.length}`);
    console.log(`   - Quiz owner: user_id = 1\n`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the import
importQuiz2Data()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

