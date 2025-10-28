"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseService = void 0;
class BaseService {
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Generate a unique integer ID using timestamp + random component
     * This is more robust than Math.random() alone
     */
    generateUniqueId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return parseInt(timestamp.toString().slice(-6) + random.toString().padStart(3, '0'));
    }
    /**
     * Execute a database query with proper error handling
     */
    async executeQuery(query, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(query, params);
            return result.rows;
        }
        catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Execute a database transaction
     */
    async executeTransaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Transaction error:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.BaseService = BaseService;
//# sourceMappingURL=BaseService.js.map