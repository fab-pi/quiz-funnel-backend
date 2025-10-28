import { Pool } from 'pg';
import { BaseService } from './BaseService';
export declare class AnalyticsService extends BaseService {
    constructor(pool: Pool);
    /**
     * Get drop rate analytics
     */
    getDropRateAnalytics(quizId: string): Promise<any[]>;
    /**
     * Get UTM performance analytics
     */
    getUTMPerformanceAnalytics(quizId: string): Promise<any[]>;
}
//# sourceMappingURL=AnalyticsService.d.ts.map