import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { Organization, PlanType } from './../src/organization/entities/organization.entity';
import { User, UserRole } from './../src/user/entities/user.entity';
import { ContextualScenario } from './../src/guided-tour/dto/publish-contextual-drafts.dto';

describe('GuidedTour Contextual Publish (full app e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const assertSafeTestDatabase = () => {
    const dbName = process.env.DB_NAME || '';
    if (!dbName.toLowerCase().includes('test')) {
      throw new Error(
        `Unsafe database for destructive e2e cleanup: DB_NAME="${dbName}". Use a dedicated test database.`,
      );
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM "steps"');
      await dataSource.query('DELETE FROM "guided_tours"');
      await dataSource.query('DELETE FROM "users"');
      await dataSource.query('DELETE FROM "organizations"');
    }

    if (app) {
      await app.close();
    }
  });

  it('should apply gating, activation and dedupe rules through HTTP endpoint', async () => {
    assertSafeTestDatabase();

    await dataSource.query('DELETE FROM "steps"');
    await dataSource.query('DELETE FROM "guided_tours"');
    await dataSource.query('DELETE FROM "users"');
    await dataSource.query('DELETE FROM "organizations"');

    const organizationRepo = dataSource.getRepository(Organization);
    const userRepo = dataSource.getRepository(User);

    const organization = await organizationRepo.save(
      organizationRepo.create({
        name: `Context Org ${Date.now()}`,
        apiKey: `context-api-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 100,
        maxUsers: 500,
        isActive: true,
      }),
    );

    const adminEmail = `context-admin-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email: adminEmail,
        password: 'AdminPass123!',
        firstName: 'Context',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        organizationId: organization.id,
        isActive: true,
      }),
    );

    const loginResp = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: adminEmail,
        password: 'AdminPass123!',
      })
      .expect(200);

    const token = loginResp.body.access_token;
    expect(token).toBeDefined();

    const simpleResp = await request(app.getHttpServer())
      .post('/tours/contextual/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Simple accepted',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 85,
            score: 88,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-simple-ok' },
            steps: [
              {
                title: 'Read title',
                content: 'Observe title',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'Click CTA',
                content: 'Click CTA button',
                targetSelector: '[data-tour-id="tour-simple-cta"] button',
                isPrimary: true,
              },
            ],
          },
          {
            name: 'Simple rejected',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'primary-action',
            confidence: 30,
            score: 40,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-simple-bad' },
            steps: [
              {
                title: 'Weak 1',
                content: 'Weak 1',
                targetSelector: 'h1:nth-of-type(1)',
              },
              {
                title: 'Weak 2',
                content: 'Weak 2',
                targetSelector: '',
              },
            ],
          },
        ],
      })
      .expect(201);

    expect(simpleResp.body.success).toBe(true);
    expect(simpleResp.body.report.created).toBe(1);
    expect(simpleResp.body.report.rejected).toBe(1);

    const dedupeResp = await request(app.getHttpServer())
      .post('/tours/contextual/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Simple duplicate',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 90,
            score: 90,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-simple-ok' },
            steps: [
              {
                title: 'S1',
                content: 'S1',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'S2',
                content: 'S2',
                targetSelector: '[data-tour-id="tour-simple-cta"] button',
              },
            ],
          },
        ],
      })
      .expect(201);

    expect(dedupeResp.body.report.skipped).toBe(1);
    expect(dedupeResp.body.report.created).toBe(0);

    const listResp = await request(app.getHttpServer())
      .get('/tours')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResp.body.success).toBe(true);
    expect(listResp.body.count).toBe(1);
    expect(listResp.body.tours[0].isActive).toBe(true);
    expect(listResp.body.tours[0].triggerConditions.contextualEngine.status).toBe('active');
  });
});
