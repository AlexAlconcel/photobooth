import type { Metadata } from "next";
import Link from "next/link";
import { loadLiveStrip } from "@/lib/blob-store";
import { readMemoryStrip } from "@/lib/memory-store";
import { isShareId } from "@/lib/share-id";
import { ShareDownload } from "./share-download";
import { SharePending } from "./share-pending";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

async function loadStrip(id: string) {
  if (!isShareId(id)) return { status: "invalid" as const };
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const result = await loadLiveStrip(id, token);
      if (result.status === "ok") {
        return { status: "ok" as const, fileName: result.meta.fileName, expiresAt: result.meta.expiresAt };
      }
      if (result.status !== "unavailable") return { status: result.status };
    } catch {
      // Fall through to memory.
    }
  }
  const memory = readMemoryStrip(id);
  if (memory.status === "ok") {
    return { status: "ok" as const, fileName: memory.meta.fileName, expiresAt: memory.meta.expiresAt };
  }
  if (memory.status === "expired") return { status: "expired" as const };
  return { status: token ? "unavailable" as const : "unconfigured" as const };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: isShareId(id) ? "Your KixClicks strip" : "Link not found | KixClicks" };
}

export default async function SharePage({ params }: PageProps) {
  const { id } = await params;
  const result = await loadStrip(id);

  return (
    <main className="app-shell share-page">
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="KixClicks home">
          <span className="wordmark-lockup">
            <span className="wordmark-kix">KixClicks</span>
          </span>
          <small>PHOTOBOOTH</small>
        </Link>
      </header>
      <section className="share-card page-enter">
        {result.status === "ok" && (
          <>
            <p className="eyebrow">Your photo strip</p>
            <h1>Save this keepsake.</h1>
            <p className="soft-note">This link expires {result.expiresAt ? new Date(result.expiresAt).toLocaleString() : "in 7 days"}. We do not ask for an account.</p>
            <img className="share-image" src={`/api/share/${id}`} alt="KixClicks photo strip" />
            <ShareDownload href={`/api/share/${id}`} fileName={result.fileName || "kixclicks-photo-strip.png"} />
            <Link className="text-button" href="/">← back to KixClicks</Link>
          </>
        )}
        {result.status === "invalid" && <ShareState title="This link is not valid." body="The address does not match a KixClicks photo strip." />}
        {result.status === "expired" && <ShareState title="This strip has expired." body="Shared photo strips are kept for 7 days, then the link stops working." />}
        {result.status === "unavailable" && <SharePending id={id} />}
        {result.status === "unconfigured" && <SharePending id={id} />}
      </section>
    </main>
  );
}

function ShareState({ title, body }: { title: string; body: string }) {
  return (
    <>
      <p className="eyebrow">KixClicks</p>
      <h1>{title}</h1>
      <p className="soft-note">{body}</p>
      <Link className="primary-button" href="/">Go home</Link>
    </>
  );
}
