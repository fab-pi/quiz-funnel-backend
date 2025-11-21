-- Quiz Funnel Database Schema
-- This file contains the complete database schema for the Quiz Funnel application

-- Enable UUID extension (if needed in the future)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS user_answers CASCADE;
DROP TABLE IF EXISTS answer_options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS email_tokens CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;

-- Create users table (authentication)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user' 
        CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create refresh_tokens table (JWT refresh tokens)
CREATE TABLE refresh_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL 
        REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT check_not_expired CHECK (expires_at > created_at),
    CONSTRAINT check_revoked_after_created CHECK (
        revoked_at IS NULL OR revoked_at >= created_at
    )
);

-- Create email_tokens table (email verification and password reset)
CREATE TABLE email_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL 
        REFERENCES users(user_id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    token_type VARCHAR(50) NOT NULL 
        CHECK (token_type IN ('email_verification', 'password_reset')),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    CONSTRAINT check_not_expired CHECK (expires_at > created_at),
    CONSTRAINT check_used_after_created CHECK (
        used_at IS NULL OR used_at >= created_at
    )
);

-- Create quizzes table
CREATE TABLE quizzes (
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
    quiz_start_url VARCHAR(500),
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    custom_domain VARCHAR(255) -- Custom domain/subdomain for this quiz (e.g., shop.brandx.com)
);

-- Create questions table
CREATE TABLE questions (
    question_id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    question_text TEXT, -- Optional for info_screen, required for other types
    image_url VARCHAR(500),
    interaction_type VARCHAR(50) NOT NULL,
    instructions_text VARCHAR(500),
    loader_text VARCHAR(500),
    popup_question TEXT,
    loader_bars JSONB,
    result_page_config JSONB,
    timeline_projection_config JSONB,
    educational_box_title VARCHAR(500),
    educational_box_text TEXT,
    is_archived BOOLEAN DEFAULT false
);

-- Create answer_options table
CREATE TABLE answer_options (
    option_id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    option_text VARCHAR(500) NOT NULL,
    associated_value VARCHAR(100) NOT NULL,
    option_image_url VARCHAR(500),
    is_archived BOOLEAN DEFAULT false
);

-- Create user_sessions table
CREATE TABLE user_sessions (
    session_id INTEGER PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
    start_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_question_viewed INTEGER REFERENCES questions(question_id),
    is_completed BOOLEAN DEFAULT false,
    final_profile VARCHAR(100),
    utm_params JSONB
);

-- Create user_answers table
CREATE TABLE user_answers (
    answer_id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES user_sessions(session_id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option_id INTEGER NOT NULL REFERENCES answer_options(option_id) ON DELETE CASCADE,
    answer_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance

-- Users table indexes
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role) WHERE role = 'admin';
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_email_verified ON users(email_verified) 
    WHERE email_verified = false;

-- Refresh tokens indexes
CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(user_id, expires_at) 
    WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expired ON refresh_tokens(expires_at) 
    WHERE revoked_at IS NULL;

-- Email tokens indexes
CREATE UNIQUE INDEX idx_email_tokens_token ON email_tokens(token);
CREATE INDEX idx_email_tokens_user_id ON email_tokens(user_id);
CREATE INDEX idx_email_tokens_active ON email_tokens(token_type, expires_at) 
    WHERE used_at IS NULL;
CREATE INDEX idx_email_tokens_expired ON email_tokens(expires_at) 
    WHERE used_at IS NULL;

-- Quiz-related indexes
CREATE INDEX idx_questions_quiz_id ON questions(quiz_id);
CREATE INDEX idx_questions_sequence_order ON questions(sequence_order);
CREATE INDEX idx_answer_options_question_id ON answer_options(question_id);
CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX idx_quizzes_user_active ON quizzes(user_id, is_active) 
    WHERE is_active = true;

-- Indexes for soft delete (is_archived) filtering
CREATE INDEX idx_questions_is_archived ON questions(is_archived) WHERE is_archived = false;
CREATE INDEX idx_answer_options_is_archived ON answer_options(is_archived) WHERE is_archived = false;
CREATE INDEX idx_user_sessions_quiz_id ON user_sessions(quiz_id);
CREATE INDEX idx_user_sessions_start_timestamp ON user_sessions(start_timestamp);
CREATE INDEX idx_user_sessions_utm_params ON user_sessions USING GIN (utm_params);
CREATE INDEX idx_user_answers_session_id ON user_answers(session_id);
CREATE INDEX idx_user_answers_question_id ON user_answers(question_id);

-- Create trigger function for auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
-- Note: unique_quiz_sequence constraint is replaced by partial unique index
-- that only applies to non-archived questions (see below)

-- User constraints
ALTER TABLE users ADD CONSTRAINT check_email_format 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE users ADD CONSTRAINT check_password_hash_length 
    CHECK (LENGTH(password_hash) >= 60);

-- Token constraints
ALTER TABLE refresh_tokens ADD CONSTRAINT check_token_hash_length 
    CHECK (LENGTH(token_hash) = 64);
ALTER TABLE email_tokens ADD CONSTRAINT check_token_length 
    CHECK (LENGTH(token) >= 32);

-- Session constraints
ALTER TABLE user_sessions ADD CONSTRAINT check_session_id_positive CHECK (session_id > 0);
ALTER TABLE user_answers ADD CONSTRAINT check_answer_id_positive CHECK (answer_id > 0);

-- Partial unique index for sequence_order (only applies to active questions)
-- This allows archived questions to have duplicate sequence_order values
CREATE UNIQUE INDEX unique_active_quiz_sequence 
ON questions(quiz_id, sequence_order) 
WHERE is_archived = false OR is_archived IS NULL;

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts with authentication and authorization';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for session management';
COMMENT ON TABLE email_tokens IS 'One-time tokens for email verification and password reset';
COMMENT ON TABLE quizzes IS 'Stores quiz definitions and configuration';
COMMENT ON TABLE questions IS 'Stores questions for each quiz';
COMMENT ON TABLE answer_options IS 'Stores answer options for each question';
COMMENT ON TABLE user_sessions IS 'Tracks user quiz sessions and progress';
COMMENT ON TABLE user_answers IS 'Stores user answers for each question';

COMMENT ON COLUMN users.password_hash IS 'bcrypt hashed password (60 characters minimum)';
COMMENT ON COLUMN users.role IS 'User role: user or admin';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of refresh token (64 hex characters)';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was revoked (NULL if still active)';
COMMENT ON COLUMN email_tokens.token IS 'Plain text token for one-time use (minimum 32 characters)';
COMMENT ON COLUMN email_tokens.token_type IS 'Type of token: email_verification or password_reset';
COMMENT ON COLUMN email_tokens.used_at IS 'Timestamp when token was used (NULL if not used yet)';
COMMENT ON COLUMN quizzes.user_id IS 'Owner of the quiz. NULL for legacy quizzes';
COMMENT ON COLUMN quizzes.color_primary IS 'Primary color hex code (e.g., #FF5733)';
COMMENT ON COLUMN quizzes.color_secondary IS 'Secondary color hex code (e.g., #33FF57)';
COMMENT ON COLUMN quizzes.color_text_default IS 'Default text color hex code';
COMMENT ON COLUMN quizzes.color_text_hover IS 'Hover text color hex code';
COMMENT ON COLUMN quizzes.custom_domain IS 'Custom domain/subdomain for this quiz (e.g., shop.brandx.com). NULL means quiz uses default domain.';
COMMENT ON COLUMN questions.interaction_type IS 'Type of interaction (multiple_choice, single_choice, etc.)';
COMMENT ON COLUMN user_sessions.session_id IS 'Unique session identifier (generated by application)';
COMMENT ON COLUMN user_sessions.utm_params IS 'JSONB object storing all UTM parameters (utm_source, utm_campaign, utm_medium, utm_term, utm_content, and any custom utm_* parameters)';
COMMENT ON COLUMN user_answers.answer_id IS 'Unique answer identifier (generated by application)';

