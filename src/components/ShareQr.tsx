"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ShareQr({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      setSrc("");
      setError("");
    });
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 320,
      color: { dark: "#500d20", light: "#ffffff" },
    })
      .then((data) => {
        if (!cancelled) setSrc(data);
      })
      .catch(() => {
        if (!cancelled) setError("The QR code could not be drawn.");
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [url]);

  if (error) return <p className="soft-note" role="alert">{error}</p>;
  if (!src) return <div className="result-qr result-qr-wait" aria-live="polite">Preparing QR…</div>;
  return <img className="result-qr" src={src} alt="QR code to save the photo strip" />;
}

export function clientShareOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
