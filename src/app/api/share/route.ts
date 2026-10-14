import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { pruneMemoryStrips, saveMemoryStrip } from "@/lib/memory-store";
import {
  ALLOWED_SHARE_TYPES,
  MAX_SHARE_BYTES,
  SHARE_TTL_MS,
  blobPathForMeta,
  blobPathForStrip,
  isShareId,
  type StripMeta,
} from "@/lib/share-id";
import { publicSiteOrigin } from "@/lib/site-origin";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const origin = publicSiteOrigin(request);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "The upload could not be read.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse(400, "Attach a photo strip file.");
  }
  if (!ALLOWED_SHARE_TYPES.includes(file.type as (typeof ALLOWED_SHARE_TYPES)[number])) {
    return errorResponse(400, "Only PNG and JPEG photo strips can be shared.");
  }
  if (file.size <= 0 || file.size > MAX_SHARE_BYTES) {
    return errorResponse(400, "That image is too large to share. Try saving a JPEG, or keep the strip under 4.5 MB.");
  }

  const requestedId = form.get("id");
  const id =
    typeof requestedId === "string" && isShareId(requestedId) ? requestedId : crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SHARE_TTL_MS);
  const contentType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const extension = contentType === "image/jpeg" ? "jpg" : "png";
  const fileName = `kixclicks-photo-strip.${extension}`;
  const meta: StripMeta = {
    id,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    contentType,
    fileName,
  };

  const buffer = Buffer.from(await file.arrayBuffer());
  pruneMemoryStrips();
  saveMemoryStrip(id, buffer, meta);

  if (token) {
    try {
      const blobWrite = Promise.all([
        put(blobPathForStrip(id), buffer, {
          access: "public",
          token,
          addRandomSuffix: false,
          contentType,
          cacheControlMaxAge: Math.round(SHARE_TTL_MS / 1000),
        }),
        put(blobPathForMeta(id), JSON.stringify(meta), {
          access: "public",
          token,
          addRandomSuffix: false,
          contentType: "application/json",
          cacheControlMaxAge: Math.round(SHARE_TTL_MS / 1000),
        }),
      ]);
      blobWrite.catch(() => undefined);
      await Promise.race([
        blobWrite,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("blob-timeout")), 12000);
        }),
      ]);
    } catch {
      // Keep the in-memory copy so a QR can still be shown.
    }
  }

  const sharePath = `/s/${id}`;
  const shareUrl = origin ? `${origin}${sharePath}` : "";

  return NextResponse.json({
    ok: true,
    id,
    sharePath,
    shareUrl,
    expiresAt: meta.expiresAt,
    retentionHours: Math.round(SHARE_TTL_MS / (60 * 60 * 1000)),
    qrReady: Boolean(shareUrl),
  });
}
