/**
 * White-label branding for support emails (client / project chameleon).
 * Never hardcode platform product names (Guidora) in outbound support mail.
 */

export type SupportEmailBrandInput = {
  productName?: string | null;
  supportLabel?: string | null;
  fromDisplayName?: string | null;
  accentColor?: string | null;
  accentColorTo?: string | null;
  logoUrl?: string | null;
  monogram?: string | null;
};

export type SupportEmailBrand = {
  productName: string;
  supportLabel: string;
  fromDisplayName: string;
  accentFrom: string;
  accentTo: string;
  logoUrl: string | null;
  monogram: string;
};

const DEFAULT_ACCENT_FROM = '#0F766E';
const DEFAULT_ACCENT_TO = '#115E59';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, a, b, c] = trimmed;
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return fallback;
}

function isPublicHttpLogoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildMonogram(productName: string, explicit?: string | null): string {
  if (explicit?.trim()) {
    return explicit.trim().slice(0, 2).toUpperCase();
  }
  const parts = productName
    .split(/[\s_-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return productName.slice(0, 2).toUpperCase() || 'SU';
}

function mergeBrandLayer(
  base: Partial<SupportEmailBrandInput>,
  layer: SupportEmailBrandInput | null | undefined,
): Partial<SupportEmailBrandInput> {
  if (!layer) return base;
  return {
    productName: layer.productName?.trim() || base.productName,
    supportLabel: layer.supportLabel?.trim() || base.supportLabel,
    fromDisplayName: layer.fromDisplayName?.trim() || base.fromDisplayName,
    accentColor: layer.accentColor?.trim() || base.accentColor,
    accentColorTo: layer.accentColorTo?.trim() || base.accentColorTo,
    logoUrl: layer.logoUrl?.trim() || base.logoUrl,
    monogram: layer.monogram?.trim() || base.monogram,
  };
}

function parseBrandInput(raw: unknown): SupportEmailBrandInput | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    productName: pickString(record.productName),
    supportLabel: pickString(record.supportLabel),
    fromDisplayName: pickString(record.fromDisplayName),
    accentColor: pickString(record.accentColor),
    accentColorTo: pickString(record.accentColorTo),
    logoUrl: pickString(record.logoUrl),
    monogram: pickString(record.monogram),
  };
}

/**
 * Resolution order (highest wins):
 * 1. Ticket sessionData.supportBrand (SDK host chameleon)
 * 2. organization.settings.projectBranding[projectKey]
 * 3. organization.settings.branding
 * 4. organization.name → neutral Support defaults (no platform brand)
 */
export function resolveSupportEmailBrand(input: {
  organizationName?: string | null;
  organizationSettings?: Record<string, unknown> | null;
  projectKey?: string | null;
  sessionBrand?: unknown;
}): SupportEmailBrand {
  const orgName = input.organizationName?.trim() || null;
  const settings = asRecord(input.organizationSettings) ?? {};
  const orgBranding = parseBrandInput(settings.branding);
  const projectMap = asRecord(settings.projectBranding);
  const projectKey = input.projectKey?.trim() || null;
  const projectBranding =
    projectKey && projectMap ? parseBrandInput(projectMap[projectKey]) : null;
  const sessionBranding = parseBrandInput(input.sessionBrand);

  let merged: Partial<SupportEmailBrandInput> = {
    productName: orgName || 'Support',
    accentColor: DEFAULT_ACCENT_FROM,
    accentColorTo: DEFAULT_ACCENT_TO,
  };
  merged = mergeBrandLayer(merged, orgBranding);
  merged = mergeBrandLayer(merged, projectBranding);
  merged = mergeBrandLayer(merged, sessionBranding);

  const productName = merged.productName?.trim() || orgName || 'Support';
  const supportLabel = merged.supportLabel?.trim() || `Support ${productName}`;
  const fromDisplayName = merged.fromDisplayName?.trim() || supportLabel;
  const accentFrom = normalizeHexColor(merged.accentColor, DEFAULT_ACCENT_FROM);
  const accentTo = normalizeHexColor(merged.accentColorTo, accentFrom);

  return {
    productName,
    supportLabel,
    fromDisplayName,
    accentFrom,
    accentTo,
    logoUrl: isPublicHttpLogoUrl(merged.logoUrl) ? merged.logoUrl!.trim() : null,
    monogram: buildMonogram(productName, merged.monogram),
  };
}

/** Persist only known branding keys into session_data. */
export function sanitizeSupportBrandForSession(
  raw: unknown,
): SupportEmailBrandInput | undefined {
  const parsed = parseBrandInput(raw);
  if (!parsed) return undefined;
  const cleaned: SupportEmailBrandInput = {};
  if (parsed.productName) cleaned.productName = parsed.productName;
  if (parsed.supportLabel) cleaned.supportLabel = parsed.supportLabel;
  if (parsed.fromDisplayName) cleaned.fromDisplayName = parsed.fromDisplayName;
  if (parsed.accentColor) cleaned.accentColor = parsed.accentColor;
  if (parsed.accentColorTo) cleaned.accentColorTo = parsed.accentColorTo;
  if (parsed.logoUrl) cleaned.logoUrl = parsed.logoUrl;
  if (parsed.monogram) cleaned.monogram = parsed.monogram;
  return Object.keys(cleaned).length ? cleaned : undefined;
}
