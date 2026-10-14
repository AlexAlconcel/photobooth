import { NextRequest } from "next/server";

export function publicSiteOrigin(request?: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }

  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
      return `${proto}://${host}`;
    }
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "";
}
