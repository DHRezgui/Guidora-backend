import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Organization, PlanType } from '../src/organization/entities/organization.entity';
import { User, UserRole } from '../src/user/entities/user.entity';
import { FaqService } from '../src/faq/faq.service';

describe('FAQ semantic search SDK scopes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    jest.spyOn(app.get(FaqService), 'semanticSearch').mockResolvedValue({
      success: true,
      query: 'mot de passe',
      total: 1,
      strategyStep: 'threshold_0.7',
      results: [
        {
          id: 'faq-003',
          question: 'Comment reinitialiser mon mot de passe ?',
          answer: "Depuis l'ecran de connexion, cliquez sur Mot de passe oublie.",
          category: 'auth',
          priority: 'high',
          score: 0.96,
        },
      ],
    });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DELETE FROM sdk_integration_tokens').catch(() => undefined);
      await dataSource.query('DELETE FROM users').catch(() => undefined);
      await dataSource.query('DELETE FROM organizations').catch(() => undefined);
    }
    if (app) await app.close();
  });

  async function createDeveloperPat(scopes: string[]): Promise<string> {
    const dbName = process.env.DB_NAME || '';
    if (!dbName.toLowerCase().includes('test')) {
      throw new Error(`Unsafe DB for e2e: DB_NAME="${dbName}"`);
    }

    await dataSource.query('DELETE FROM sdk_integration_tokens');
    await dataSource.query('DELETE FROM users');
    await dataSource.query('DELETE FROM organizations');

    const orgRepo = dataSource.getRepository(Organization);
    const userRepo = dataSource.getRepository(User);

    const organization = await orgRepo.save(
      orgRepo.create({
        name: `Faq Sdk Org ${Date.now()}`,
        apiKey: `faq-org-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `faq-dev-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'DevPass123!',
        firstName: 'Faq',
        lastName: 'Dev',
        role: UserRole.DEVELOPER,
        organizationId: organization.id,
        isActive: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'DevPass123!' })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/auth/sdk-tokens')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({
        name: `faq-pat-${Date.now()}`,
        scopes,
      })
      .expect(201);

    return created.body.token as string;
  }

  it('rejects PAT without faq:search scope', async () => {
    const pat = await createDeveloperPat(['tours:runtime']);

    await request(app.getHttpServer())
      .post('/faq/semantic-search')
      .set('Authorization', `Bearer ${pat}`)
      .send({ question: 'mot de passe' })
      .expect(403);
  });

  it('allows PAT with faq:search scope', async () => {
    const pat = await createDeveloperPat(['faq:search']);

    const response = await request(app.getHttpServer())
      .post('/faq/semantic-search')
      .set('Authorization', `Bearer ${pat}`)
      .send({ question: 'mot de passe', topK: 3 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results[0].id).toBe('faq-003');
  });

  it('allows dashboard JWT for semantic search', async () => {
    const dbName = process.env.DB_NAME || '';
    if (!dbName.toLowerCase().includes('test')) {
      throw new Error(`Unsafe DB for e2e: DB_NAME="${dbName}"`);
    }

    await dataSource.query('DELETE FROM users');
    await dataSource.query('DELETE FROM organizations');

    const orgRepo = dataSource.getRepository(Organization);
    const userRepo = dataSource.getRepository(User);

    const organization = await orgRepo.save(
      orgRepo.create({
        name: `Faq Jwt Org ${Date.now()}`,
        apiKey: `faq-jwt-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `faq-user-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'UserPass123!',
        firstName: 'Faq',
        lastName: 'User',
        role: UserRole.USER,
        organizationId: organization.id,
        isActive: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'UserPass123!' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/faq/semantic-search')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ question: 'mot de passe' })
      .expect(200);

    expect(response.body.total).toBeGreaterThan(0);
  });
});
