"use client";

export function ShareDownload({ href, fileName }: { href: string; fileName: string }) {
  async function onDownload() {
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("missing");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="share-actions">
      <button type="button" className="primary-button full" onClick={onDownload}>
        Download Photo Strip
      </button>
      <a className="download-link" href={href} target="_blank" rel="noreferrer">
        Open full-resolution image
      </a>
      <p className="microcopy">On iPhone, you can also press and hold the image and choose Save to Photos.</p>
    </div>
  );
}
