import { INestApplication } from '@nestjs/common';
import { UserService } from './../../src/user/user.service';
import { OrganizationService } from './../../src/organization/organization.service';
import { UserRole } from './../../src/user/entities/user.entity';
import { DataSource } from 'typeorm';

export class TestDataFactory {
  private userService: UserService;
  private organizationService: OrganizationService;
  private dataSource: DataSource;

  constructor(private app: INestApplication) {
    this.userService = app.get(UserService);
    this.organizationService = app.get(OrganizationService);
    this.dataSource = app.get(DataSource);
  }

  async createUser(data: Partial<any> = {}): Promise<any> {
    return this.userService.create({
      email: data.email || `user-${Date.now()}@test.com`,
      password: data.password || 'TestPass123!',
      firstName: data.firstName || 'Test',
      lastName: data.lastName || 'User',
      role: data.role || UserRole.USER,
      isActive: data.isActive !== undefined ? data.isActive : true,
      organizationId: data.organizationId,
    });
  }

  async createOrganization(data: Partial<any> = {}): Promise<any> {
    return this.organizationService.create({
      name: data.name || `Org ${Date.now()}`,
      apiKey: data.apiKey || `api-key-${Date.now()}`,
      plan: data.plan || 'FREE',
      maxTours: data.maxTours || 5,
      maxUsers: data.maxUsers || 100,
      isActive: data.isActive !== undefined ? data.isActive : true,
    });
  }

  async cleanup() {
    // Truncate tables in correct order (foreign keys)
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        // For SQLite, we need to delete records instead of truncate
        const entities = this.dataSource.entityMetadatas;
        
        for (const entity of entities) {
          const repository = this.dataSource.getRepository(entity.name);
          await repository.query(`DELETE FROM "${entity.tableName}"`).catch(() => {});
        }
      }
    } catch (error) {
      console.log('Cleanup error (non-critical):', error?.message || error);
    }
  }
}