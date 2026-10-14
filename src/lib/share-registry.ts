import { put } from "@vercel/blob";
import { blobSdkOptions } from "./blob-auth";
import {
  SHARE_REGISTRY_PREFIX,
  SHARE_TTL_MS,
  blobPathForRegistry,
  isShareId,
  type ShareRegistryRecord,
} from "./share-id";

export async function writeShareRegistry(record: ShareRegistryRecord) {
  const cacheControlMaxAge = Math.round(SHARE_TTL_MS / 1000);
  await put(record.registryPathname, JSON.stringify(record), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge,
    ...blobSdkOptions(),
  });
}

export async function readShareRegistryFromUrl(url: string): Promise<ShareRegistryRecord | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  try {
    const data = (await response.json()) as ShareRegistryRecord;
    if (!data?.id || !isShareId(data.id) || !data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function registryRecordFromUpload(input: {
  id: string;
  blobUrl: string;
  createdAt: string;
  expiresAt: string;
  imagePathname: string;
  metaPathname: string;
}): ShareRegistryRecord {
  return {
    id: input.id,
    blobUrl: input.blobUrl,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    imagePathname: input.imagePathname,
    metaPathname: input.metaPathname,
    registryPathname: blobPathForRegistry(input.id),
    cleanupAttempts: 0,
  };
}

export async function markRegistryCleanupFailure(record: ShareRegistryRecord, message: string) {
  const next: ShareRegistryRecord = {
    ...record,
    cleanupAttempts: (record.cleanupAttempts ?? 0) + 1,
    lastCleanupErrorAt: new Date().toISOString(),
  };
  try {
    await writeShareRegistry(next);
  } catch {
    // Keep blob files for a later cron retry even if the registry write fails.
    console.error(`registry cleanup failure not persisted for ${record.id}: ${message}`);
  }
  return next;
}

export { SHARE_REGISTRY_PREFIX };
