import { Pool } from 'pg';
export declare class MigrationService {
    private pool;
    private migrationsPath;
    constructor(pool: Pool);
    /**
     * Initialize the migrations table
     */
    initializeMigrations(): Promise<void>;
    /**
     * Get list of migration files
     */
    private getMigrationFiles;
    /**
     * Get applied migrations from database
     */
    private getAppliedMigrations;
    /**
     * Calculate file checksum
     */
    private calculateChecksum;
    /**
     * Run a single migration
     */
    private runMigration;
    /**
     * Run all pending migrations
     */
    runMigrations(): Promise<void>;
    /**
     * Get migration status
     */
    getMigrationStatus(): Promise<{
        total: number;
        applied: number;
        pending: number;
        migrations: Array<{
            name: string;
            applied: boolean;
            appliedAt?: string;
        }>;
    }>;
    /**
     * Get when a migration was applied
     */
    private getMigrationAppliedAt;
}
//# sourceMappingURL=MigrationService.d.ts.map