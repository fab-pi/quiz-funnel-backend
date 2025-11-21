-- Migration: Add user authentication system
-- This migration creates the user authentication infrastructure:
-- 1. users table - stores user accounts with roles
-- 2. refresh_tokens table - stores JWT refresh tokens for session management
-- 3. email_tokens table - stores one-time tokens for email verification and password reset
-- 4. Adds user_id column to quizzes table for ownership tracking

-- ============================================
-- 1. Create users table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
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

-- ============================================
-- 2. Create refresh_tokens table
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
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

-- ============================================
-- 3. Create email_tokens table
-- ============================================
CREATE TABLE IF NOT EXISTS email_tokens (
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

-- ============================================
-- 4. Add user_id to quizzes table
-- ============================================
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL;

-- ============================================
-- 5. Create indexes for performance
-- ============================================

-- Users table indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role = 'admin';
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) 
    WHERE email_verified = false;

-- Refresh tokens indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(user_id, expires_at) 
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expired ON refresh_tokens(expires_at) 
    WHERE revoked_at IS NULL;

-- Email tokens indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_tokens_token ON email_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_active ON email_tokens(token_type, expires_at) 
    WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_tokens_expired ON email_tokens(expires_at) 
    WHERE used_at IS NULL;

-- Quizzes table indexes
CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user_active ON quizzes(user_id, is_active) 
    WHERE is_active = true;

-- ============================================
-- 6. Create trigger for auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Add constraints and validations
-- ============================================

-- Email format validation (basic check)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_email_format'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_email_format 
            CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
    END IF;
END $$;

-- Password hash length validation (bcrypt is always 60 chars)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_password_hash_length'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_password_hash_length 
            CHECK (LENGTH(password_hash) >= 60);
    END IF;
END $$;

-- Token hash length validation (SHA-256 is always 64 hex chars)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_token_hash_length'
    ) THEN
        ALTER TABLE refresh_tokens ADD CONSTRAINT check_token_hash_length 
            CHECK (LENGTH(token_hash) = 64);
    END IF;
END $$;

-- Email token length validation (minimum 32 chars for security)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_token_length'
    ) THEN
        ALTER TABLE email_tokens ADD CONSTRAINT check_token_length 
            CHECK (LENGTH(token) >= 32);
    END IF;
END $$;

-- ============================================
-- 8. Add comments for documentation
-- ============================================
COMMENT ON TABLE users IS 'User accounts with authentication and authorization';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for session management';
COMMENT ON TABLE email_tokens IS 'One-time tokens for email verification and password reset';

COMMENT ON COLUMN users.password_hash IS 'bcrypt hashed password (60 characters minimum)';
COMMENT ON COLUMN users.role IS 'User role: user or admin';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';

COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of refresh token (64 hex characters)';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was revoked (NULL if still active)';

COMMENT ON COLUMN email_tokens.token IS 'Plain text token for one-time use (minimum 32 characters)';
COMMENT ON COLUMN email_tokens.token_type IS 'Type of token: email_verification or password_reset';
COMMENT ON COLUMN email_tokens.used_at IS 'Timestamp when token was used (NULL if not used yet)';

COMMENT ON COLUMN quizzes.user_id IS 'Owner of the quiz. NULL for legacy quizzes assigned in migration 013';

