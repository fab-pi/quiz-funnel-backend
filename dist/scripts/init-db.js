"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MigrationService_1 = require("../services/MigrationService");
const db_1 = __importDefault(require("../config/db"));
const initializeDatabase = async () => {
    try {
        console.log('🚀 Initializing database...');
        // Run migrations first
        const migrationService = new MigrationService_1.MigrationService(db_1.default);
        await migrationService.runMigrations();
        console.log('✅ Database initialization completed successfully!');
        console.log('\n📋 Available commands:');
        console.log('   npm run migrate          - Run pending migrations');
        console.log('   npm run migration-status - Check migration status');
        console.log('   npm run seed            - Seed database with test data');
        console.log('   npm run check-schema    - Check database schema');
    }
    catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
    finally {
        await db_1.default.end();
    }
};
initializeDatabase().catch(console.error);
//# sourceMappingURL=init-db.js.map