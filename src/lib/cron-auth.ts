import { NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  // Optional manual trigger (server-only secret; never used in browser code).
  const manual = request.headers.get("x-cron-secret");
  return manual === secret;
}
