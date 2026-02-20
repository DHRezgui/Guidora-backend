"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestDataFactory = void 0;
const user_service_1 = require("./../../src/user/user.service");
const organization_service_1 = require("./../../src/organization/organization.service");
const user_entity_1 = require("./../../src/user/entities/user.entity");
const typeorm_1 = require("typeorm");
class TestDataFactory {
    app;
    userService;
    organizationService;
    dataSource;
    constructor(app) {
        this.app = app;
        this.userService = app.get(user_service_1.UserService);
        this.organizationService = app.get(organization_service_1.OrganizationService);
        this.dataSource = app.get(typeorm_1.DataSource);
    }
    async createUser(data = {}) {
        return this.userService.create({
            email: data.email || `user-${Date.now()}@test.com`,
            password: data.password || 'TestPass123!',
            firstName: data.firstName || 'Test',
            lastName: data.lastName || 'User',
            role: data.role || user_entity_1.UserRole.USER,
            isActive: data.isActive !== undefined ? data.isActive : true,
            organizationId: data.organizationId,
        });
    }
    async createOrganization(data = {}) {
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
        try {
            if (this.dataSource && this.dataSource.isInitialized) {
                const entities = this.dataSource.entityMetadatas;
                for (const entity of entities) {
                    const repository = this.dataSource.getRepository(entity.name);
                    await repository.query(`DELETE FROM "${entity.tableName}"`).catch(() => { });
                }
            }
        }
        catch (error) {
            console.log('Cleanup error (non-critical):', error?.message || error);
        }
    }
}
exports.TestDataFactory = TestDataFactory;
//# sourceMappingURL=test-data.factory.js.map