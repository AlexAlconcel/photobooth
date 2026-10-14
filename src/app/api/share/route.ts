import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_SHARE_TYPES,
  MAX_SHARE_BYTES,
  SHARE_TTL_MS,
  blobPathForMeta,
  blobPathForStrip,
  type StripMeta,
} from "@/lib/share-id";
import { publicSiteOrigin } from "@/lib/site-origin";

export const runtime = "nodejs";

function errorResponse(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return errorResponse(
      503,
      "Photo sharing is not configured. Add BLOB_READ_WRITE_TOKEN from a Vercel Blob store, then redeploy.",
      { code: "storage_unconfigured" },
    );
  }

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

  const id = crypto.randomUUID();
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

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await put(blobPathForStrip(id), buffer, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: Math.round(SHARE_TTL_MS / 1000),
    });
    await put(blobPathForMeta(id), JSON.stringify(meta), {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: Math.round(SHARE_TTL_MS / 1000),
    });
  } catch {
    return errorResponse(500, "The photo strip could not be uploaded. Try again in a moment.");
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
