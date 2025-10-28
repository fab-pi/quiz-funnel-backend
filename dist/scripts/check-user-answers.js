"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../config/db"));
const checkUserAnswers = async () => {
    try {
        console.log('Checking user_answers table schema...');
        // Check user_answers table structure
        const userAnswersSchema = await db_1.default.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'user_answers'
      ORDER BY ordinal_position
    `);
        console.log('User_answers table schema:');
        userAnswersSchema.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
    }
    catch (error) {
        console.error('Error checking user_answers:', error);
    }
    finally {
        await db_1.default.end();
    }
};
checkUserAnswers().catch(console.error);
//# sourceMappingURL=check-user-answers.js.map