import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const result = await loadLiveStrip(id, token);
      if (result.status === "ok") {
        const image = await fetch(result.image.url, { cache: "no-store" });
        if (image.ok && image.body) {
          return imageResponse(image.body, result.meta.contentType, result.meta.fileName);
        }
      } else if (result.status === "expired") {
        return NextResponse.json({ error: "expired" }, { status: 410 });
      }
    } catch {
      // Fall through to the in-memory copy from this server instance.
    }
  }

  const memory = readMemoryStrip(id);
  if (memory.status === "expired") {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (memory.status === "ok") {
    const bytes = new Uint8Array(memory.bytes);
    return imageResponse(bytes, memory.meta.contentType, memory.meta.fileName);
  }

  return NextResponse.json({ error: token ? "unavailable" : "storage_unconfigured" }, { status: token ? 404 : 503 });
}
