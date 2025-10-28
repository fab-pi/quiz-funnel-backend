"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../config/db"));
const showMigrations = async () => {
    try {
        console.log('📋 Current Migrations Table Contents:');
        console.log('=====================================');
        const result = await db_1.default.query('SELECT * FROM migrations ORDER BY id');
        if (result.rows.length === 0) {
            console.log('No migrations found.');
            return;
        }
        result.rows.forEach((row, index) => {
            console.log(`\n${index + 1}. Migration Record:`);
            console.log(`   ID: ${row.id}`);
            console.log(`   Name: ${row.migration_name}`);
            console.log(`   Applied At: ${new Date(row.applied_at).toLocaleString()}`);
            console.log(`   Checksum: ${row.checksum.substring(0, 16)}...`);
        });
        console.log(`\n📊 Total Migrations Applied: ${result.rows.length}`);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await db_1.default.end();
    }
};
showMigrations().catch(console.error);
//# sourceMappingURL=show-migrations.js.map