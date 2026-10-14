import { NextRequest, NextResponse } from "next/server";
import { hasBlobStorageConfigured } from "@/lib/blob-auth";
import { cleanupExpiredShares } from "@/lib/cleanup-expired-shares";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Set CRON_SECRET and invoke with Authorization: Bearer <secret>." },
      { status: 401 },
    );
  }

  if (!hasBlobStorageConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Blob storage is not configured; nothing to clean up." },
      { status: 503 },
    );
  }

  try {
    const result = await cleanupExpiredShares({ batchSize: 50 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cleanup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
