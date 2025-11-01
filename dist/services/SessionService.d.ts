import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { SessionStartRequest, SessionStartResponse, SessionUpdateRequest, SessionUpdateResponse, AnswerSubmissionRequest, AnswerSubmissionResponse } from '../types';
export declare class SessionService extends BaseService {
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
     * Get UTM parameters for a session
     * Used to retrieve stored UTM params for appending to redirect URLs
     */
    getSessionUTMParams(sessionId: string): Promise<Record<string, string> | null>;
}
//# sourceMappingURL=SessionService.d.ts.map