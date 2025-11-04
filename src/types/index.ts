export interface SessionStartRequest {
  quiz_id: string;
  utm_params?: Record<string, string>;
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

export interface QuizCreationQuestion {
  question_id?: number; // Present when updating existing question
  sequence_order: number;
  question_text: string;
  interaction_type: 'single_choice' | 'multiple_choice' | 'text_input' | 'image_card' | 'fake_loader' | 'info_screen' | 'result_page';
  image_url?: string | null;
  instructions_text?: string | null;
  loader_text?: string | null;
  popup_question?: string | null;
  loader_bars?: LoaderBar[] | null;
  result_page_config?: ResultPageConfig | null;
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
  };
}
