import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

export class TestAppFactory {
  static async init(app: INestApplication) {
    try {
      const dataSource = app.get(DataSource);
      
      // Ensure database connection is established
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }

      // Synchronize schema without dropping first
      await dataSource.synchronize();

      return { success: true, dataSource };
    } catch (error) {
      console.error('Failed to initialize test database:', error?.message || error);
      throw error;
    }
  }

  static async cleanup(dataSource: DataSource) {
    if (dataSource && dataSource.isInitialized) {
      try {
        // Delete records from tables in correct order (foreign keys)
        const tables = ['organization_users', 'users', 'organizations'];
        for (const table of tables) {
          await dataSource.query(`DELETE FROM "${table}"`).catch(() => {});
        }
      } catch (error) {
        console.log('Cleanup error (non-critical):', error?.message || error);
      }
    }
  }
}