import { NextRequest, NextResponse } from "next/server";
import { hasBlobStorageConfigured } from "@/lib/blob-auth";
import { loadLiveStrip } from "@/lib/blob-store";
import { readMemoryStrip } from "@/lib/memory-store";
import { isShareId } from "@/lib/share-id";

export const runtime = "nodejs";

function imageResponse(body: BodyInit, contentType: string, fileName: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isShareId(id)) {
    return NextResponse.json({ error: "invalid", message: "This share link is not valid." }, { status: 400 });
  }

  if (hasBlobStorageConfigured()) {
    try {
      const result = await loadLiveStrip(id);
      if (result.status === "ok") {
        const image = await fetch(result.image.url, { cache: "no-store" });
        if (image.ok && image.body) {
          return imageResponse(image.body, result.meta.contentType, result.meta.fileName);
        }
        return NextResponse.json(
          { error: "unavailable", message: "The photo strip file could not be loaded from storage." },
          { status: 502 },
        );
      }
      if (result.status === "expired") {
        return NextResponse.json({ error: "expired", message: "This share link has expired." }, { status: 410 });
      }
    } catch {
      // Fall through to the in-memory copy from this server instance.
    }
  }

  const memory = readMemoryStrip(id);
  if (memory.status === "expired") {
    return NextResponse.json({ error: "expired", message: "This share link has expired." }, { status: 410 });
  }
  if (memory.status === "ok") {
    const bytes = new Uint8Array(memory.bytes);
    return imageResponse(bytes, memory.meta.contentType, memory.meta.fileName);
  }

  return NextResponse.json(
    {
      error: hasBlobStorageConfigured() ? "unavailable" : "storage_unconfigured",
      message: hasBlobStorageConfigured()
        ? "This photo strip was not found. It may still be uploading, or the booth session failed to save."
        : "Cloud storage is not configured for this deployment.",
    },
    { status: hasBlobStorageConfigured() ? 404 : 503 },
  );
}
