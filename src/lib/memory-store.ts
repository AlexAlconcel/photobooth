import { SHARE_TTL_MS, isExpired, type StripMeta } from "./share-id";

type StoredStrip = {
  bytes: Buffer;
  meta: StripMeta;
};

type GlobalStrips = typeof globalThis & {
  __kixclicksStrips?: Map<string, StoredStrip>;
};

function store() {
  const globalStore = globalThis as GlobalStrips;
  if (!globalStore.__kixclicksStrips) {
    globalStore.__kixclicksStrips = new Map();
  }
  return globalStore.__kixclicksStrips;
}

export function saveMemoryStrip(id: string, bytes: Buffer, meta: StripMeta) {
  store().set(id, { bytes, meta });
}

export function readMemoryStrip(id: string) {
  const entry = store().get(id);
  if (!entry) return { status: "unavailable" as const };
  if (isExpired(entry.meta.expiresAt)) {
    store().delete(id);
    return { status: "expired" as const };
  }
  return { status: "ok" as const, bytes: entry.bytes, meta: entry.meta };
}

export function pruneMemoryStrips(now = Date.now()) {
  for (const [id, entry] of store()) {
    if (now - Date.parse(entry.meta.createdAt) > SHARE_TTL_MS || isExpired(entry.meta.expiresAt, now)) {
      store().delete(id);
    }
  }
}
