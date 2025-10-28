import { Pool } from 'pg';
import { BaseService } from './BaseService';
export declare class AdminService extends BaseService {
    constructor(pool: Pool);
    /**
     * Get summary metrics for all quizzes
     */
    getQuizSummaryMetrics(): Promise<any[]>;
}
//# sourceMappingURL=AdminService.d.ts.map