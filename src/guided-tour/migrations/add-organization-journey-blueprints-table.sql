-- Custom journey blueprints per organization (dashboard-managed, SDK-fetched at runtime).
CREATE TABLE IF NOT EXISTS organization_journey_blueprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    blueprint_id VARCHAR(128) NOT NULL,
    vertical VARCHAR(32) NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    payload JSONB NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_org_journey_blueprint_id UNIQUE (organization_id, blueprint_id)
);

CREATE INDEX IF NOT EXISTS idx_org_journey_blueprints_org_published
    ON organization_journey_blueprints (organization_id, is_published);
