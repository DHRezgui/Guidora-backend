import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TestAppFactory } from './utils/test-app.factory';
import { TestDataFactory } from './utils/test-data.factory';
import { AuthHelper } from './utils/auth.helper';
import { TestModule } from './utils/test.module';
import { UserRole } from './../src/user/entities/user.entity';

describe('OrganizationController (e2e)', () => {
  let app: INestApplication;
  let testData: TestDataFactory;
  let authHelper: AuthHelper;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await TestAppFactory.init(app);

    testData = new TestDataFactory(app);
    authHelper = new AuthHelper(app);
  });

  afterAll(async () => {
    await testData.cleanup();
    await app.close();
  });

  describe('ADMIN-only endpoints', () => {
    let adminToken: string;
    let adminUser: any;

    beforeEach(async () => {
      await testData.cleanup();
      
      adminUser = await testData.createUser({
        email: `admin-${Date.now()}@test.com`,
        password: 'AdminPass123!',
        role: UserRole.ADMIN,
      });
      
      const adminLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: adminUser.email,
          password: 'AdminPass123!',
        });
      adminToken = adminLoginResp.body.access_token;
    });

    it('/organization (POST) should create organization', async () => {
      const createDto = {
        name: 'New Organization E2E',
        apiKey: `e2e-api-key-${Date.now()}`,
        plan: 'PRO',
        maxTours: 50,
        maxUsers: 500,
      };

      const response = await request(app.getHttpServer())
        .post('/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.organization.name).toBe(createDto.name);
      expect(response.body.organization.apiKey).toBe(createDto.apiKey);
    });

    it('/organization (POST) should return 409 for duplicate API key', async () => {
      const apiKey = 'duplicate-api-key-e2e';

      // Créer première organisation
      await request(app.getHttpServer())
        .post('/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Org 1',
          apiKey: apiKey,
          plan: 'STARTER',
        })
        .expect(201);

      // Tenter de créer avec même API key
      const response = await request(app.getHttpServer())
        .post('/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Org 2',
          apiKey: apiKey, // Doublon
          plan: 'STARTER',
        })
        .expect(409);

      expect(response.body.message).toContain('clé API');
    });

    it('/organization (GET) should list all organizations', async () => {
      // Créer quelques organisations
      await testData.createOrganization({ name: 'Org A', apiKey: `api-a-${Date.now()}` });
      await testData.createOrganization({ name: 'Org B', apiKey: `api-b-${Date.now()}` });

      const response = await request(app.getHttpServer())
        .get('/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(2);
    });

    it('/organization/:id (DELETE) should delete organization', async () => {
      const org = await testData.createOrganization({
        name: 'ToDelete',
        apiKey: `delete-key-${Date.now()}`,
      });

      await request(app.getHttpServer())
        .delete(`/organization/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Vérifier suppression
      await request(app.getHttpServer())
        .get(`/organization/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('DEVELOPER access', () => {
    let devToken: string;
    let devUser: any;
    let testOrgId: string;
    let otherOrgId: string;

    beforeEach(async () => {
      await testData.cleanup();

      const org = await testData.createOrganization({
        name: 'Dev Access Test',
        apiKey: `dev-access-key-${Date.now()}`,
      });
      testOrgId = org.id;

      const otherOrg = await testData.createOrganization({
        name: 'Other Organization Hidden',
        apiKey: `other-org-key-${Date.now()}`,
      });
      otherOrgId = otherOrg.id;

      devUser = await testData.createUser({
        email: `dev-${Date.now()}@test.com`,
        password: 'DevPass123!',
        role: UserRole.DEVELOPER,
        organizationId: testOrgId,
      });

      const devLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: devUser.email,
          password: 'DevPass123!',
        });
      devToken = devLoginResp.body.access_token;
    });

    it('/organization (GET) should return only the developer organization', async () => {
      const response = await request(app.getHttpServer())
        .get('/organization')
        .set('Authorization', `Bearer ${devToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.organizations).toHaveLength(1);
      expect(response.body.organizations[0].id).toBe(testOrgId);
    });

    it('/organization/:id (GET) should allow DEVELOPER to view own organization', async () => {
      const response = await request(app.getHttpServer())
        .get(`/organization/${testOrgId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(200);

      expect(response.body.organization.id).toBe(testOrgId);
    });

    it('/organization/:id (GET) should forbid DEVELOPER from viewing another organization', async () => {
      await request(app.getHttpServer())
        .get(`/organization/${otherOrgId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(403);
    });

    it('/organization/:id/users (GET) should allow DEVELOPER to view users in own org', async () => {
      // Créer un utilisateur dans l'organisation
      await testData.createUser({
        email: 'dev-user@test.com',
        password: 'Pass123!',
        organizationId: testOrgId,
      });

      const response = await request(app.getHttpServer())
        .get(`/organization/${testOrgId}/users`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(200);

      expect(response.body.organization.userCount).toBeGreaterThanOrEqual(1);
      response.body.organization.users.forEach((user: any) => {
        expect(user.password).toBeUndefined(); //  Password non exposé
      });
    });

    it('/organization/:id/users/count (GET) should return user count', async () => {
      const response = await request(app.getHttpServer())
        .get(`/organization/${testOrgId}/users/count`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(200);

      expect(response.body.count).toBeGreaterThanOrEqual(0);
    });

    it('/organization (POST) should forbid DEVELOPER from creating organizations', async () => {
      await request(app.getHttpServer())
        .post('/organization')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          name: 'Forbidden Org',
          apiKey: `forbidden-key-${Date.now()}`,
          plan: 'FREE',
        })
        .expect(403);
    });
  });

  describe('USER access', () => {
    let userToken: string;
    let userUser: any;

    beforeEach(async () => {
      await testData.cleanup();
      
      userUser = await testData.createUser({
        email: `user-${Date.now()}@test.com`,
        password: 'UserPass123!',
        role: UserRole.USER,
      });
      
      const userLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userUser.email,
          password: 'UserPass123!',
        });
      userToken = userLoginResp.body.access_token;
    });

    it('/organization (GET) should forbid USER from listing organizations', async () => {
      await request(app.getHttpServer())
        .get('/organization')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('/organization/:id (GET) should forbid USER from viewing organization details', async () => {
      const org = await testData.createOrganization({
        name: 'User Test Org',
        apiKey: `user-test-key-${Date.now()}`,
      });

      await request(app.getHttpServer())
        .get(`/organization/${org.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Organization with users', () => {
    let adminToken: string;
    let adminUser: any;
    let orgId: string;

    beforeEach(async () => {
      await testData.cleanup();
      
      adminUser = await testData.createUser({
        email: `admin2-${Date.now()}@test.com`,
        password: 'AdminPass123!',
        role: UserRole.ADMIN,
      });
      
      const adminLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: adminUser.email,
          password: 'AdminPass123!',
        });
      adminToken = adminLoginResp.body.access_token;

      const org = await testData.createOrganization({
        name: 'Org With Users',
        apiKey: `org-with-users-key-${Date.now()}`,
      });
      orgId = org.id;

      // Créer des utilisateurs dans l'organisation
      await testData.createUser({
        email: `user1-${Date.now()}@org.com`,
        password: 'Pass123!',
        organizationId: orgId,
      });
      await testData.createUser({
        email: `user2-${Date.now()}@org.com`,
        password: 'Pass123!',
        organizationId: orgId,
        isActive: false,
      });
    });

    it('/organization/:id/users (GET) should return users with sanitized data', async () => {
      const response = await request(app.getHttpServer())
        .get(`/organization/${orgId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.organization.userCount).toBe(2);
      expect(response.body.organization.users.length).toBe(2);

      //  Vérifier que le password n'est pas exposé
      response.body.organization.users.forEach((user: any) => {
        expect(user.password).toBeUndefined();
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
      });

      // Vérifier les statuts
      const activeUsers = response.body.organization.users.filter((u: any) => u.isActive);
      expect(activeUsers.length).toBe(1);
    });

    it('/organization/:id/users/count (GET) should count only active users', async () => {
      const response = await request(app.getHttpServer())
        .get(`/organization/${orgId}/users/count`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Doit compter uniquement les utilisateurs actifs
      expect(response.body.count).toBe(1);
    });
  });
});
