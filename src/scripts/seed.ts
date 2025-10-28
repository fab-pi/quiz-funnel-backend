import pool from '../config/db';

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Check if migrations have been applied
    const migrationCheck = await pool.query('SELECT COUNT(*) FROM migrations');
    if (migrationCheck.rows[0].count === '0') {
      console.log('⚠️  No migrations found. Please run "npm run migrate" first.');
      return;
    }

    // Clear existing data (in reverse order of dependencies)
    console.log('🧹 Clearing existing data...');
    await pool.query('DELETE FROM user_answers');
    await pool.query('DELETE FROM user_sessions');
    await pool.query('DELETE FROM answer_options');
    await pool.query('DELETE FROM questions');
    await pool.query('DELETE FROM quizzes');

    // Insert comprehensive test quiz data
    const quizResult = await pool.query(
      `INSERT INTO quizzes (quiz_name, product_page_url, creation_date, is_active, 
        brand_logo_url, color_primary, color_secondary, color_text_default, color_text_hover) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING quiz_id`,
      [
        'Fitness Goal Quiz', 
        'https://example.com/fitness-products', 
        new Date(), 
        true,
        'https://res.cloudinary.com/demo/image/upload/v1234567890/logo.png',
        '#FF6B35',
        '#004E89', 
        '#333333',
        '#FFFFFF'
      ]
    );
    const quizId = quizResult.rows[0].quiz_id;
    console.log('✅ Inserted quiz:', quizId);

    // Insert comprehensive test questions
    const questions = [
      {
        sequence_order: 1,
        question_text: 'What is your primary fitness goal?',
        interaction_type: 'single_choice',
        instructions_text: 'Select the option that best describes your main fitness objective',
        loader_text: 'Analyzing your fitness goals...'
      },
      {
        sequence_order: 2,
        question_text: 'How many days per week do you currently exercise?',
        interaction_type: 'single_choice',
        instructions_text: 'Be honest about your current exercise routine',
        loader_text: 'Calculating your fitness level...'
      },
      {
        sequence_order: 3,
        question_text: 'What type of workout do you prefer?',
        interaction_type: 'multiple_choice',
        instructions_text: 'Select all that apply',
        loader_text: 'Personalizing your workout plan...'
      }
    ];

    const questionIds = [];
    for (const question of questions) {
      const result = await pool.query(
        `INSERT INTO questions (quiz_id, sequence_order, question_text, interaction_type, 
          instructions_text, loader_text) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING question_id`,
        [quizId, question.sequence_order, question.question_text, question.interaction_type, 
         question.instructions_text, question.loader_text]
      );
      questionIds.push(result.rows[0].question_id);
      console.log(`✅ Inserted question: ${question.question_text}`);
    }

    // Insert comprehensive answer options
    const answerOptions = [
      // Question 1 options
      { question_id: questionIds[0], option_text: 'Weight Loss', associated_value: 'weight_loss' },
      { question_id: questionIds[0], option_text: 'Muscle Building', associated_value: 'muscle_building' },
      { question_id: questionIds[0], option_text: 'General Fitness', associated_value: 'general_fitness' },
      { question_id: questionIds[0], option_text: 'Athletic Performance', associated_value: 'athletic_performance' },
      
      // Question 2 options
      { question_id: questionIds[1], option_text: '0-2 days', associated_value: 'beginner' },
      { question_id: questionIds[1], option_text: '3-4 days', associated_value: 'intermediate' },
      { question_id: questionIds[1], option_text: '5-6 days', associated_value: 'advanced' },
      { question_id: questionIds[1], option_text: '7 days', associated_value: 'expert' },
      
      // Question 3 options
      { question_id: questionIds[2], option_text: 'Cardio', associated_value: 'cardio' },
      { question_id: questionIds[2], option_text: 'Strength Training', associated_value: 'strength' },
      { question_id: questionIds[2], option_text: 'Yoga/Pilates', associated_value: 'flexibility' },
      { question_id: questionIds[2], option_text: 'HIIT', associated_value: 'hiit' }
    ];

    for (const option of answerOptions) {
      await pool.query(
        'INSERT INTO answer_options (question_id, option_text, associated_value) VALUES ($1, $2, $3)',
        [option.question_id, option.option_text, option.associated_value]
      );
      console.log(`✅ Inserted answer option: ${option.option_text}`);
    }

    // Generate quiz start URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const quizStartUrl = `${frontendUrl}/quiz/${quizId}`;
    
    await pool.query(
      'UPDATE quizzes SET quiz_start_url = $1 WHERE quiz_id = $2',
      [quizStartUrl, quizId]
    );

    console.log('🎉 Database seeding completed successfully!');
    console.log('📊 Summary:');
    console.log(`  - 1 quiz inserted (Fitness Goal Quiz)`);
    console.log(`  - ${questions.length} questions inserted`);
    console.log(`  - ${answerOptions.length} answer options inserted`);
    console.log(`  - Quiz URL: ${quizStartUrl}`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run the seed function
seedData().catch(console.error);
