"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MigrationService_1 = require("../services/MigrationService");
const db_1 = __importDefault(require("../config/db"));
const migrationService = new MigrationService_1.MigrationService(db_1.default);
const runMigrations = async () => {
    try {
        console.log('🚀 Starting database migrations...');
        await migrationService.runMigrations();
        console.log('✅ Migration process completed successfully!');
    }
    catch (error) {
        console.error('❌ Migration process failed:', error);
        process.exit(1);
    }
    finally {
        await db_1.default.end();
    }
};
runMigrations().catch(console.error);
//# sourceMappingURL=migrate.js.map