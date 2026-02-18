import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TestAppFactory } from './utils/test-app.factory';
import { TestDataFactory } from './utils/test-data.factory';
import { AuthHelper } from './utils/auth.helper';
import { TestModule } from './utils/test.module';
import { UserRole } from './../src/user/entities/user.entity';

describe('UserController (e2e)', () => {
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

  describe('Public endpoints', () => {
    beforeEach(async () => {
      await testData.cleanup();
    });
    it('/user/register (POST) should create user without auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/user/register')
        .send({
          email: 'public@test.com',
          password: 'PublicPass123!',
          firstName: 'Public',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBeDefined();
      expect(response.body.user.password).toBeUndefined(); // ✅ Password non exposé
    });

    it('/user/login (POST) should authenticate without auth', async () => {
      const user = await testData.createUser({
        email: 'publiclogin@test.com',
        password: 'LoginPass123!',
      });

      const response = await request(app.getHttpServer())
        .post('/user/login')
        .send({
          email: 'publiclogin@test.com',
          password: 'LoginPass123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(user.id);
    });
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

    it('/user (GET) should return all users for ADMIN', async () => {
      // Créer quelques utilisateurs de test
      await testData.createUser({ email: 'user1@test.com', password: 'Pass123!' });
      await testData.createUser({ email: 'user2@test.com', password: 'Pass123!' });

      const response = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(3); // Admin + 2 users
      response.body.users.forEach((user: any) => {
        expect(user.password).toBeUndefined(); // ✅ Password non exposé
      });
    });

    it('/user (GET) should return 403 for non-ADMIN user', async () => {
      const regularUser = await testData.createUser({
        email: `user-${Date.now()}@test.com`,
        password: 'UserPass123!',
        role: UserRole.USER,
      });

      const userLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: regularUser.email,
          password: 'UserPass123!',
        });
      const userToken = userLoginResp.body.access_token;

      await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('/user/:id (DELETE) should delete user as ADMIN', async () => {
      const userToDelete = await testData.createUser({
        email: 'delete@test.com',
        password: 'DeletePass123!',
      });

      await request(app.getHttpServer())
        .delete(`/user/${userToDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Vérifier que l'utilisateur est supprimé
      await request(app.getHttpServer())
        .get(`/user/${userToDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('/user/:id/assign-organization (POST) should assign user to org', async () => {
      const user = await testData.createUser({
        email: 'assign@test.com',
        password: 'Pass123!',
      });

      const org = await testData.createOrganization({
        name: 'Test Org for Assignment',
        apiKey: 'test-api-key-assign',
      });

      const response = await request(app.getHttpServer())
        .post(`/user/${user.id}/assign-organization`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ organizationName: org.name })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.organizationId).toBe(org.id);
    });
  });

  describe('Role-based access control', () => {
    let adminToken: string;
    let devToken: string;
    let userToken: string;
    let testUserId: string;
    let adminUser: any;
    let devUser: any;
    let userUser: any;

    beforeEach(async () => {
      await testData.cleanup();
      
      // Create admin user directly
      adminUser = await testData.createUser({
        email: `admin-rbac-${Date.now()}@test.com`,
        password: 'AdminPass123!',
        role: UserRole.ADMIN,
      });
      
      // Login admin
      const adminLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: adminUser.email,
          password: 'AdminPass123!',
        });
      adminToken = adminLoginResp.body.access_token;
      
      // Create dev user
      devUser = await testData.createUser({
        email: `dev-rbac-${Date.now()}@test.com`,
        password: 'DevPass123!',
        role: UserRole.DEVELOPER,
      });
      
      // Login dev
      const devLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: devUser.email,
          password: 'DevPass123!',
        });
      devToken = devLoginResp.body.access_token;
      
      // Create regular user
      userUser = await testData.createUser({
        email: `user-rbac-${Date.now()}@test.com`,
        password: 'UserPass123!',
        role: UserRole.USER,
      });
      
      // Login user
      const userLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userUser.email,
          password: 'UserPass123!',
        });
      userToken = userLoginResp.body.access_token;

      // Create test user for viewing
      const testUser = await testData.createUser({
        email: `rbac-test-${Date.now()}@test.com`,
        password: 'RbacPass123!',
        role: UserRole.USER,
      });
      testUserId = testUser.id;
    });

    it('/user/:id (GET) should allow ADMIN to view any user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.user.id).toBe(testUserId);
    });

    it('/user/:id (GET) should allow DEVELOPER to view any user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user/${testUserId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(200);

      expect(response.body.user.id).toBe(testUserId);
    });

    it('/user/:id (GET) should allow USER to view own profile only', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user/${userUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.user.id).toBe(userUser.id);
    });

    it('/user/:id (GET) should forbid USER from viewing other profiles', async () => {
      await request(app.getHttpServer())
        .get(`/user/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('/user/:id (PUT) should allow ADMIN to update any user', async () => {
      await request(app.getHttpServer())
        .put(`/user/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated by Admin' })
        .expect(200);
    });

    it('/user/:id (PUT) should forbid USER from updating other profiles', async () => {
      await request(app.getHttpServer())
        .put(`/user/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'Hacked' })
        .expect(403);
    });

    it('/user/:id (PUT) should forbid non-ADMIN from changing role', async () => {
      const selfUser = await testData.createUser({
        email: `user-role-${Date.now()}@test.com`,
        password: 'UserPass123!',
        role: UserRole.USER,
      });

      const selfLoginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: selfUser.email,
          password: 'UserPass123!',
        });
      const selfToken = selfLoginResp.body.access_token;

      const response = await request(app.getHttpServer())
        .put(`/user/${selfUser.id}`)
        .set('Authorization', `Bearer ${selfToken}`)
        .send({ role: UserRole.ADMIN }) // Tentative d'escalade de privilèges
        .expect(403);

      expect(response.body.message).toContain('rôle');
    });
  });

  describe('User self-management', () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      await testData.cleanup();
      
      const user = await testData.createUser({
        email: `user-${Date.now()}@test.com`,
        password: 'UserPass123!',
        role: UserRole.USER,
      });
      userId = user.id;

      const loginResp = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: user.email,
          password: 'UserPass123!',
        });
      userToken = loginResp.body.access_token;
    });

    it('/user/:id (PUT) should allow user to update own profile', async () => {
      const response = await request(app.getHttpServer())
        .put(`/user/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'SelfUpdated', lastName: 'Profile' })
        .expect(200);

      expect(response.body.user.firstName).toBe('SelfUpdated');
    });

    it('/user/:id/logout (POST) should allow user to logout self', async () => {
      await request(app.getHttpServer())
        .post(`/user/${userId}/logout`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('/user/:id/logout (POST) should forbid user from logging out others', async () => {
      const otherUser = await testData.createUser({
        email: `other-${Date.now()}@test.com`,
        password: 'OtherPass123!',
      });

      await request(app.getHttpServer())
        .post(`/user/${otherUser.id}/logout`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});