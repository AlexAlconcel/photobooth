import { NextRequest, NextResponse } from "next/server";
import { loadLiveStrip } from "@/lib/blob-store";
import { isShareId } from "@/lib/share-id";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isShareId(id)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });
  }

  try {
    const result = await loadLiveStrip(id, token);
    if (result.status !== "ok") {
      return NextResponse.json({ error: result.status }, { status: result.status === "expired" ? 410 : 404 });
    }
    const image = await fetch(result.image.url, { cache: "no-store" });
    if (!image.ok || !image.body) {
      return NextResponse.json({ error: "unavailable" }, { status: 404 });
    }
    return new NextResponse(image.body, {
      headers: {
        "Content-Type": result.meta.contentType,
        "Content-Disposition": `inline; filename="${result.meta.fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
}
