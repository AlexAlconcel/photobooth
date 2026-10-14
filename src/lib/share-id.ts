const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SHARE_BYTES = 4_500_000;
export const ALLOWED_SHARE_TYPES = ["image/png", "image/jpeg"] as const;

export function isShareId(value: string) {
  return SHARE_ID_PATTERN.test(value);
}

export function blobPathForStrip(id: string) {
  return `kixclicks/${id}.png`;
}

export function blobPathForMeta(id: string) {
  return `kixclicks/${id}.json`;
}

export type StripMeta = {
  id: string;
  createdAt: string;
  expiresAt: string;
  contentType: string;
  fileName: string;
};

export function isExpired(expiresAt: string, now = Date.now()) {
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return true;
  return now >= expires;
}
