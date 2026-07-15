import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Organization, PlanType } from '../src/organization/entities/organization.entity';
import { User, UserRole } from '../src/user/entities/user.entity';
import { PredictionService } from '../src/ml/prediction.service';

describe('ML abandonment prediction SDK scopes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const sampleFeatures = {
    timeOnPage: 83,
    scrollDepth: 41.4,
    clickMisses: 2,
    hesitations: 1,
    helpTriggered: 0,
    hasError: 0,
    multiplePages: 1,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    jest.spyOn(app.get(PredictionService), 'predict').mockResolvedValue({
      success: true,
      prediction: {
        abandonmentRisk: 0.325,
        willAbandon: false,
        confidence: 0.95,
        threshold: 0.5,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        modelVersion: '1.0',
        executionTimeMs: 12,
      },
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
        name: `Ml Sdk Org ${Date.now()}`,
        apiKey: `ml-org-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `ml-dev-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'DevPass123!',
        firstName: 'Ml',
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
        name: `ml-pat-${Date.now()}`,
        scopes,
      })
      .expect(201);

    return created.body.token as string;
  }

  it('rejects PAT without ml:predict scope', async () => {
    const pat = await createDeveloperPat(['tours:runtime']);

    await request(app.getHttpServer())
      .post('/ml/predictions/abandonment')
      .set('Authorization', `Bearer ${pat}`)
      .send({ features: sampleFeatures })
      .expect(403);
  });

  it('allows PAT with ml:predict scope', async () => {
    const pat = await createDeveloperPat(['ml:predict']);

    const response = await request(app.getHttpServer())
      .post('/ml/predictions/abandonment')
      .set('Authorization', `Bearer ${pat}`)
      .send({ features: sampleFeatures })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.prediction.abandonmentRisk).toBe(0.325);
  });

  it('allows dashboard JWT for abandonment prediction', async () => {
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
        name: `Ml Jwt Org ${Date.now()}`,
        apiKey: `ml-jwt-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `ml-user-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'UserPass123!',
        firstName: 'Ml',
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
      .post('/ml/predictions/abandonment')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send({ features: sampleFeatures })
      .expect(200);

    expect(response.body.prediction?.abandonmentRisk).toBe(0.325);
  });

  it('returns graceful failure when prediction service reports success false', async () => {
    jest.spyOn(app.get(PredictionService), 'predict').mockResolvedValueOnce({
      success: false,
      error: 'Model not loaded. Service may not be fully initialized.',
      timestamp: new Date().toISOString(),
    });

    const pat = await createDeveloperPat(['ml:predict']);

    const response = await request(app.getHttpServer())
      .post('/ml/predictions/abandonment')
      .set('Authorization', `Bearer ${pat}`)
      .send({ features: sampleFeatures })
      .expect(200);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Model not loaded');
  });
});
