import { Pool } from 'pg';
import { BaseService } from './BaseService';
export declare class QuizContentService extends BaseService {
    constructor(pool: Pool);
    /**
     * Get quiz content
     */
    getQuizContent(quizId: string): Promise<any>;
}
//# sourceMappingURL=QuizContentService.d.ts.map