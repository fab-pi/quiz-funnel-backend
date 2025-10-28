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
}
//# sourceMappingURL=SessionService.d.ts.map