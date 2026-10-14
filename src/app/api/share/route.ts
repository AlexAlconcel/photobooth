import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  blobSdkOptions,
  blobStorageSetupMessage,
  hasBlobStorageConfigured,
  requiresBlobForShare,
} from "@/lib/blob-auth";
import { formatBlobUploadError } from "@/lib/blob-errors";
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
import { qrDataUrlForShareLink } from "@/lib/share-qr-image";
import { registryRecordFromUpload, writeShareRegistry } from "@/lib/share-registry";
import { publicSiteOrigin } from "@/lib/site-origin";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const origin = publicSiteOrigin(request);
  const blobOptions = blobSdkOptions();

  if (requiresBlobForShare() && !hasBlobStorageConfigured()) {
    return errorResponse(503, blobStorageSetupMessage());
  }

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

  const buffer = Buffer.from(await file.arrayBuffer());
  pruneMemoryStrips();

  let stored = false;
  let blobUrl = "";

  if (hasBlobStorageConfigured()) {
    try {
      const cacheControlMaxAge = Math.round(SHARE_TTL_MS / 1000);
      const stripPut = await put(blobPathForStrip(id, contentType), buffer, {
        access: "public",
        addRandomSuffix: false,
        contentType,
        cacheControlMaxAge,
        ...blobOptions,
      });
      if (!stripPut.url) {
        return errorResponse(500, "Upload finished but the storage URL was missing. Try again.");
      }
      blobUrl = stripPut.url;
      const imagePathname = blobPathForStrip(id, contentType);
      const metaPathname = blobPathForMeta(id);

      const meta: StripMeta = {
        id,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        contentType,
        fileName,
        blobUrl,
      };

      await put(metaPathname, JSON.stringify(meta), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge,
        ...blobOptions,
      });

      await writeShareRegistry(
        registryRecordFromUpload({
          id,
          blobUrl,
          createdAt: meta.createdAt,
          expiresAt: meta.expiresAt,
          imagePathname,
          metaPathname,
        }),
      );

      saveMemoryStrip(id, buffer, meta);
      stored = true;
    } catch (error) {
      return errorResponse(500, formatBlobUploadError(error));
    }
  } else {
    const meta: StripMeta = {
      id,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      contentType,
      fileName,
    };
    saveMemoryStrip(id, buffer, meta);
    stored = !requiresBlobForShare();
  }

  if (!stored) {
    return errorResponse(503, blobStorageSetupMessage());
  }

  const sharePath = `/s/${id}`;
  const shareUrl = origin ? `${origin}${sharePath}` : "";

  if (!shareUrl) {
    return errorResponse(
      503,
      "Set NEXT_PUBLIC_SITE_URL to your public site (for example https://kixclicks.vercel.app) so QR codes open on guest phones.",
    );
  }

  let qrDataUrl = "";
  try {
    qrDataUrl = await qrDataUrlForShareLink(shareUrl);
  } catch {
    return errorResponse(500, "The share link was saved but the QR code could not be created. Try again.");
  }

  return NextResponse.json({
    ok: true,
    stored: true,
    id,
    sharePath,
    shareUrl,
    qrDataUrl,
    blobUrl: blobUrl || undefined,
    expiresAt: expiresAt.toISOString(),
    retentionHours: Math.round(SHARE_TTL_MS / (60 * 60 * 1000)),
    qrReady: true,
  });
}
