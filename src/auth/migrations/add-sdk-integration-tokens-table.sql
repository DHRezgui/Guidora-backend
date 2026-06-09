-- SDK integration tokens (PAT) for client apps — secrets stored as SHA-256 hash only.
CREATE TABLE IF NOT EXISTS sdk_integration_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_suffix VARCHAR(12) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]',
    revoked_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdk_tokens_org_active
    ON sdk_integration_tokens (organization_id, revoked_at);
