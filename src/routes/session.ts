import { Router, Request, Response } from 'express';
import pool from '../config/db';
import { SessionStartRequest, SessionStartResponse, QuizCreationRequest, QuizCreationResponse } from '../types';

const router = Router();

// Debug: Log route definitions
console.log('🔧 Defining session routes:');
console.log('  - POST /session/start');
console.log('  - POST /session/update');
console.log('  - POST /session/answers');
console.log('  - POST /session/complete');
console.log('  - GET /content/quiz/:quizId');
console.log('  - GET /analytics/drop-rate/:quizId');
console.log('  - GET /analytics/utm-performance/:quizId');
console.log('  - POST /admin/quiz');

// POST /session/start
router.post('/session/start', async (req: Request, res: Response) => {
  try {
    const { quiz_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content }: SessionStartRequest = req.body;

    // Validate required fields
    if (!quiz_id) {
      return res.status(400).json({
        success: false,
        message: 'quiz_id is required'
      });
    }

    // Verify quiz exists
    const quizCheck = await pool.query(
      'SELECT quiz_id FROM quizzes WHERE quiz_id = $1',
      [parseInt(quiz_id)]
    );

    if (quizCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Generate session ID (using smaller number to fit in integer)
    const sessionId = Math.floor(Math.random() * 1000000) + 1000;

    // Insert new session
    const result = await pool.query(
      `INSERT INTO user_sessions 
       (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING session_id`,
      [sessionId, parseInt(quiz_id), new Date(), null, false, utm_source, utm_medium, utm_campaign]
    );

    const response: SessionStartResponse = {
      session_id: result.rows[0].session_id,
      success: true,
      message: 'Session started successfully'
    };

    console.log(`✅ New session started: ${sessionId} for quiz: ${quiz_id}`);
    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Error starting session:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /session/update
router.post('/session/update', async (req: Request, res: Response) => {
  try {
    const { sessionId, lastQuestionId } = req.body;

    // Validate required fields
    if (!sessionId || !lastQuestionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId and lastQuestionId are required'
      });
    }

    // Verify session exists
    const sessionCheck = await pool.query(
      'SELECT session_id FROM user_sessions WHERE session_id = $1',
      [parseInt(sessionId)]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Update session progress (set to NULL if no questions exist yet)
    await pool.query(
      'UPDATE user_sessions SET last_question_viewed = $1 WHERE session_id = $2',
      [parseInt(lastQuestionId), parseInt(sessionId)]
    );

    console.log(`✅ Session ${sessionId} updated: last_question_viewed = ${lastQuestionId}`);
    res.status(200).json({
      success: true,
      message: 'Session updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating session:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /session/answers
router.post('/session/answers', async (req: Request, res: Response) => {
  try {
    const { sessionId, questionId, selectedOptionId } = req.body;

    // Validate required fields
    if (!sessionId || !questionId || !selectedOptionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId, questionId, and selectedOptionId are required'
      });
    }

    // Verify session exists
    const sessionCheck = await pool.query(
      'SELECT session_id FROM user_sessions WHERE session_id = $1',
      [parseInt(sessionId)]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Insert user answer
    const result = await pool.query(
      `INSERT INTO user_answers 
       (answer_id, session_id, question_id, selected_option_id, answer_timestamp)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING answer_id, session_id, question_id, selected_option_id`,
      [Math.floor(Math.random() * 1000000) + 1000, parseInt(sessionId), parseInt(questionId), parseInt(selectedOptionId), new Date()]
    );

    console.log(`✅ Answer saved: Session ${sessionId}, Question ${questionId}, Option ${selectedOptionId}`);
    res.status(201).json({
      success: true,
      message: 'Answer saved successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error saving answer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /session/complete
router.post('/session/complete', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required'
      });
    }

    // Verify session exists
    const sessionCheck = await pool.query(
      'SELECT session_id FROM user_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Update session to completed
    const result = await pool.query(
      `UPDATE user_sessions 
       SET is_completed = true, 
           final_profile = 'Completed'
       WHERE session_id = $1
       RETURNING session_id, is_completed`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to complete session'
      });
    }

    console.log(`✅ Session ${sessionId} completed successfully`);

    res.status(200).json({
      success: true,
      session_id: result.rows[0].session_id,
      is_completed: result.rows[0].is_completed,
      message: 'Session completed successfully'
    });

  } catch (error) {
    console.error('❌ Error completing session:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /content/quiz/:quizId
router.get('/content/quiz/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quizId parameter
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quiz ID'
      });
    }

    // Verify quiz exists
    const quizCheck = await pool.query(
      'SELECT quiz_id, quiz_name FROM quizzes WHERE quiz_id = $1 AND is_active = true',
      [parseInt(quizId)]
    );

    if (quizCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found or inactive'
      });
    }

    // Fetch questions and their options with efficient JOIN query
    const quizContent = await pool.query(`
      SELECT 
        q.question_id,
        q.sequence_order,
        q.question_text,
        q.interaction_type,
        q.image_url,
        q.instructions_text,
        ao.option_id,
        ao.option_text,
        ao.associated_value
      FROM questions q
      LEFT JOIN answer_options ao ON q.question_id = ao.question_id
      WHERE q.quiz_id = $1
      ORDER BY q.sequence_order, ao.option_id
    `, [parseInt(quizId)]);

    if (quizContent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No questions found for this quiz'
      });
    }

    // Structure the response for frontend consumption
    const questionsMap = new Map();
    
    quizContent.rows.forEach(row => {
      const questionId = row.question_id;
      
      if (!questionsMap.has(questionId)) {
        questionsMap.set(questionId, {
          question_id: row.question_id,
          sequence_order: row.sequence_order,
          question_text: row.question_text,
          interaction_type: row.interaction_type,
          image_url: row.image_url,
          instructions_text: row.instructions_text,
          options: []
        });
      }
      
      // Add option if it exists
      if (row.option_id) {
        questionsMap.get(questionId).options.push({
          option_id: row.option_id,
          option_text: row.option_text,
          associated_value: row.associated_value
        });
      }
    });

    // Convert map to array and sort by sequence_order
    const questions = Array.from(questionsMap.values())
      .sort((a, b) => a.sequence_order - b.sequence_order);

    console.log(`✅ Quiz content fetched: ${questions.length} questions for quiz ${quizId}`);
    
    res.status(200).json({
      success: true,
      quiz_id: parseInt(quizId),
      quiz_name: quizCheck.rows[0].quiz_name,
      questions: questions
    });

  } catch (error) {
    console.error('❌ Error fetching quiz content:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /analytics/drop-rate/:quizId
router.get('/analytics/drop-rate/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Get drop rate analytics
    const result = await pool.query(`
      SELECT 
        q.question_id,
        q.question_text,
        COUNT(us.session_id) as reached_count,
        CASE 
          WHEN COUNT(us.session_id) = 0 THEN 0
          ELSE ROUND(
            (COUNT(us.session_id) - COUNT(ua.answer_id))::numeric / COUNT(us.session_id)::numeric * 100, 
            2
          )
        END as drop_rate_percentage
      FROM questions q
      LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
        AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
      LEFT JOIN user_answers ua ON ua.session_id = us.session_id 
        AND ua.question_id = q.question_id
      WHERE q.quiz_id = $1
      GROUP BY q.question_id, q.question_text, q.sequence_order
      ORDER BY q.sequence_order
    `, [parseInt(quizId)]);

    console.log(`✅ Drop rate analytics fetched for quiz ${quizId}: ${result.rows.length} questions`);

    res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching drop rate analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /analytics/utm-performance/:quizId
router.get('/analytics/utm-performance/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Get UTM performance analytics
    const result = await pool.query(`
      SELECT 
        COALESCE(utm_source, 'Direct') as utm_source,
        COALESCE(utm_campaign, 'N/A') as utm_campaign,
        COUNT(session_id) as total_sessions,
        ROUND(
          COUNT(CASE WHEN is_completed = true THEN 1 END)::numeric / COUNT(session_id)::numeric * 100, 
          2
        ) as completion_rate
      FROM user_sessions 
      WHERE quiz_id = $1
      GROUP BY utm_source, utm_campaign
      ORDER BY total_sessions DESC
    `, [parseInt(quizId)]);

    console.log(`✅ UTM performance analytics fetched for quiz ${quizId}: ${result.rows.length} sources`);

    res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching UTM performance analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /admin/quiz - Create new quiz with full structure
router.post('/admin/quiz', async (req: Request, res: Response) => {
  const client = await pool.connect();
  
  try {
    const quizData: QuizCreationRequest = req.body;

    // Validate required fields
    if (!quizData.quiz_name || !quizData.product_page_url || !quizData.questions || !Array.isArray(quizData.questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_name, product_page_url, and questions array are required'
      });
    }

    // Validate questions structure
    for (const question of quizData.questions) {
      if (!question.question_text || !question.interaction_type || !question.options || !Array.isArray(question.options)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text, interaction_type, and options array'
        });
      }

      // Validate options structure
      for (const option of question.options) {
        if (!option.option_text || !option.associated_value) {
          return res.status(400).json({
            success: false,
            message: 'Each option must have option_text and associated_value'
          });
        }
      }
    }

    // Start transaction
    await client.query('BEGIN');

    console.log('🔄 Starting quiz creation transaction...');

    // 1. Insert into Quizzes table
    const quizResult = await client.query(`
      INSERT INTO quizzes (
        quiz_name, 
        product_page_url, 
        is_active, 
        brand_logo_url, 
        color_primary, 
        color_secondary, 
        color_text_default, 
        color_text_hover,
        creation_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING quiz_id
    `, [
      quizData.quiz_name,
      quizData.product_page_url,
      quizData.is_active,
      quizData.brand_logo_url || null,
      quizData.color_primary,
      quizData.color_secondary,
      quizData.color_text_default,
      quizData.color_text_hover,
      new Date()
    ]);

    const quizId = quizResult.rows[0].quiz_id;
    console.log(`✅ Quiz created with ID: ${quizId}`);

    // 2. Insert questions and options
    const createdQuestions = [];

    for (const question of quizData.questions) {
      // Insert question
      const questionResult = await client.query(`
        INSERT INTO questions (
          quiz_id, 
          sequence_order, 
          question_text, 
          interaction_type, 
          image_url
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING question_id
      `, [
        quizId,
        question.sequence_order,
        question.question_text,
        question.interaction_type,
        question.image_url || null
      ]);

      const questionId = questionResult.rows[0].question_id;
      console.log(`✅ Question created with ID: ${questionId}`);

      // Insert options for this question
      const createdOptions = [];
      for (const option of question.options) {
        const optionResult = await client.query(`
          INSERT INTO answer_options (
            question_id, 
            option_text, 
            associated_value, 
            option_image_url
          ) VALUES ($1, $2, $3, $4)
          RETURNING option_id
        `, [
          questionId,
          option.option_text,
          option.associated_value,
          option.option_image_url || null
        ]);

        const optionId = optionResult.rows[0].option_id;
        createdOptions.push({
          option_id: optionId,
          option_text: option.option_text,
          associated_value: option.associated_value,
          option_image_url: option.option_image_url
        });
      }

      createdQuestions.push({
        question_id: questionId,
        sequence_order: question.sequence_order,
        question_text: question.question_text,
        interaction_type: question.interaction_type,
        image_url: question.image_url,
        options: createdOptions
      });
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log(`✅ Quiz creation transaction completed successfully for quiz ID: ${quizId}`);

    // Return the created quiz structure
    const response: QuizCreationResponse = {
      success: true,
      message: 'Quiz created successfully',
      quiz_id: quizId,
      created_quiz: {
        quiz_id: quizId,
        quiz_name: quizData.quiz_name,
        product_page_url: quizData.product_page_url,
        is_active: quizData.is_active,
        brand_logo_url: quizData.brand_logo_url,
        color_primary: quizData.color_primary,
        color_secondary: quizData.color_secondary,
        color_text_default: quizData.color_text_default,
        color_text_hover: quizData.color_text_hover,
        questions: createdQuestions
      }
    };

    res.status(201).json(response);

  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('❌ Error creating quiz, transaction rolled back:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz. Transaction rolled back.',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

export default router;
