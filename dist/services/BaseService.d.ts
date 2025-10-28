import { Pool } from 'pg';
export declare abstract class BaseService {
    protected pool: Pool;
    constructor(pool: Pool);
    /**
     * Generate a unique integer ID using timestamp + random component
     * This is more robust than Math.random() alone
     */
    protected generateUniqueId(): number;
    /**
     * Execute a database query with proper error handling
     */
    protected executeQuery<T = any>(query: string, params?: any[]): Promise<T[]>;
    /**
     * Execute a database transaction
     */
    protected executeTransaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=BaseService.d.ts.map