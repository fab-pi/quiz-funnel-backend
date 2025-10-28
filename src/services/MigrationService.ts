import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class MigrationService {
  private pool: Pool;
  private migrationsPath: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.migrationsPath = path.join(__dirname, '../../database/migrations');
  }

  /**
   * Initialize the migrations table
   */
  async initializeMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64)
        )
      `);
      console.log('✅ Migrations table initialized');
    } catch (error) {
      console.error('❌ Error initializing migrations table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get list of migration files
   */
  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsPath)) {
      return [];
    }
    
    return fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT migration_name FROM migrations ORDER BY id');
      return result.rows.map(row => row.migration_name);
    } catch (error) {
      console.error('❌ Error getting applied migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Run a single migration
   */
  private async runMigration(migrationFile: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const filePath = path.join(this.migrationsPath, migrationFile);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = this.calculateChecksum(filePath);

      console.log(`🔄 Running migration: ${migrationFile}`);

      // Start transaction
      await client.query('BEGIN');

      // Execute migration SQL
      await client.query(sql);

      // Record migration
      await client.query(
        'INSERT INTO migrations (migration_name, checksum) VALUES ($1, $2)',
        [migrationFile, checksum]
      );

      // Commit transaction
      await client.query('COMMIT');

      console.log(`✅ Migration completed: ${migrationFile}`);
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migrationFile}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      console.log('🔄 Starting migration process...');

      // Initialize migrations table
      await this.initializeMigrations();

      // Get migration files and applied migrations
      const migrationFiles = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      // Find pending migrations
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations');
        return;
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migrations`);

      // Run pending migrations
      for (const migrationFile of pendingMigrations) {
        await this.runMigration(migrationFile);
      }

      console.log('🎉 All migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    migrations: Array<{
      name: string;
      applied: boolean;
      appliedAt?: string;
    }>;
  }> {
    try {
      const migrationFiles = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();

      const migrations = await Promise.all(
        migrationFiles.map(async file => ({
          name: file,
          applied: appliedMigrations.includes(file),
          appliedAt: appliedMigrations.includes(file) 
            ? (await this.getMigrationAppliedAt(file)) 
            : undefined
        }))
      );

      return {
        total: migrationFiles.length,
        applied: appliedMigrations.length,
        pending: migrationFiles.length - appliedMigrations.length,
        migrations
      };
    } catch (error) {
      console.error('❌ Error getting migration status:', error);
      throw error;
    }
  }

  /**
   * Get when a migration was applied
   */
  private async getMigrationAppliedAt(migrationName: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT applied_at FROM migrations WHERE migration_name = $1',
        [migrationName]
      );
      return result.rows[0]?.applied_at || '';
    } catch (error) {
      console.error('❌ Error getting migration applied date:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
