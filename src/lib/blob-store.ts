import { del, list, type ListBlobResultBlob } from "@vercel/blob";
import { blobSdkOptions } from "./blob-auth";
import {
  blobPathForMeta,
  blobPathForRegistry,
  blobStripPathCandidates,
  isExpired,
  type StripMeta,
} from "./share-id";

export async function findStoredStrip(id: string) {
  const { blobs } = await list({ prefix: `kixclicks/${id}`, ...blobSdkOptions(), limit: 20 });
  const metaBlob = blobs.find((item) => item.pathname === blobPathForMeta(id));
  const candidates = new Set(blobStripPathCandidates(id));
  const image = blobs.find((item) => candidates.has(item.pathname));
  return { image, metaBlob };
}

export async function readStoredMeta(metaBlob: ListBlobResultBlob): Promise<StripMeta> {
  const response = await fetch(metaBlob.url, { cache: "no-store" });
  if (!response.ok) throw new Error("missing-meta");
  return (await response.json()) as StripMeta;
}

export async function deleteStoredStrip(id: string) {
  await del(
    [...blobStripPathCandidates(id), blobPathForMeta(id), blobPathForRegistry(id)],
    blobSdkOptions(),
  ).catch(() => undefined);
}

export async function loadLiveStrip(id: string) {
  const { image, metaBlob } = await findStoredStrip(id);
  if (!image || !metaBlob) return { status: "unavailable" as const };
  const meta = await readStoredMeta(metaBlob);
  if (isExpired(meta.expiresAt)) {
    await deleteStoredStrip(id);
    return { status: "expired" as const };
  }
  return { status: "ok" as const, image, meta };
}
