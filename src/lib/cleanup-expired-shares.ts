import { del, list } from "@vercel/blob";
import { blobSdkOptions } from "./blob-auth";
import { blobStripPathCandidates, isExpired, type ShareRegistryRecord } from "./share-id";
import {
  SHARE_REGISTRY_PREFIX,
  markRegistryCleanupFailure,
  readShareRegistryFromUrl,
} from "./share-registry";

export type CleanupResult = {
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  stillActive: number;
};

const MAX_CLEANUP_ATTEMPTS = 8;

export async function cleanupExpiredShares(options?: { now?: number; batchSize?: number }) {
  const now = options?.now ?? Date.now();
  const batchSize = options?.batchSize ?? 40;
  const result: CleanupResult = {
    scanned: 0,
    expired: 0,
    deleted: 0,
    failed: 0,
    stillActive: 0,
  };

  let cursor: string | undefined;
  let pages = 0;

  while (result.scanned < batchSize && pages < 20) {
    pages += 1;
    const page = await list({
      prefix: SHARE_REGISTRY_PREFIX,
      limit: Math.min(100, batchSize - result.scanned + 10),
      cursor,
      ...blobSdkOptions(),
    });

    for (const blob of page.blobs) {
      if (result.scanned >= batchSize) break;
      result.scanned += 1;

      const record = await readShareRegistryFromUrl(blob.url);
      if (!record) {
        result.failed += 1;
        continue;
      }

      if (!isExpired(record.expiresAt, now)) {
        result.stillActive += 1;
        continue;
      }

      result.expired += 1;

      if ((record.cleanupAttempts ?? 0) >= MAX_CLEANUP_ATTEMPTS) {
        result.failed += 1;
        continue;
      }

      try {
        await deleteShareAssets(record);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : "delete failed";
        await markRegistryCleanupFailure(record, message);
      }
    }

    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  return result;
}

async function deleteShareAssets(record: ShareRegistryRecord) {
  const paths = [
    ...new Set([
      ...blobStripPathCandidates(record.id),
      record.imagePathname,
      record.metaPathname,
      record.registryPathname,
    ]),
  ];
  await del(paths, blobSdkOptions());
}
