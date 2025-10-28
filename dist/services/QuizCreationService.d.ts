import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { QuizCreationRequest, QuizCreationResponse } from '../types';
export declare class QuizCreationService extends BaseService {
    constructor(pool: Pool);
    /**
     * Create a new quiz with full structure
     */
    createQuiz(data: QuizCreationRequest): Promise<QuizCreationResponse>;
}
//# sourceMappingURL=QuizCreationService.d.ts.map