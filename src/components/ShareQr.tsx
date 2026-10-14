"use client";

export function ShareQr({ dataUrl, url }: { dataUrl?: string; url: string }) {
  if (dataUrl) {
    return (
      <img
        className="result-qr"
        src={dataUrl}
        alt={`QR code to open ${url}`}
      />
    );
  }
  return (
    <div className="result-qr result-qr-wait" role="status">
      QR not ready
    </div>
  );
}

export function clientShareOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
