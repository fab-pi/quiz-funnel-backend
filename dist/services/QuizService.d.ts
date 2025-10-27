import { Pool } from 'pg';
import { SessionStartRequest, SessionStartResponse, SessionUpdateRequest, SessionUpdateResponse, AnswerSubmissionRequest, AnswerSubmissionResponse, QuizCreationRequest, QuizCreationResponse } from '../types';
export declare class QuizService {
    private pool;
    constructor(pool: Pool);
    /**
     * Start a new quiz session
     */
    startSession(data: SessionStartRequest): Promise<SessionStartResponse>;
    /**
     * Update session progress
     */
    updateSession(data: SessionUpdateRequest): Promise<SessionUpdateResponse>;
    /**
     * Submit an answer
     */
    submitAnswer(data: AnswerSubmissionRequest): Promise<AnswerSubmissionResponse>;
    /**
     * Complete a session
     */
    completeSession(sessionId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get quiz content
     */
    getQuizContent(quizId: string): Promise<any>;
    /**
     * Create a new quiz with full structure
     */
    createQuiz(data: QuizCreationRequest): Promise<QuizCreationResponse>;
    /**
     * Get drop rate analytics
     */
    getDropRateAnalytics(quizId: string): Promise<any[]>;
    /**
     * Get UTM performance analytics
     */
    getUTMPerformanceAnalytics(quizId: string): Promise<any[]>;
    getQuizSummaryMetrics(): Promise<any[]>;
}
//# sourceMappingURL=QuizService.d.ts.map