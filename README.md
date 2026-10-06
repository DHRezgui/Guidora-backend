# Guidora Backend

The Guidora backend is a NestJS API for the multi-tenant onboarding platform.
It provides authentication, organization and project management, guided-tour
authoring and delivery, contextual help, FAQ search, event tracking, analytics,
and abandonment-risk prediction.

Repository: [DHRezgui/Guidora-backend](https://github.com/DHRezgui/Guidora-backend)

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 15 or newer
- Redis 7 or newer
- RabbitMQ 3 when asynchronous tracking is enabled

For the complete local stack, use the parent repository and Docker Compose.

## Install

```bash
npm install
```

Create a local environment file from `.env.test.example` when running tests:

```bash
cp .env.test.example .env.test
```

Do not commit `.env`, `.env.test`, or any file containing real credentials.

## Run locally

The API expects PostgreSQL and the optional Redis/RabbitMQ services to be
available. Start it in watch mode with:

```bash
npm run start:dev
```

Other useful commands:

```bash
npm run build
npm run start:prod
npm run start:worker
```

When started directly, the API uses the configured `PORT` and exposes the
versioned API under `/api/v1`. The Docker Compose development stack maps the
API to `http://localhost:3020`; the root production-style stack maps it to
`http://localhost:3002`.

Interactive API documentation is available at `/api/v1/docs` when Swagger is
enabled, for example `http://localhost:3002/api/v1/docs`.

## Main capabilities

- Multi-tenant organizations, users, projects, and roles.
- Guided-tour creation, publishing, access control, and sandbox workflows.
- SDK authentication and event tracking, including batch tracking.
- Contextual feedback, journey blueprints, and analytics aggregation.
- FAQ search with lexical and semantic retrieval.
- Optional LightGBM abandonment prediction and model health checks.
- Background tracking through RabbitMQ and Redis-backed coordination.

## Tests and quality checks

```bash
npm test
npm run test:cov
npm run test:e2e
npm run test:e2e:sdk
npm run lint
```

`npm run lint` uses ESLint with autofix. Review the resulting changes before
committing them.

## API and integration notes

The React SDK consumes the backend through the public API and ML routes. The
exact request and response contracts are documented in the source controllers,
Swagger output, and the ML integration notes under `src/ml/`.

For a working backend, dashboard, database, and SDK setup, see the parent
[Guidora workspace README](https://github.com/DHRezgui/Guidora).

## Security

Use strong secrets and non-default service credentials outside local
development. Restrict administrative and ML prediction routes according to
the configured roles and SDK token scopes.
