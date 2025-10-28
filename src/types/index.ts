export interface SessionStartRequest {
  quiz_id: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;
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
  message: string;
}

export interface UserSession {
  session_id: string;
  quiz_id: string;
  last_question_viewed: number;
  is_completed: boolean;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;
  final_profile?: string;
  created_at: Date;
  updated_at: Date;
}

// Quiz Creation API Types
export interface QuizCreationOption {
  option_text: string;
  associated_value: string;
  option_image_url?: string | null;
}

export interface QuizCreationQuestion {
  sequence_order: number;
  question_text: string;
  interaction_type: 'single_choice' | 'multiple_choice' | 'text_input' | 'image_card' | 'fake_loader' | 'info_screen';
  image_url?: string | null;
  instructions_text?: string | null;
  loader_text?: string | null;
  popup_question?: string | null;
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
  questions: QuizCreationQuestion[];
}

export interface QuizCreationResponse {
  success: boolean;
  message: string;
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
    questions: Array<{
      question_id: number;
      sequence_order: number;
      question_text: string;
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
}
