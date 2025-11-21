import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import pool from '../config/db';

// Load environment variables
dotenv.config();

/**
 * Script to set or update admin password
 * Usage: npm run set-admin-password
 * Or: ts-node src/scripts/set-admin-password.ts
 */
async function setAdminPassword() {
  const args = process.argv.slice(2);
  
  // Get email and password from command line arguments or prompt
  let email = args[0] || 'admin@example.com';
  let password = args[1];

  // If password not provided, prompt for it
  if (!password) {
    console.log('⚠️  Password not provided as argument.');
    console.log('Usage: npm run set-admin-password [email] [password]');
    console.log('Or provide password via STDIN: echo "password" | npm run set-admin-password [email]');
    console.log('\nFor security, password should be provided as argument or via environment variable.');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    console.log(`🔐 Setting password for admin user: ${email}`);

    // Check if user exists
    const userCheck = await client.query(
      'SELECT user_id, email, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userCheck.rows.length === 0) {
      console.error(`❌ User with email ${email} not found.`);
      console.log('\nAvailable admin users:');
      const allAdmins = await client.query(
        'SELECT user_id, email, role FROM users WHERE role = $1',
        ['admin']
      );
      if (allAdmins.rows.length === 0) {
        console.log('  No admin users found.');
      } else {
        allAdmins.rows.forEach((admin: any) => {
          console.log(`  - ${admin.email} (ID: ${admin.user_id})`);
        });
      }
      process.exit(1);
    }

    const user = userCheck.rows[0];

    // Verify it's an admin user
    if (user.role !== 'admin') {
      console.error(`❌ User ${email} is not an admin user (role: ${user.role}).`);
      process.exit(1);
    }

    // Hash the password
    console.log('🔒 Hashing password...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [passwordHash, user.user_id]
    );

    console.log(`✅ Password updated successfully for admin user: ${email}`);
    console.log(`   User ID: ${user.user_id}`);
    console.log('\n⚠️  IMPORTANT: Keep this password secure and do not share it!');

  } catch (error) {
    console.error('❌ Error setting admin password:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
setAdminPassword().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

