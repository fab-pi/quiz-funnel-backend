"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const checkSchema = async () => {
    try {
        console.log('Checking database schema...');
        // Check if tables exist
        const tablesResult = await database_1.default.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log('Existing tables:', tablesResult.rows.map(row => row.table_name));
        // Check quizzes table structure
        const quizzesSchema = await database_1.default.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'quizzes'
      ORDER BY ordinal_position
    `);
        console.log('\nQuizzes table schema:');
        quizzesSchema.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        // Check questions table structure
        const questionsSchema = await database_1.default.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'questions'
      ORDER BY ordinal_position
    `);
        console.log('\nQuestions table schema:');
        questionsSchema.rows.forEach(row => {
            console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
    }
    catch (error) {
        console.error('Error checking schema:', error);
    }
    finally {
        await database_1.default.end();
    }
};
checkSchema().catch(console.error);
//# sourceMappingURL=check-schema.js.map