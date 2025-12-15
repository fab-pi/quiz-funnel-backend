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
DROP TABLE IF EXISTS shop_usage CASCADE;
DROP TABLE IF EXISTS shop_subscriptions CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS shops CASCADE;

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

-- Create shops table (Shopify app support)
CREATE TABLE shops (
    shop_id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,
    primary_domain VARCHAR(255) NULL, -- Primary domain for the Shopify store (e.g., shop.brandx.com). NULL means store uses default myshopify.com domain.
    access_token TEXT NOT NULL, -- Kept for backward compatibility during migration to session storage
    scope TEXT,
    session_id VARCHAR(255) NULL, -- Shopify session ID (format: offline_{shop} or online_{shop}_{userId}). Used for session storage lookup.
    session_expires TIMESTAMP NULL, -- Session expiration timestamp. NULL for offline sessions (they don't expire).
    session_scope TEXT NULL, -- OAuth scopes granted to this session. Stored separately from scope column for session management.
    session_state VARCHAR(255) NULL, -- OAuth state parameter for CSRF protection. Generated during OAuth initiation.
    session_is_online BOOLEAN DEFAULT false, -- Whether this is an online session (user-specific) or offline session (app-level). Default: false (offline).
    installed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uninstalled_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_uninstalled_after_installed CHECK (
        uninstalled_at IS NULL OR uninstalled_at >= installed_at
    )
);

-- Create shop_subscriptions table (Shopify app billing)
CREATE TABLE shop_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  plan_id VARCHAR(50) NOT NULL CHECK (plan_id IN ('starter', 'advanced', 'scaling')),
  subscription_gid VARCHAR(255) UNIQUE NOT NULL, -- Shopify subscription GID (e.g., gid://shopify/AppSubscription/123456)
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, ACTIVE, CANCELLED, EXPIRED, TRIAL
  trial_days INTEGER DEFAULT 7,
  trial_ends_at TIMESTAMP NULL,
  is_trial BOOLEAN DEFAULT true,
  current_period_end TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_trial_ends_after_created CHECK (
    trial_ends_at IS NULL OR trial_ends_at >= created_at
  ),
  CONSTRAINT check_period_ends_after_created CHECK (
    current_period_end IS NULL OR current_period_end >= created_at
  )
);

-- Create shop_usage table (monthly usage tracking)
CREATE TABLE shop_usage (
  usage_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of billing month (YYYY-MM-01)
  sessions_count INTEGER DEFAULT 0 NOT NULL,
  active_quizzes_count INTEGER DEFAULT 0 NOT NULL, -- Snapshot of active quizzes at month start
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop_id, month),
  CONSTRAINT check_month_format CHECK (
    EXTRACT(DAY FROM month) = 1 -- Ensure it's the first day of the month
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
    shop_id INTEGER REFERENCES shops(shop_id) ON DELETE SET NULL,
    custom_domain VARCHAR(255), -- Custom domain/subdomain for this quiz (e.g., shop.brandx.com)
    facebook_pixel_id VARCHAR(50), -- Facebook Pixel ID for tracking events
    facebook_access_token_encrypted TEXT, -- Encrypted Facebook Conversions API access token
    shopify_page_id BIGINT NULL, -- Shopify page ID for this quiz (NULL if not published to Shopify)
    shopify_page_handle VARCHAR(255) NULL -- Shopify page handle/URL slug (e.g., "quiz-4") used in page URL: store.myshopify.com/pages/quiz-4
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
    utm_params JSONB,
    fbp VARCHAR(255), -- Facebook Browser ID from _fbp cookie
    fbc VARCHAR(500) -- Facebook Click ID from _fbc cookie
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
CREATE INDEX idx_quizzes_facebook_pixel ON quizzes(facebook_pixel_id) 
    WHERE facebook_pixel_id IS NOT NULL;

-- Shops table indexes
CREATE UNIQUE INDEX idx_shops_domain ON shops(shop_domain);
CREATE INDEX idx_shops_installed ON shops(shop_domain) 
    WHERE uninstalled_at IS NULL;
CREATE INDEX idx_shops_uninstalled ON shops(uninstalled_at) 
    WHERE uninstalled_at IS NOT NULL;
CREATE INDEX idx_shops_primary_domain ON shops(primary_domain) 
    WHERE primary_domain IS NOT NULL;
CREATE INDEX idx_shops_session_id ON shops(session_id) 
    WHERE session_id IS NOT NULL;
CREATE INDEX idx_shops_session_expires ON shops(session_expires) 
    WHERE session_expires IS NOT NULL;

-- Quizzes table indexes for shop_id
CREATE INDEX idx_quizzes_shop_id ON quizzes(shop_id) 
    WHERE shop_id IS NOT NULL;
CREATE INDEX idx_quizzes_shop_active ON quizzes(shop_id, is_active) 
    WHERE shop_id IS NOT NULL AND is_active = true;

-- Billing tables indexes
CREATE INDEX idx_subscriptions_shop ON shop_subscriptions(shop_id);
CREATE INDEX idx_subscriptions_status ON shop_subscriptions(status);
CREATE INDEX idx_subscriptions_gid ON shop_subscriptions(subscription_gid);
CREATE INDEX idx_usage_shop_month ON shop_usage(shop_id, month);
CREATE INDEX idx_usage_month ON shop_usage(month);

-- Indexes for Shopify page fields
CREATE INDEX idx_quizzes_shopify_page_id ON quizzes(shopify_page_id) 
    WHERE shopify_page_id IS NOT NULL;
CREATE INDEX idx_quizzes_shopify_page_handle ON quizzes(shopify_page_handle) 
    WHERE shopify_page_handle IS NOT NULL;
CREATE INDEX idx_quizzes_shop_shopify_page ON quizzes(shop_id, shopify_page_id) 
    WHERE shop_id IS NOT NULL AND shopify_page_id IS NOT NULL;

-- Indexes for soft delete (is_archived) filtering
CREATE INDEX idx_questions_is_archived ON questions(is_archived) WHERE is_archived = false;
CREATE INDEX idx_answer_options_is_archived ON answer_options(is_archived) WHERE is_archived = false;
CREATE INDEX idx_user_sessions_quiz_id ON user_sessions(quiz_id);
CREATE INDEX idx_user_sessions_start_timestamp ON user_sessions(start_timestamp);
CREATE INDEX idx_user_sessions_utm_params ON user_sessions USING GIN (utm_params);
CREATE INDEX idx_user_sessions_fbp ON user_sessions(fbp) 
    WHERE fbp IS NOT NULL;
CREATE INDEX idx_user_sessions_fbc ON user_sessions(fbc) 
    WHERE fbc IS NOT NULL;
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

-- Create trigger for shops table
CREATE TRIGGER update_shops_updated_at 
    BEFORE UPDATE ON shops
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for shop_subscriptions table
CREATE TRIGGER update_shop_subscriptions_updated_at 
    BEFORE UPDATE ON shop_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for shop_usage table
CREATE TRIGGER update_shop_usage_updated_at 
    BEFORE UPDATE ON shop_usage
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
COMMENT ON TABLE shops IS 'Shopify shops that have installed the app';
COMMENT ON TABLE shop_subscriptions IS 'Tracks Shopify app subscriptions for each shop. One active subscription per shop at a time.';
COMMENT ON TABLE shop_usage IS 'Tracks monthly usage statistics (sessions, active quizzes) for each shop. One record per shop per month.';
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
COMMENT ON COLUMN shops.shop_domain IS 'Shop domain (e.g., mystore.myshopify.com)';
COMMENT ON COLUMN shops.primary_domain IS 'Primary domain for the Shopify store (e.g., shop.brandx.com). NULL means store uses default myshopify.com domain. This is the custom domain that customers see when visiting the store.';
COMMENT ON COLUMN shops.access_token IS 'Shopify OAuth access token (should be encrypted in production). Kept for backward compatibility during migration to session storage.';
COMMENT ON COLUMN shops.scope IS 'Comma-separated list of granted OAuth scopes';
COMMENT ON COLUMN shops.session_id IS 'Shopify session ID (format: offline_{shop} or online_{shop}_{userId}). Used for session storage lookup.';
COMMENT ON COLUMN shops.session_expires IS 'Session expiration timestamp. NULL for offline sessions (they don''t expire).';
COMMENT ON COLUMN shops.session_scope IS 'OAuth scopes granted to this session. Stored separately from scope column for session management.';
COMMENT ON COLUMN shops.session_state IS 'OAuth state parameter for CSRF protection. Generated during OAuth initiation.';
COMMENT ON COLUMN shops.session_is_online IS 'Whether this is an online session (user-specific) or offline session (app-level). Default: false (offline).';
COMMENT ON COLUMN shops.installed_at IS 'Timestamp when app was installed';
COMMENT ON COLUMN shops.uninstalled_at IS 'Timestamp when app was uninstalled (NULL if currently installed)';
COMMENT ON COLUMN shop_subscriptions.plan_id IS 'Plan ID: starter, advanced, or scaling';
COMMENT ON COLUMN shop_subscriptions.subscription_gid IS 'Shopify GraphQL Global ID for the subscription';
COMMENT ON COLUMN shop_subscriptions.status IS 'Subscription status: PENDING (awaiting approval), ACTIVE (billing active), CANCELLED, EXPIRED, TRIAL';
COMMENT ON COLUMN shop_subscriptions.trial_ends_at IS 'When the trial period ends. NULL if not in trial.';
COMMENT ON COLUMN shop_subscriptions.is_trial IS 'Whether the subscription is currently in trial period';
COMMENT ON COLUMN shop_subscriptions.current_period_end IS 'End date of current billing period';
COMMENT ON COLUMN shop_usage.month IS 'First day of the billing month (YYYY-MM-01)';
COMMENT ON COLUMN shop_usage.sessions_count IS 'Number of quiz sessions started in this month';
COMMENT ON COLUMN shop_usage.active_quizzes_count IS 'Snapshot of active quizzes count at the start of the month';
COMMENT ON COLUMN quizzes.user_id IS 'Owner of the quiz. NULL for legacy quizzes';
COMMENT ON COLUMN quizzes.shop_id IS 'Shopify shop that owns this quiz (NULL for standalone/native user quizzes)';
COMMENT ON COLUMN quizzes.color_primary IS 'Primary color hex code (e.g., #FF5733)';
COMMENT ON COLUMN quizzes.color_secondary IS 'Secondary color hex code (e.g., #33FF57)';
COMMENT ON COLUMN quizzes.color_text_default IS 'Default text color hex code';
COMMENT ON COLUMN quizzes.color_text_hover IS 'Hover text color hex code';
COMMENT ON COLUMN quizzes.custom_domain IS 'Custom domain/subdomain for this quiz (e.g., shop.brandx.com). NULL means quiz uses default domain.';
COMMENT ON COLUMN quizzes.facebook_pixel_id IS 'Facebook Pixel ID for tracking events. NULL means no Pixel tracking configured.';
COMMENT ON COLUMN quizzes.facebook_access_token_encrypted IS 'Encrypted Facebook Conversions API access token. NULL means no server-side tracking configured.';
COMMENT ON COLUMN quizzes.shopify_page_id IS 'Shopify page ID for this quiz (NULL if not published to Shopify)';
COMMENT ON COLUMN quizzes.shopify_page_handle IS 'Shopify page handle/URL slug (e.g., "quiz-4") used in page URL: store.myshopify.com/pages/quiz-4';
COMMENT ON COLUMN questions.interaction_type IS 'Type of interaction (multiple_choice, single_choice, etc.)';
COMMENT ON COLUMN user_sessions.session_id IS 'Unique session identifier (generated by application)';
COMMENT ON COLUMN user_sessions.utm_params IS 'JSONB object storing all UTM parameters (utm_source, utm_campaign, utm_medium, utm_term, utm_content, and any custom utm_* parameters)';
COMMENT ON COLUMN user_sessions.fbp IS 'Facebook Browser ID from _fbp cookie. Used for Conversions API event matching.';
COMMENT ON COLUMN user_sessions.fbc IS 'Facebook Click ID from _fbc cookie. Links events to Facebook ad clicks.';
COMMENT ON COLUMN user_answers.answer_id IS 'Unique answer identifier (generated by application)';

