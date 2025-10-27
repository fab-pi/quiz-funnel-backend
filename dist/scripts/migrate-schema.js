"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../config/db"));
async function migrateSchema() {
    const client = await db_1.default.connect();
    try {
        console.log('🔄 Starting schema migration...');
        // Add loader_text column
        await client.query(`
      ALTER TABLE questions 
      ADD COLUMN IF NOT EXISTS loader_text VARCHAR(255)
    `);
        console.log('✅ Added loader_text column');
        // Add popup_question column
        await client.query(`
      ALTER TABLE questions 
      ADD COLUMN IF NOT EXISTS popup_question TEXT
    `);
        console.log('✅ Added popup_question column');
        console.log('🎉 Schema migration completed successfully!');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally {
        client.release();
    }
}
// Run migration if called directly
if (require.main === module) {
    migrateSchema()
        .then(() => {
        console.log('Migration completed');
        process.exit(0);
    })
        .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}
exports.default = migrateSchema;
//# sourceMappingURL=migrate-schema.js.map