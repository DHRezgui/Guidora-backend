-- Audit trail for SDK integration tokens + short-lived browser session tokens (BFF).

CREATE TABLE IF NOT EXISTS sdk_integration_token_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_id UUID REFERENCES sdk_integration_tokens(id) ON DELETE SET NULL,
    session_token_id UUID,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(32) NOT NULL,
    ip VARCHAR(64),
    user_agent VARCHAR(512),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdk_token_audit_org_created
    ON sdk_integration_token_audit (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sdk_token_audit_token
    ON sdk_integration_token_audit (token_id);

CREATE TABLE IF NOT EXISTS sdk_session_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_token_id UUID NOT NULL REFERENCES sdk_integration_tokens(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_suffix VARCHAR(12) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdk_session_tokens_parent
    ON sdk_session_tokens (parent_token_id);

CREATE INDEX IF NOT EXISTS idx_sdk_session_tokens_expires
    ON sdk_session_tokens (expires_at);
