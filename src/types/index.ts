export interface SessionStartRequest {
  quiz_id: string;
  utm_params?: Record<string, string>;
  fbp?: string | null; // Facebook Browser ID from _fbp cookie
  fbc?: string | null; // Facebook Click ID from _fbc cookie
}

export interface SessionStartResponse {
  session_id: string;
  success: boolean;
  message: string;
}

export interface SessionUpdateRequest {
  sessionId: string;
  lastQuestionId: string;
}

export interface SessionUpdateResponse {
  success: boolean;
  message: string;
}

export interface AnswerSubmissionRequest {
  sessionId: string;
  questionId: string;
  selectedOptionId: string;
}

export interface AnswerSubmissionResponse {
  success: boolean;
  answer_id: string; // UUID of the submitted answer
  message: string;
}

export interface UserSession {
  session_id: string;
  quiz_id: string;
  last_question_viewed: number;
  is_completed: boolean;
  utm_params?: Record<string, string>;
  final_profile?: string;
  created_at: Date;
  updated_at: Date;
}

// Quiz Creation API Types
export interface QuizCreationOption {
  option_id?: number; // Present when updating existing option
  option_text: string;
  associated_value: string;
  option_image_url?: string | null;
}

export interface LoaderBar {
  text_before: string;
  text_after: string;
  popup_header: string;
  popup_question: string;
  order: number;
}

export interface InsightCard {
  icon_name: string;
  title: string;
  value: string;
}

export interface ResultPageConfig {
  section_title: string;
  explanation_box: {
    title: string;
    text: string;
  };
  insight_cards: InsightCard[];
}

export interface TimelineProjectionConfig {
  direction: 'ascendent' | 'descendent';
  months_count: number; // Number of months to add to current date for target date
}

export interface QuizCreationQuestion {
  question_id?: number; // Present when updating existing question
  sequence_order: number;
  question_text: string | null; // Optional for info_screen, required for other types
  interaction_type: 'single_choice' | 'multiple_choice' | 'text_input' | 'image_card' | 'fake_loader' | 'info_screen' | 'result_page' | 'timeline_projection';
  image_url?: string | null;
  instructions_text?: string | null;
  loader_text?: string | null;
  popup_question?: string | null;
  loader_bars?: LoaderBar[] | null;
  result_page_config?: ResultPageConfig | null;
  timeline_projection_config?: TimelineProjectionConfig | null;
  educational_box_title?: string | null;
  educational_box_text?: string | null;
  options: QuizCreationOption[];
}

export interface QuizCreationRequest {
  quiz_name: string;
  product_page_url: string;
  is_active: boolean;
  brand_logo_url?: string | null;
  color_primary: string;
  color_secondary: string;
  color_text_default: string;
  color_text_hover: string;
  custom_domain?: string | null;
  facebook_pixel_id?: string | null;
  facebook_access_token?: string | null; // Plain text token (will be encrypted before storing)
  questions: QuizCreationQuestion[];
}

export interface QuizCreationResponse {
  success: boolean;
  message: string;
  data: {
    quiz_id: number;
    created_quiz: {
      quiz_id: number;
      quiz_name: string;
      product_page_url: string;
      is_active: boolean;
      brand_logo_url?: string | null;
      color_primary: string;
      color_secondary: string;
      color_text_default: string;
      color_text_hover: string;
      custom_domain?: string | null;
      questions: Array<{
        question_id: number;
        sequence_order: number;
        question_text: string | null; // Optional for info_screen
        interaction_type: string;
        image_url?: string | null;
        options: Array<{
          option_id: number;
          option_text: string;
          associated_value: string;
          option_image_url?: string | null;
        }>;
      }>;
    };
  };
}

// ============================================
// Authentication Types
// ============================================

export interface User {
  userId: number;
  email: string;
  fullName: string;
  role: 'user' | 'admin';
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterResponse {
  success: boolean;
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  message?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  message?: string;
}

export interface TokenPayload {
  userId: number;
  email: string;
  role: 'user' | 'admin';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  accessToken: string;
  message?: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetRequestResponse {
  success: boolean;
  message: string;
}

export interface PasswordResetConfirm {
  token: string;
  password: string;
}

export interface PasswordResetConfirmResponse {
  success: boolean;
  message: string;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface EmailVerificationResponse {
  success: boolean;
  message: string;
}

export interface ResendVerificationResponse {
  success: boolean;
  message: string;
}

// Re-export Shopify types
export * from './shopify';
