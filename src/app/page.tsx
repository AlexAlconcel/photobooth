"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PrintDialog } from "@/components/PrintDialog";
import { composePhotoStrip, filterCss } from "@/lib/compose-strip";

const POSE_BREAK_MS = 5000;
const FLASH_MS = 280;

type CaptureOverlay = null | "poses" | "complete" | number;

function yieldToPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type Stage = "welcome" | "setup" | "capture" | "edit" | "result";
type Filter = "original" | "mono" | "sepia" | "warm" | "vintage";
type LayoutId = "four" | "three" | "double" | "grid" | "single" | "horizontal";
type ThemeId = "blossom" | "cream" | "wine" | "petal" | "stripe" | "blush" | "ivory" | "heart";
type Sticker = { id: number; mark: string; x: number; y: number };

const DEFAULT_LAYOUT: LayoutId = "four";
const DEFAULT_THEME: ThemeId = "blossom";
const DEFAULT_FILTER: Filter = "original";
const DEFAULT_CAPTION = "good vibes only";
const DEFAULT_COUNTDOWN = 3;

function BrandFlower({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="16" cy="8" rx="4.6" ry="6.8" fill="currentColor" transform={`rotate(${deg} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="3.4" fill="#fff8e7" />
    </svg>
  );
}

const layouts: { id: LayoutId; name: string; count: number; shape: string }[] = [
  { id: "four", name: "Four cut", count: 4, shape: "strip" },
  { id: "three", name: "Three cut", count: 3, shape: "strip short" },
  { id: "grid", name: "Square grid", count: 4, shape: "grid" },
  { id: "single", name: "Single frame", count: 1, shape: "single" },
  { id: "horizontal", name: "Side by side", count: 4, shape: "horizontal" },
];

const themes: { id: ThemeId; name: string; color: string; paper: string; ink: string }[] = [
  { id: "blossom", name: "Blossom", color: "#500d20", paper: "#ffd7e7", ink: "#500d20" },
  { id: "cream", name: "Cream", color: "#500d20", paper: "#fff8e7", ink: "#500d20" },
  { id: "wine", name: "Wine", color: "#ffd7e7", paper: "#500d20", ink: "#fff8e7" },
  { id: "petal", name: "Petal", color: "#e8a0bc", paper: "#fff0f6", ink: "#500d20" },
  { id: "stripe", name: "Stripe", color: "#500d20", paper: "#f7c9dc", ink: "#500d20" },
  { id: "blush", name: "Blush", color: "#ffd7e7", paper: "#fff8e7", ink: "#7a1a38" },
  { id: "ivory", name: "Ivory", color: "#d9a3b8", paper: "#fffdf8", ink: "#500d20" },
  { id: "heart", name: "Heart", color: "#c43d66", paper: "#ffe4ef", ink: "#500d20" },
];

const stickerChoices = ["✿", "♥", "♡", "✦", "✧", "·"];
const sampleFormats = [
  { id: "three", name: "three cut", count: 3 },
  { id: "four", name: "four cut", count: 4 },
  { id: "single", name: "one cut", count: 1 },
  { id: "grid", name: "square grid", count: 4 },
  { id: "horizontal", name: "side by side", count: 4 },
];

function Placeholder({ index, filter }: { index: number; filter: Filter }) {
  return <div className="placeholder-photo" style={{ filter: filterCss[filter] }}><span>{String(index + 1).padStart(2, "0")}</span><i>your photo</i></div>;
}

/** Phones/tablets only — desktop uses direct download / save dialog. */
function isMobileExportTarget() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform)) return true;
  return false;
}

function isIosExportTarget() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform);
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    id?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

function getSaveFilePicker() {
  return (window as SavePickerWindow).showSaveFilePicker;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Opens the system save UI starting in Pictures (when the browser supports it). */
async function trySaveToPicturesFolder(blob: Blob, fileName: string, mimeType: string) {
  const savePicker = getSaveFilePicker();
  if (!savePicker) return "unavailable";

  const extension = fileName.includes(".") ? `.${fileName.split(".").pop()}` : ".png";
  try {
    const handle = await savePicker({
      suggestedName: fileName,
      startIn: "pictures",
      id: "kixclicks-photostrip",
      types: [{ description: "Image", accept: { [mimeType]: [extension] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "unavailable";
  }
}

async function tryShareToGallery(file: File) {
  if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) {
    return "unavailable";
  }
  try {
    await navigator.share({ files: [file], title: "KixClicks Photo" });
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    return "unavailable";
  }
}

/** Laptop/desktop — save dialog (Pictures) or download. */
async function savePhotoStripDesktop(blob: Blob, fileName: string, mimeType: string) {
  const pickerResult = await trySaveToPicturesFolder(blob, fileName, mimeType);
  if (pickerResult === "saved") return "done";
  if (pickerResult === "cancelled") return "cancelled";

  triggerBrowserDownload(blob, fileName);
  return "done";
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [layout, setLayout] = useState<LayoutId>(DEFAULT_LAYOUT);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [photos, setPhotos] = useState<string[]>([]);
  const [caption, setCaption] = useState(DEFAULT_CAPTION);
  const [showDate, setShowDate] = useState(true);
  const [countdown, setCountdown] = useState(DEFAULT_COUNTDOWN);
  const [captureOverlay, setCaptureOverlay] = useState<CaptureOverlay>(null);
  const countdownRef = useRef(DEFAULT_COUNTDOWN);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const isCapturingRef = useRef(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [activeTab, setActiveTab] = useState<"frame" | "type">("frame");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [exportPreview, setExportPreview] = useState<{ url: string; fileName: string } | null>(null);
  const [isMobileSave, setIsMobileSave] = useState(false);
  const [isIosSave, setIsIosSave] = useState(false);
  const pendingExportRef = useRef<{ blob: Blob; fileName: string; mimeType: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraWrapRef = useRef<HTMLDivElement>(null);
  const captureCompleteBannerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stripPreviewUrl, setStripPreviewUrl] = useState("");
  const stripBlobRef = useRef<Blob | null>(null);
  const [stripFileName, setStripFileName] = useState("kixclicks-photo-strip.png");
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [exportError, setExportError] = useState("");

  const selectedLayout = layouts.find((item) => item.id === layout) ?? layouts[0];
  const selectedTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const needed = selectedLayout.count;

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => () => { if (exportPreview) URL.revokeObjectURL(exportPreview.url); }, [exportPreview]);
  useEffect(() => () => { if (stripPreviewUrl) URL.revokeObjectURL(stripPreviewUrl); }, [stripPreviewUrl]);
  useEffect(() => {
    const timer = window.setInterval(() => setSampleIndex((current) => (current + 1) % sampleFormats.length), 4200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsMobileSave(isMobileExportTarget());
      setIsIosSave(isIosExportTarget());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (captureOverlay !== "complete") return;
    const banner = captureCompleteBannerRef.current;
    if (!banner) return;
    requestAnimationFrame(() => {
      banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [captureOverlay]);

  async function startCamera() {
    setStage("capture"); setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError("Camera access is not available in this browser. You can still use the editor with sample frames."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch { setCameraError("Camera permission was not granted. Check your browser settings, or continue with the sample editor."); }
  }

  function stopCamera() { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }

  async function capturePhoto(selectedIndex?: number) {
    if (isCapturingRef.current) return;
    if (selectedIndex === undefined && photos.length >= needed) return;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const beginCaptureSession = () => {
      isCapturingRef.current = true;
      flushSync(() => {
        setIsCapturing(true);
        setCaptureOverlay(null);
      });
    };

    const finishCaptureSession = (finalPhotos: string[], showStripComplete: boolean) => {
      isCapturingRef.current = false;
      flushSync(() => {
        setPhotos(finalPhotos);
        setIsCapturing(false);
        setCaptureOverlay(showStripComplete ? "complete" : null);
        setFlash(false);
      });
    };

    const abortCaptureSession = () => {
      isCapturingRef.current = false;
      flushSync(() => {
        setIsCapturing(false);
        setCaptureOverlay(null);
        setFlash(false);
      });
    };

    beginCaptureSession();

    const timerSeconds = countdown;
    countdownRef.current = countdown;
    const captureFrame = () => {
      const video = videoRef.current;
      if (!video?.videoWidth) return "";
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        if (mirrorCamera) {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(video, 0, 0);
      }
      return canvas.toDataURL("image/jpeg", 0.88);
    };

    const waitForCountdown = async () => {
      for (let remaining = timerSeconds; remaining > 0; remaining--) {
        flushSync(() => setCaptureOverlay(remaining));
        await sleep(1000);
      }
      flushSync(() => setCaptureOverlay(null));
    };

    const waitPosePrep = async () => {
      flushSync(() => setCaptureOverlay("poses"));
      await yieldToPaint();
      await sleep(POSE_BREAK_MS);
      flushSync(() => setCaptureOverlay(null));
      await yieldToPaint();
    };

    const snapPhoto = async () => {
      await waitForCountdown();
      flushSync(() => setFlash(true));
      const frame = captureFrame();
      await sleep(FLASH_MS);
      flushSync(() => setFlash(false));
      return frame;
    };

    try {
      if (selectedIndex !== undefined) {
        await waitPosePrep();
        const frame = await snapPhoto();
        const updated = [...photos];
        updated[selectedIndex] = frame;
        setRetakeIndex(null);
        finishCaptureSession(updated, updated.length >= needed);
        return;
      }

      let captured = photos;
      for (let shot = photos.length; shot < needed; shot++) {
        await waitPosePrep();
        const frame = await snapPhoto();
        captured = [...captured, frame];
        setPhotos(captured);
      }
      finishCaptureSession(captured, captured.length >= needed);
    } catch {
      abortCaptureSession();
    }
  }

  function beginEditing() { stopCamera(); setStage("edit"); }

  function resetBoothSession() {
    isCapturingRef.current = false;
    stopCamera();
    pendingExportRef.current = null;
    stripBlobRef.current = null;
    setExportPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setStripPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setShareUrl("");
    setShareExpiresAt("");
    setQrDataUrl("");
    setShareError("");
    setShareBusy(false);
    setPrintOpen(false);
    setCopyStatus("");
    setExportError("");
    setIsCapturing(false);
    setCaptureOverlay(null);
    setFlash(false);
    setPhotos([]);
    setRetakeIndex(null);
    setLayout(DEFAULT_LAYOUT);
    setTheme(DEFAULT_THEME);
    setFilter(DEFAULT_FILTER);
    setCaption(DEFAULT_CAPTION);
    setShowDate(true);
    setCountdown(DEFAULT_COUNTDOWN);
    countdownRef.current = DEFAULT_COUNTDOWN;
    setStickers([]);
    setActiveTab("frame");
    setCameraError("");
    setMirrorCamera(true);
  }

  function restart() {
    resetBoothSession();
    setStage("setup");
  }
  async function toggleFullscreen() { if (document.fullscreenElement) await document.exitFullscreen(); else await cameraWrapRef.current?.requestFullscreen(); }

  function addSticker(mark: string) { setStickers((current) => [...current, { id: Date.now(), mark, x: 50 + (current.length % 3) * 16, y: 22 + (current.length % 4) * 17 }]); }

  async function buildCurrentStrip(format: "png" | "jpeg") {
    return composePhotoStrip({
      photos,
      needed,
      layout,
      theme: selectedTheme,
      filter,
      caption,
      showDate,
      stickers,
      format,
    });
  }

  async function exportImage(format: "png" | "jpeg") {
    setExportError("");
    let blob: Blob;
    let mimeType: string;
    let fileName: string;
    try {
      const composed = await buildCurrentStrip(format);
      blob = composed.blob;
      mimeType = composed.mimeType;
      fileName = `kixclicks-${Date.now()}.${format === "png" ? "png" : "jpg"}`;
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The photo strip could not be exported.");
      return;
    }

    if (isMobileExportTarget()) {
      pendingExportRef.current = { blob, fileName, mimeType };
      setExportPreview({ url: URL.createObjectURL(blob), fileName });
      return;
    }

    const result = await savePhotoStripDesktop(blob, fileName, mimeType);
    if (result === "cancelled") return;
  }

  async function finishSession() {
    setShareError("");
    setShareBusy(true);
    setShareUrl("");
    setQrDataUrl("");
    setStage("result");
    try {
      const composed = await buildCurrentStrip("png");
      stripBlobRef.current = composed.blob;
      setStripFileName(composed.fileName);
      setStripPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(composed.blob);
      });

      const body = new FormData();
      body.set("file", composed.blob, composed.fileName);
      const response = await fetch("/api/share", { method: "POST", body });
      let payload: {
        ok?: boolean;
        error?: string;
        shareUrl?: string;
        expiresAt?: string;
        qrReady?: boolean;
        code?: string;
      };
      try {
        payload = await response.json();
      } catch {
        setShareError("The sharing service did not respond. Download and print still work on this device.");
        return;
      }
      if (!response.ok || !payload.ok) {
        setShareError(payload.error || "The photo strip could not be uploaded for QR sharing.");
        return;
      }
      if (!payload.shareUrl || !payload.qrReady) {
        setShareError("Set NEXT_PUBLIC_SITE_URL to https://kixclicks.vercel.app so the QR code can be scanned on another phone. Download and print still work on this device.");
        return;
      }
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(payload.shareUrl, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 320,
        color: { dark: "#500d20", light: "#ffffff" },
      });
      setShareUrl(payload.shareUrl);
      setShareExpiresAt(payload.expiresAt || "");
      setQrDataUrl(qr);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "The photo strip could not be prepared.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Link copied.");
    } catch {
      setCopyStatus("Copy failed. Select the link manually.");
    }
  }

  async function downloadFinishedStrip() {
    const blob = stripBlobRef.current;
    if (!blob) return;
    if (isMobileExportTarget()) {
      pendingExportRef.current = { blob, fileName: stripFileName, mimeType: blob.type || "image/png" };
      setExportPreview({ url: URL.createObjectURL(blob), fileName: stripFileName });
      return;
    }
    await savePhotoStripDesktop(blob, stripFileName, blob.type || "image/png");
  }

  /** Must run from a button tap — phones require a fresh user gesture to open Gallery/Photos. */
  async function saveMobileToGallery() {
    const pending = pendingExportRef.current;
    if (!pending) return;

    const file = new File([pending.blob], pending.fileName, {
      type: pending.mimeType,
      lastModified: Date.now(),
    });

    const shareResult = await tryShareToGallery(file);
    if (shareResult === "shared") {
      closeExportPreview();
      return;
    }
    if (shareResult === "cancelled") return;

    const pickerResult = await trySaveToPicturesFolder(pending.blob, pending.fileName, pending.mimeType);
    if (pickerResult === "saved") {
      closeExportPreview();
      return;
    }
    if (pickerResult === "cancelled") return;

    triggerBrowserDownload(pending.blob, pending.fileName);
  }

  function closeExportPreview() {
    pendingExportRef.current = null;
    setExportPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  const cameraBusy =
    isCapturing || flash || (captureOverlay !== null && captureOverlay !== "complete");
  const captureComplete =
    !cameraError &&
    !isCapturing &&
    (captureOverlay === "complete" || photos.length >= needed);
  const showCameraShutter =
    !cameraError && !cameraBusy && (photos.length < needed || retakeIndex !== null);

  function renderCaptureStripSlots() {
    return Array.from({ length: needed }).map((_, i) => (
      <div className={`capture-strip-slot ${retakeIndex === i ? "selected" : ""}`} key={i}>
        {photos[i] ? (
          <img src={photos[i]} alt={`Captured photo ${i + 1}`} style={{ filter: filterCss[filter] }} />
        ) : (
          <span>photo {i + 1}</span>
        )}
      </div>
    ));
  }

  return <main className={`app-shell theme-${theme}`}>
    {printOpen && stripPreviewUrl && <PrintDialog imageUrl={stripPreviewUrl} onClose={() => setPrintOpen(false)} />}
    {exportPreview && <div className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title" onClick={closeExportPreview}><div className="export-modal-card" onClick={(event) => event.stopPropagation()}><p id="export-modal-title" className="export-modal-title">Save to your gallery</p><p className="export-modal-hint">{isIosSave ? <>Tap <strong>Save to Gallery</strong> below. Your iPhone will open the share menu — choose <strong>Save to Photos</strong> or <strong>Add to Photos</strong>. That is how iOS lets websites save into your library.</> : <>Tap <strong>Save to Gallery</strong> below. Your phone will open a system menu — pick <strong>Photos</strong>, <strong>Gallery</strong>, or <strong>Save to device</strong> and allow access if asked.</>}</p><img src={exportPreview.url} alt="Your photo strip" className="export-modal-image" /><div className="export-modal-actions"><button type="button" className="primary-button full" onClick={saveMobileToGallery}>Save to Gallery</button><button type="button" className="secondary-button full" onClick={closeExportPreview}>Not now</button></div><p className="export-modal-alt">{isIosSave ? "Tip: you can also press and hold the image, then tap Save to Photos." : "If no menu appears, try Chrome and tap Save to Gallery again."}</p></div></div>}
    <header className="topbar"><button className="wordmark" onClick={() => setStage("welcome")} aria-label="Return to welcome"><span className="wordmark-lockup"><span className="wordmark-kix">Kix<BrandFlower className="wordmark-flower" /></span><span className="wordmark-clicks">Clicks</span></span><small>PHOTOBOOTH</small></button><div className="step-info"><span className="step-label">{stage === "welcome" ? "01 / welcome" : stage === "setup" ? "02 / setup" : stage === "capture" ? "03 / capture" : stage === "result" ? "05 / save" : "04 / edit"}</span><span className="step-subtitle">Same moments, better frames</span></div></header>

    {stage === "welcome" && <section className="welcome page-enter"><div className="welcome-copy"><p className="eyebrow">Same moments, better frames</p><button className="primary-button welcome-cta" onClick={() => setStage("setup")}>Start <span><BrandFlower className="welcome-cta-flower" /></span></button><h1>Capture little<br /><em>moments.</em></h1><p className="intro">KixClicks is a playful photobooth for the people you like most. Take a few frames, dress them in blush and wine, and keep the whole thing local.</p><p className="microcopy">No account · camera stays on this device until you share</p></div><div className="sample-stage"><div className="sample-carousel"><div className="sample-track" style={{ transform: `translateX(-${sampleIndex * 100}%)` }}>{sampleFormats.map((format) => <div className={`sample-slide sample-format-${format.id}`} key={format.id}><div className="sample-strip">{Array.from({ length: format.count }).map((_, index) => <div className={`sample-image sample-${(index % 3) + 1}`} key={index}><span>{String(index + 1).padStart(2, "0")}</span></div>)}<p>kixclicks / 2026</p></div><span className="strip-name">{format.name}</span></div>)}</div><div className="carousel-controls"><button aria-label="Previous photo strip" onClick={() => setSampleIndex((sampleIndex + sampleFormats.length - 1) % sampleFormats.length)}>←</button><div className="carousel-dots">{sampleFormats.map((format, index) => <button aria-label={`Show ${format.name} photo strip`} className={sampleIndex === index ? "active" : ""} key={format.id} onClick={() => setSampleIndex(index)} />)}</div><button aria-label="Next photo strip" onClick={() => setSampleIndex((sampleIndex + 1) % sampleFormats.length)}>→</button></div></div><div className="orbit-note note-one">capture<br />little moments</div><div className="orbit-note note-two">✿ 100% local</div></div></section>}

    {stage === "setup" && <section className="workspace page-enter"><div className="section-heading"><p className="eyebrow">Before the click</p><h2>Set the mood.</h2><p>Choose a format, then we&apos;ll take care of the rest.</p></div><div className="setup-grid"><div className="control-card"><label className="control-label">01 / Layout</label><div className="layout-options">{layouts.map((item) => <button className={`layout-option ${layout === item.id ? "selected" : ""}`} key={item.id} onClick={() => setLayout(item.id)}><span className={`layout-thumb ${item.shape}`}>{Array.from({ length: Math.min(item.count, 8) }).map((_, i) => <i key={i} />)}</span><strong>{item.name}</strong><small>{item.count} {item.count === 1 ? "photo" : "photos"}</small></button>)}</div></div><div className="control-card setup-side"><label className="control-label">02 / Countdown</label><div className="segmented">{[3, 5, 10].map((value) => <button key={value} className={countdown === value ? "selected" : ""} onClick={() => { setCountdown(value); countdownRef.current = value; }}>{value}s</button>)}</div><label className="control-label spaced">03 / Camera note</label><p className="soft-note">Your browser will ask for camera permission when you begin. Nothing leaves this device.</p><button className="primary-button full" onClick={startCamera}>Open camera <span>↗</span></button></div></div><button className="text-button" onClick={() => setStage("welcome")}>← back to home page</button></section>}

    {stage === "capture" && <section className="capture-stage page-enter"><div className="capture-top"><div><p className="eyebrow">{selectedLayout.name}</p><h2>Find your light.</h2></div><button className="text-button" onClick={restart} disabled={isCapturing}>restart session</button></div><div className="capture-grid"><div className={`camera-wrap${cameraBusy ? " is-busy" : ""}`} ref={cameraWrapRef}>{cameraError ? <div className="camera-error"><span>◌</span><p>{cameraError}</p><button className="secondary-button" onClick={beginEditing}>Continue to editor</button></div> : <><video ref={videoRef} className="camera-video" style={{ transform: mirrorCamera ? "scaleX(-1)" : "none" }} playsInline muted /><div className={`flash ${flash ? "active" : ""}`} /></>}{!cameraError && captureOverlay === "poses" && <div className="countdown-overlay countdown-overlay--pose-prep" aria-live="polite"><p className="pose-prep-message">Get ready with your poses</p></div>}{!cameraError && typeof captureOverlay === "number" && <div className="countdown-overlay"><span>{captureOverlay}</span><small>get ready</small></div>}{captureOverlay === "complete" && retakeIndex === null && <div className="countdown-overlay countdown-overlay--complete" role="status" aria-live="polite"><p className="capture-complete-title">Capture complete</p><p className="capture-complete-message">Select a photo below to retake, or continue to edit your photo strip.</p></div>}<div className="camera-top-controls"><button className={`option-button ${mirrorCamera ? "active" : ""}`} onClick={() => setMirrorCamera(!mirrorCamera)} aria-pressed={mirrorCamera}>↔ mirror {mirrorCamera ? "on" : "off"}</button><button className="option-button" onClick={toggleFullscreen}>⛶ fullscreen</button></div><div className="camera-overlay-bottom">{!cameraError && <button type="button" className={`shutter camera-shutter${showCameraShutter ? "" : " is-hidden"}`} hidden={!showCameraShutter} tabIndex={showCameraShutter ? 0 : -1} onClick={() => capturePhoto(retakeIndex ?? undefined)} disabled={photos.length >= needed && retakeIndex === null} aria-label={retakeIndex === null ? "Start automatic photo timer" : "Retake selected photo"}><span /></button>}<div className="camera-meta"><span>{photos.length} / {needed} captured</span><span>{isCapturing ? "hold still" : `countdown set to ${countdown}s`}</span></div></div></div><div className="capture-controls"><div className="capture-preview-side"><div className={`capture-strip-preview layout-${layout}`}>{layout === "horizontal" ? <div className="capture-horizontal-photos">{renderCaptureStripSlots()}</div> : renderCaptureStripSlots()}<small>kixclicks / preview</small></div><div className="photo-dots">{Array.from({ length: needed }).map((_, i) => <button type="button" key={i} className={`${i < photos.length ? "filled" : ""} ${retakeIndex === i ? "selected" : ""}`} onClick={() => {
          if (photos[i] === undefined) return;
          setCaptureOverlay(null);
          setRetakeIndex(i);
        }} disabled={isCapturing || photos[i] === undefined} aria-label={`Retake photo ${i + 1}`}>{photos[i] ? <img src={photos[i]} alt="" /> : <span>{i + 1}</span>}</button>)}</div></div>{captureComplete && <div className="capture-complete-banner" ref={captureCompleteBannerRef} role="status"><strong>Capture complete</strong><p>Select a photo to retake, or edit your photo strip when you&apos;re ready.</p></div>}<p className="capture-controls-hint">{isCapturing ? "capturing your strip" : captureComplete && retakeIndex === null ? "your strip is ready — retake or edit below" : retakeIndex !== null ? "tap the shutter on the camera to retake the selected photo" : `tap the shutter to start — ${countdown}s pose prep, then ${countdown}s countdown`}</p>{(photos.length > 0 || captureComplete) && <button className={captureComplete ? "primary-button capture-edit-cta" : "secondary-button"} onClick={beginEditing}>{captureComplete || photos.length >= needed ? "Edit my photo strip" : "Edit what I have"} ↗</button>}</div></div></section>}

    {stage === "edit" && <section className="editor page-enter"><div className="editor-heading"><div><p className="eyebrow">Your KixClicks strip</p><h2>Make it yours.</h2></div><div className="editor-actions"><button className="secondary-button" onClick={restart}>new session</button></div></div><div className="editor-grid"><div className="preview-column"><div className={`strip-preview layout-${layout}`} style={{ background: selectedTheme.paper, color: selectedTheme.ink, borderColor: selectedTheme.color }}>{Array.from({ length: needed }).map((_, i) => photos[i] ? <img key={i} src={photos[i]} alt={`Captured photo ${i + 1}`} style={{ filter: filterCss[filter] }} /> : <Placeholder key={i} index={i} filter={filter} />)}<div className="preview-footer"><span>{caption}</span>{showDate && <small>{new Date().toLocaleDateString("en-GB").replaceAll("/", ".")}</small>}</div>{stickers.map((sticker) => <button className="placed-sticker" style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }} key={sticker.id} onClick={() => setStickers((current) => current.filter((item) => item.id !== sticker.id))}>{sticker.mark}</button>)}</div><p className="preview-hint">Click a sticker on the preview to remove it.</p></div><div className="editor-panel"><div className="tabs">{(["frame", "type"] as const).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>{activeTab === "frame" && <div className="panel-content"><label className="control-label">Theme</label><div className="theme-grid">{themes.map((item) => <button className={`theme-swatch ${theme === item.id ? "selected" : ""}`} key={item.id} onClick={() => setTheme(item.id)}><span style={{ background: item.paper, borderColor: item.color }} /><small>{item.name}</small></button>)}</div><label className="control-label spaced">Photo filter</label><div className="filter-row">{(Object.keys(filterCss) as Filter[]).map((item) => <button className={filter === item ? "selected" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>}{activeTab === "type" && <div className="panel-content"><label className="control-label" htmlFor="caption">Caption (max 26 characters)</label><input id="caption" value={caption} maxLength={26} onChange={(event) => setCaption(event.target.value)} placeholder="a tiny caption" /><div className="toggle-row"><span>Show date stamp</span><button className={`toggle ${showDate ? "on" : ""}`} onClick={() => setShowDate(!showDate)} aria-label="Toggle date stamp"><i /></button></div><label className="control-label spaced">Quick captions</label><div className="quick-captions">{["good vibes only", "same moments", "better frames", "kixclicks"].map((text) => <button key={text} onClick={() => setCaption(text)}>{text}</button>)}</div></div>}<div className="export-area"><button className="primary-button full" onClick={finishSession}>QR, download & print <span>↗</span></button><button className="secondary-button full" onClick={() => exportImage("png")}>{isMobileSave ? "Save to Gallery (PNG)" : "Download PNG"}</button><button className="download-link" onClick={() => exportImage("jpeg")}>{isMobileSave ? "or save as JPEG to Gallery" : "or save as JPEG"}</button>{exportError && <p className="soft-note" role="alert">{exportError}</p>}</div></div></div><canvas ref={canvasRef} className="hidden-canvas" /></section>}

    {stage === "result" && <section className="editor result-stage page-enter"><div className="editor-heading"><div><p className="eyebrow">Session complete</p><h2>Scan, save, or print.</h2></div><div className="editor-actions"><button className="secondary-button" onClick={restart}>Start New Session</button></div></div><div className="result-grid">{stripPreviewUrl ? <img className="result-strip" src={stripPreviewUrl} alt="Final KixClicks photo strip" /> : <p className="soft-note">Preparing your photo strip…</p>}<div className="result-panel">{shareBusy && <p className="soft-note" role="status">Uploading your strip for a shareable QR code…</p>}{qrDataUrl ? <><img className="result-qr" src={qrDataUrl} alt="QR code to save the photo strip" /><p className="result-qr-caption">Scan to save your photo strip</p><p className="microcopy">This link expires {shareExpiresAt ? new Date(shareExpiresAt).toLocaleString() : "in 7 days"}. No account is required.</p></> : !shareBusy && <p className="soft-note" role="alert">{shareError || "The QR code is not ready yet."}</p>}{shareError && qrDataUrl && <p className="soft-note" role="alert">{shareError}</p>}<div className="result-actions"><button className="primary-button full" onClick={downloadFinishedStrip} disabled={!stripPreviewUrl}>Download Photo Strip</button><button className="secondary-button full" onClick={() => setPrintOpen(true)} disabled={!stripPreviewUrl}>Print Photo Strip</button><button className="secondary-button full" onClick={copyShareLink} disabled={!shareUrl}>Copy Link</button>{copyStatus && <p className="microcopy">{copyStatus}</p>}{shareUrl && <p className="share-url">{shareUrl}</p>}<button className="text-button" onClick={restart}>Start New Session</button></div></div></div></section>}
  </main>;
}
