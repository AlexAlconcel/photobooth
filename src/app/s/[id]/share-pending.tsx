"use client";

import { useEffect, useState } from "react";

export function SharePending({ id }: { id: string }) {
  const [tries, setTries] = useState(0);
  const maxTries = 15;

  useEffect(() => {
    let cancelled = false;
    let count = 0;
    const tick = async () => {
      count += 1;
      if (cancelled) return;
      setTries(count);
      try {
        const response = await fetch(`/api/share/${id}`, { cache: "no-store" });
        if (response.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // Keep waiting until the upload lands.
      }
      if (count < maxTries && !cancelled) {
        window.setTimeout(tick, 1500);
      }
    };
    const start = window.setTimeout(tick, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [id]);

  return (
    <>
      <p className="eyebrow">Almost there</p>
      <h1>Saving your photo strip.</h1>
      <p className="soft-note">
        {tries >= maxTries
          ? "This link is not ready yet. Ask the booth to tap Try again, then scan the new QR."
          : "The booth is still uploading. This page will refresh when your strip is ready."}
      </p>
    </>
  );
}
