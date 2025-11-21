import pool from '../config/db';

const checkLiveSessions = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking live sessions in database...\n');

    // Get all sessions ordered by timestamp
    const allSessions = await client.query(`
      SELECT 
        session_id,
        quiz_id,
        start_timestamp,
        is_completed,
        CASE 
          WHEN session_id IS NULL THEN 'NULL'
          ELSE 'HAS UUID'
        END as status
      FROM user_sessions 
      ORDER BY start_timestamp DESC
    `);

    console.log(`Total sessions: ${allSessions.rows.length}\n`);
    
    const nullCount = allSessions.rows.filter(r => r.session_id === null).length;
    const uuidCount = allSessions.rows.filter(r => r.session_id !== null).length;
    
    console.log(`Sessions with UUID: ${uuidCount}`);
    console.log(`Sessions with NULL: ${nullCount}\n`);

    console.log('Latest 10 sessions:');
    allSessions.rows.slice(0, 10).forEach((row, i) => {
      const id = row.session_id || '[NULL]';
      const idType = row.session_id ? typeof row.session_id : 'null';
      console.log(`${i + 1}. ${id} (${idType}) | quiz: ${row.quiz_id} | ${row.start_timestamp} | ${row.status}`);
    });

    // Check if there's a pattern
    if (nullCount > 0) {
      console.log('\n⚠️  Found NULL sessions. Checking timestamps...');
      const nullSessions = allSessions.rows.filter(r => r.session_id === null);
      const uuidSessions = allSessions.rows.filter(r => r.session_id !== null);
      
      if (nullSessions.length > 0 && uuidSessions.length > 0) {
        const oldestNull = nullSessions[nullSessions.length - 1].start_timestamp;
        const newestUuid = uuidSessions[0].start_timestamp;
        console.log(`   Oldest NULL session: ${oldestNull}`);
        console.log(`   Newest UUID session: ${newestUuid}`);
        
        if (newestUuid > oldestNull) {
          console.log('   ✅ New sessions have UUIDs, old ones are NULL (expected after migration)');
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
};

checkLiveSessions().catch(console.error);

