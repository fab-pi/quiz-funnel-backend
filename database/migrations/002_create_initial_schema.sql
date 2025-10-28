-- Initial schema migration
-- This migration creates the complete database schema

-- Create quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
    quiz_id SERIAL PRIMARY KEY,
    quiz_name VARCHAR(255) NOT NULL,
    product_page_url VARCHAR(500),
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    brand_logo_url VARCHAR(500),
    color_primary VARCHAR(7), -- Hex color code
    color_secondary VARCHAR(7), -- Hex color code
    color_text_default VARCHAR(7), -- Hex color code
    color_text_hover VARCHAR(7), -- Hex color code
    quiz_start_url VARCHAR(500)
);

-- Create questions table
CREATE TABLE IF NOT EXISTS questions (
    question_id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    image_url VARCHAR(500),
    interaction_type VARCHAR(50) NOT NULL,
    instructions_text VARCHAR(500),
    loader_text VARCHAR(500),
    popup_question TEXT
);

-- Create answer_options table
CREATE TABLE IF NOT EXISTS answer_options (
    option_id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    option_text VARCHAR(500) NOT NULL,
    associated_value VARCHAR(100) NOT NULL,
    option_image_url VARCHAR(500)
);

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id INTEGER PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
    start_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_question_viewed INTEGER REFERENCES questions(question_id),
    is_completed BOOLEAN DEFAULT false,
    final_profile VARCHAR(100),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_term VARCHAR(100),
    utm_content VARCHAR(100)
);

-- Create user_answers table
CREATE TABLE IF NOT EXISTS user_answers (
    answer_id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES user_sessions(session_id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option_id INTEGER NOT NULL REFERENCES answer_options(option_id) ON DELETE CASCADE,
    answer_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_sequence_order ON questions(sequence_order);
CREATE INDEX IF NOT EXISTS idx_answer_options_question_id ON answer_options(question_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_quiz_id ON user_sessions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start_timestamp ON user_sessions(start_timestamp);
CREATE INDEX IF NOT EXISTS idx_user_answers_session_id ON user_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON user_answers(question_id);

-- Add constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_quiz_sequence') THEN
        ALTER TABLE questions ADD CONSTRAINT unique_quiz_sequence UNIQUE (quiz_id, sequence_order);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_session_id_positive') THEN
        ALTER TABLE user_sessions ADD CONSTRAINT check_session_id_positive CHECK (session_id > 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_answer_id_positive') THEN
        ALTER TABLE user_answers ADD CONSTRAINT check_answer_id_positive CHECK (answer_id > 0);
    END IF;
END $$;
