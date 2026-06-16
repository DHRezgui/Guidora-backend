import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Organization, PlanType } from '../src/organization/entities/organization.entity';
import { User, UserRole } from '../src/user/entities/user.entity';

describe('SDK integration tokens (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
      await dataSource.query('DELETE FROM sdk_session_tokens').catch(() => undefined);
      await dataSource.query('DELETE FROM sdk_integration_token_audit').catch(() => undefined);
      await dataSource.query('DELETE FROM sdk_integration_tokens').catch(() => undefined);
      await dataSource.query('DELETE FROM users').catch(() => undefined);
      await dataSource.query('DELETE FROM organizations').catch(() => undefined);
    }
    if (app) await app.close();
  });

  it('developer PAT without tours:publish cannot call contextual publish', async () => {
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
        name: `Sdk Pat Org ${Date.now()}`,
        apiKey: `pat-org-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `dev-pat-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'DevPass123!',
        firstName: 'Pat',
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

    const sessionJwt = login.body.access_token as string;

    const created = await request(app.getHttpServer())
      .post('/auth/sdk-tokens')
      .set('Authorization', `Bearer ${sessionJwt}`)
      .send({ name: 'e2e-pat-test' })
      .expect(201);

    const pat = created.body.token as string;
    expect(pat).toMatch(/^td_sdk_/);

    await request(app.getHttpServer())
      .get('/tours/contextual/blueprints')
      .set('Authorization', `Bearer ${pat}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/tours/contextual/publish')
      .set('Authorization', `Bearer ${pat}`)
      .send({ drafts: [], scenario: 'simple', targetUrl: '/test' })
      .expect(403);
  });

  it('developer PAT with tours:publish can call contextual publish', async () => {
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
        name: `Sdk Pat Publish Org ${Date.now()}`,
        apiKey: `pat-publish-org-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `dev-publish-pat-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'DevPass123!',
        firstName: 'Pat',
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

    const sessionJwt = login.body.access_token as string;

    const created = await request(app.getHttpServer())
      .post('/auth/sdk-tokens')
      .set('Authorization', `Bearer ${sessionJwt}`)
      .send({
        name: 'e2e-pat-publish',
        scopes: ['tours:runtime', 'tours:sandbox', 'tours:publish', 'semantic:invoke'],
      })
      .expect(201);

    const pat = created.body.token as string;
    expect(pat).toMatch(/^td_sdk_/);

    await request(app.getHttpServer())
      .post('/tours/contextual/publish')
      .set('Authorization', `Bearer ${pat}`)
      .send({ scenario: 'simple', drafts: [] })
      .expect((res) => {
        expect(res.status).not.toBe(403);
      });
  });

  it('exchanges PAT for browser session without tours:publish', async () => {
    const dbName = process.env.DB_NAME || '';
    if (!dbName.toLowerCase().includes('test')) {
      throw new Error(`Unsafe DB for e2e: DB_NAME="${dbName}"`);
    }

    await dataSource.query('DELETE FROM sdk_session_tokens').catch(() => undefined);
    await dataSource.query('DELETE FROM sdk_integration_token_audit').catch(() => undefined);
    await dataSource.query('DELETE FROM sdk_integration_tokens');
    await dataSource.query('DELETE FROM users');
    await dataSource.query('DELETE FROM organizations');

    const orgRepo = dataSource.getRepository(Organization);
    const userRepo = dataSource.getRepository(User);

    const organization = await orgRepo.save(
      orgRepo.create({
        name: `Sdk Session Org ${Date.now()}`,
        apiKey: `pat-session-org-${Date.now()}`,
        plan: PlanType.PRO,
        maxTours: 50,
        maxUsers: 50,
        isActive: true,
      }),
    );

    const email = `dev-session-pat-${Date.now()}@test.com`;
    await userRepo.save(
      userRepo.create({
        email,
        password: 'DevPass123!',
        firstName: 'Pat',
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

    const sessionJwt = login.body.access_token as string;

    const created = await request(app.getHttpServer())
      .post('/auth/sdk-tokens')
      .set('Authorization', `Bearer ${sessionJwt}`)
      .send({
        name: 'e2e-pat-session',
        scopes: ['tours:runtime', 'tours:publish', 'feedback:write'],
        expiresInDays: 30,
      })
      .expect(201);

    const pat = created.body.token as string;
    expect(created.body.tokenRecord.expiresAt).toBeTruthy();

    const exchanged = await request(app.getHttpServer())
      .post('/auth/sdk-tokens/exchange')
      .set('Authorization', `Bearer ${pat}`)
      .expect(200);

    const sessionToken = exchanged.body.sessionToken as string;
    expect(sessionToken).toMatch(/^td_sess_/);
    expect(exchanged.body.scopes).toContain('tours:runtime');
    expect(exchanged.body.scopes).not.toContain('tours:publish');

    await request(app.getHttpServer())
      .get('/tours/contextual/blueprints')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/tours/contextual/publish')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ scenario: 'simple', drafts: [] })
      .expect(403);
  });
});
