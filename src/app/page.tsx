"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "welcome" | "setup" | "capture" | "edit";
type Filter = "original" | "mono" | "sepia" | "warm" | "cool" | "vintage";
type LayoutId = "four" | "three" | "double" | "grid" | "single" | "horizontal";
type ThemeId = "minimal" | "rose" | "cream" | "film" | "ink" | "beige" | "friends";
type Sticker = { id: number; mark: string; x: number; y: number };

const layouts: { id: LayoutId; name: string; count: number; shape: string }[] = [
  { id: "four", name: "Four cut", count: 4, shape: "strip" },
  { id: "three", name: "Three cut", count: 3, shape: "strip short" },
  { id: "grid", name: "Square grid", count: 4, shape: "grid" },
  { id: "single", name: "Single frame", count: 1, shape: "single" },
  { id: "horizontal", name: "Side by side", count: 4, shape: "horizontal" },
];

const themes: { id: ThemeId; name: string; color: string; paper: string; ink: string }[] = [
  { id: "minimal", name: "Korean minimal", color: "#e7d8cd", paper: "#fbf9f5", ink: "#302a28" },
  { id: "rose", name: "Soft rose", color: "#efc8c8", paper: "#fff5f3", ink: "#593d40" },
  { id: "cream", name: "Cream vintage", color: "#d8ba87", paper: "#f2e4ca", ink: "#553f2b" },
  { id: "film", name: "Retro film", color: "#b89066", paper: "#252321", ink: "#f7ead4" },
  { id: "ink", name: "Elegant black", color: "#3a3836", paper: "#1e1d1c", ink: "#f4eee7" },
  { id: "beige", name: "Warm beige", color: "#c7a98b", paper: "#eadbc9", ink: "#4b3527" },
  { id: "friends", name: "Friends edition", color: "#97ada0", paper: "#edf0e9", ink: "#33483f" },
];

const filterCss: Record<Filter, string> = { original: "none", mono: "grayscale(1)", sepia: "sepia(.72)", warm: "sepia(.2) saturate(1.35)", cool: "hue-rotate(165deg) saturate(.75)", vintage: "sepia(.35) contrast(.9) brightness(1.05)" };
const stickerChoices = ["♥", "✦", "✿", "✧", "♡", "·"];
const sampleFormats = [
  { id: "three", name: "three cut", count: 3 },
  { id: "four", name: "four cut", count: 4 },
  { id: "single", name: "one cut", count: 1 },
];

function Placeholder({ index, filter }: { index: number; filter: Filter }) {
  return <div className="placeholder-photo" style={{ filter: filterCss[filter] }}><span>{String(index + 1).padStart(2, "0")}</span><i>your photo</i></div>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [layout, setLayout] = useState<LayoutId>("four");
  const [theme, setTheme] = useState<ThemeId>("minimal");
  const [filter, setFilter] = useState<Filter>("original");
  const [photos, setPhotos] = useState<string[]>([]);
  const [caption, setCaption] = useState("made with friends");
  const [showDate, setShowDate] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownRef = useRef(3);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [activeTab, setActiveTab] = useState<"frame" | "type" | "decorate">("frame");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraWrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedLayout = layouts.find((item) => item.id === layout) ?? layouts[0];
  const selectedTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const needed = selectedLayout.count;

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => {
    const timer = window.setInterval(() => setSampleIndex((current) => (current + 1) % sampleFormats.length), 4200);
    return () => window.clearInterval(timer);
  }, []);

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
    if (isCapturing || selectedIndex === undefined && photos.length >= needed) return;
    setIsCapturing(true);
    const timerSeconds = countdownRef.current;
    const captureFrame = () => {
      const video = videoRef.current;
      if (!video?.videoWidth) return "";
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) { if (mirrorCamera) { context.translate(canvas.width, 0); context.scale(-1, 1); } context.drawImage(video, 0, 0); }
      return canvas.toDataURL("image/jpeg", .88);
    };
    const waitForCountdown = async () => { for (let remaining = timerSeconds; remaining > 0; remaining--) { setCountdownValue(remaining); await new Promise((resolve) => setTimeout(resolve, 1000)); } };
    if (selectedIndex !== undefined) {
      await waitForCountdown(); setCountdownValue(null); setFlash(true);
      const updated = [...photos]; updated[selectedIndex] = captureFrame(); setPhotos(updated); setRetakeIndex(null);
      await new Promise((resolve) => setTimeout(resolve, 250)); setFlash(false); setIsCapturing(false); return;
    }
    let captured = photos;
    for (let shot = photos.length; shot < needed; shot++) {
      await waitForCountdown(); setCountdownValue(null); setFlash(true);
      captured = [...captured, captureFrame()]; setPhotos(captured);
      await new Promise((resolve) => setTimeout(resolve, 250)); setFlash(false);
    }
    setCountdownValue(null); setIsCapturing(false);
  }

  function beginEditing() { stopCamera(); setStage("edit"); }
  function restart() { stopCamera(); setPhotos([]); setStage("setup"); }
  async function toggleFullscreen() { if (document.fullscreenElement) await document.exitFullscreen(); else await cameraWrapRef.current?.requestFullscreen(); }

  function addSticker(mark: string) { setStickers((current) => [...current, { id: Date.now(), mark, x: 50 + (current.length % 3) * 16, y: 22 + (current.length % 4) * 17 }]); }

  async function exportImage(format: "png" | "jpeg") {
    const canvas = canvasRef.current; if (!canvas) return;
    const width = layout === "horizontal" ? 1600 : layout === "grid" ? 1200 : 800;
    const height = layout === "horizontal" ? 520 : layout === "grid" ? 1200 : 1320;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = selectedTheme.paper; context.fillRect(0, 0, width, height);
    const pad = 72; const gap = 24; const items = photos.length || needed;
    const isGrid = layout === "grid"; const isHorizontal = layout === "horizontal";
    const columns = isGrid ? 2 : isHorizontal ? Math.min(items, 4) : 1;
    const rows = Math.ceil(items / columns); const photoWidth = isGrid ? (width - pad * 2 - gap) / 2 : isHorizontal ? (width - pad * 2 - gap * (columns - 1)) / columns : width - pad * 2;
    const photoHeight = isGrid ? photoWidth : (height - pad * 2 - gap * (rows - 1) - 120) / rows;
    const drawOne = async (src: string, x: number, y: number, w: number, h: number, i: number) => {
      context.save(); context.filter = filterCss[filter];
      if (src) { const image = new Image(); image.src = src; await image.decode(); context.drawImage(image, x, y, w, h); } else { context.fillStyle = selectedTheme.color; context.fillRect(x, y, w, h); }
      context.fillStyle = selectedTheme.ink; context.font = "bold 18px sans-serif"; context.fillText(String(i + 1).padStart(2, "0"), x + 16, y + 28); context.restore();
    };
    for (let i = 0; i < items; i++) await drawOne(photos[i] ?? "", pad + (i % columns) * (photoWidth + gap), pad + Math.floor(i / columns) * (photoHeight + gap), photoWidth, photoHeight, i);
    context.fillStyle = selectedTheme.ink; context.textAlign = "center"; context.font = "24px Georgia"; context.fillText(caption || "", width / 2, height - 52); if (showDate) { context.font = "12px sans-serif"; context.fillText(new Date().toLocaleDateString("en-GB").replaceAll("/", "."), width / 2, height - 25); }
    const link = document.createElement("a"); link.download = `momo-${Date.now()}.${format}`; link.href = canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", .92); link.click();
  }

  return <main className={`app-shell theme-${theme}`}>
    <header className="topbar"><button className="wordmark" onClick={() => setStage("welcome")} aria-label="Return to welcome"><span>momo</span><small>PHOTO BOOTH</small></button><div className="privacy"><span className="privacy-dot" /> processed locally in your browser</div><span className="step-label">{stage === "welcome" ? "01 / welcome" : stage === "setup" ? "02 / setup" : stage === "capture" ? "03 / capture" : "04 / edit"}</span></header>

    {stage === "welcome" && <section className="welcome page-enter"><div className="welcome-copy"><p className="eyebrow">A little memory machine</p><button className="primary-button welcome-cta" onClick={() => setStage("setup")}>Enter the booth <span>↗</span></button><h1>Make a moment<br /><em>worth keeping.</em></h1><p className="intro">A quiet, playful photobooth for the people you like most. Take a few frames, make them yours, and keep the whole thing local.</p><p className="microcopy">No account · no uploads · just your camera</p></div><div className="sample-stage"><div className="sample-carousel"><div className="sample-track" style={{ transform: `translateX(-${sampleIndex * 100}%)` }}>{sampleFormats.map((format) => <div className={`sample-slide sample-format-${format.id}`} key={format.id}><div className="sample-strip">{Array.from({ length: format.count }).map((_, index) => <div className={`sample-image sample-${(index % 3) + 1}`} key={index}><span>{String(index + 1).padStart(2, "0")}</span></div>)}<p>momo / 2026</p></div><span className="strip-name">{format.name}</span></div>)}</div><div className="carousel-controls"><button aria-label="Previous photo strip" onClick={() => setSampleIndex((sampleIndex + sampleFormats.length - 1) % sampleFormats.length)}>←</button><div className="carousel-dots">{sampleFormats.map((format, index) => <button aria-label={`Show ${format.name} photo strip`} className={sampleIndex === index ? "active" : ""} key={format.id} onClick={() => setSampleIndex(index)} />)}</div><button aria-label="Next photo strip" onClick={() => setSampleIndex((sampleIndex + 1) % sampleFormats.length)}>→</button></div></div><div className="orbit-note note-one">little<br />keepsakes</div><div className="orbit-note note-two">✦ 100% local</div></div></section>}

    {stage === "setup" && <section className="workspace page-enter"><div className="section-heading"><p className="eyebrow">Before the click</p><h2>Set the mood.</h2><p>Choose a format, then we&apos;ll take care of the rest.</p></div><div className="setup-grid"><div className="control-card"><label className="control-label">01 / Layout</label><div className="layout-options">{layouts.map((item) => <button className={`layout-option ${layout === item.id ? "selected" : ""}`} key={item.id} onClick={() => setLayout(item.id)}><span className={`layout-thumb ${item.shape}`}>{Array.from({ length: Math.min(item.count, 8) }).map((_, i) => <i key={i} />)}</span><strong>{item.name}</strong><small>{item.count} {item.count === 1 ? "photo" : "photos"}</small></button>)}</div></div><div className="control-card setup-side"><label className="control-label">02 / Countdown</label><div className="segmented">{[3, 5, 10].map((value) => <button key={value} className={countdown === value ? "selected" : ""} onClick={() => { setCountdown(value); countdownRef.current = value; }}>{value}s</button>)}</div><label className="control-label spaced">03 / Camera note</label><p className="soft-note">Your browser will ask for camera permission when you begin. Nothing leaves this device.</p><button className="primary-button full" onClick={startCamera}>Open camera <span>↗</span></button></div></div><button className="text-button" onClick={() => setStage("welcome")}>← back to welcome</button></section>}

    {stage === "capture" && <section className="capture-stage page-enter"><div className="capture-top"><div><p className="eyebrow">{selectedLayout.name}</p><h2>Find your light.</h2></div><button className="text-button" onClick={restart}>restart session</button></div><div className="capture-grid"><div className="camera-wrap" ref={cameraWrapRef}>{cameraError ? <div className="camera-error"><span>◌</span><p>{cameraError}</p><button className="secondary-button" onClick={beginEditing}>Continue to editor</button></div> : <><video ref={videoRef} className="camera-video" style={{ transform: mirrorCamera ? "scaleX(-1)" : "none" }} playsInline muted /><div className={`flash ${flash ? "active" : ""}`} />{countdownValue !== null && <div className="countdown-overlay"><span>{countdownValue}</span><small>get ready</small></div>}</>}<div className="camera-top-controls"><button className={`option-button ${mirrorCamera ? "active" : ""}`} onClick={() => setMirrorCamera(!mirrorCamera)} aria-pressed={mirrorCamera}>↔ mirror {mirrorCamera ? "on" : "off"}</button><button className="option-button" onClick={toggleFullscreen}>⛶ fullscreen</button></div><div className="camera-meta"><span>{photos.length} / {needed} captured</span><span>{isCapturing ? "hold still" : `countdown set to ${countdown}s`}</span></div></div><div className="capture-controls"><div className="capture-preview-side"><div className={`capture-strip-preview layout-${layout}`}>{Array.from({ length: needed }).map((_, i) => <div className={`capture-strip-slot ${retakeIndex === i ? "selected" : ""}`} key={i}>{photos[i] ? <img src={photos[i]} alt={`Captured photo ${i + 1}`} style={{ filter: filterCss[filter] }} /> : <span>photo {i + 1}</span>}</div>)}<small>momo / preview</small></div><div className="photo-dots">{Array.from({ length: needed }).map((_, i) => <button type="button" key={i} className={`${i < photos.length ? "filled" : ""} ${retakeIndex === i ? "selected" : ""}`} onClick={() => photos[i] !== undefined && setRetakeIndex(i)} disabled={isCapturing || photos[i] === undefined} aria-label={`Retake photo ${i + 1}`}>{photos[i] ? <img src={photos[i]} alt="" /> : <span>{i + 1}</span>}</button>)}</div></div><button className="shutter" onClick={() => capturePhoto(retakeIndex ?? undefined)} disabled={isCapturing || photos.length >= needed && retakeIndex === null} aria-label={retakeIndex === null ? "Start automatic photo timer" : "Retake selected photo"}><span /></button><p>{isCapturing ? "capturing your strip" : retakeIndex === null ? `tap once to start ${countdown}s countdown` : "tap shutter to retake selected frame"}</p>{photos.length > 0 && <button className="secondary-button" onClick={beginEditing}>{photos.length >= needed ? "See my strip" : "Edit what I have"} ↗</button>}</div></div></section>}

    {stage === "edit" && <section className="editor page-enter"><div className="editor-heading"><div><p className="eyebrow">Your little keepsake</p><h2>Make it yours.</h2></div><div className="editor-actions"><button className="text-button" onClick={() => setStage("capture")}>← back to camera</button><button className="secondary-button" onClick={restart}>new session</button></div></div><div className="editor-grid"><div className="preview-column"><div className={`strip-preview layout-${layout}`} style={{ background: selectedTheme.paper, color: selectedTheme.ink, borderColor: selectedTheme.color }}>{Array.from({ length: needed }).map((_, i) => photos[i] ? <img key={i} src={photos[i]} alt={`Captured photo ${i + 1}`} style={{ filter: filterCss[filter] }} /> : <Placeholder key={i} index={i} filter={filter} />)}<div className="preview-footer"><span>{caption}</span>{showDate && <small>{new Date().toLocaleDateString("en-GB").replaceAll("/", ".")}</small>}</div>{stickers.map((sticker) => <button className="placed-sticker" style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }} key={sticker.id} onClick={() => setStickers((current) => current.filter((item) => item.id !== sticker.id))}>{sticker.mark}</button>)}</div><p className="preview-hint">Click a sticker on the preview to remove it.</p></div><div className="editor-panel"><div className="tabs">{(["frame", "type", "decorate"] as const).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>{activeTab === "frame" && <div className="panel-content"><label className="control-label">Theme</label><div className="theme-grid">{themes.map((item) => <button className={`theme-swatch ${theme === item.id ? "selected" : ""}`} key={item.id} onClick={() => setTheme(item.id)}><span style={{ background: item.paper, borderColor: item.color }} /><small>{item.name}</small></button>)}</div><label className="control-label spaced">Photo filter</label><div className="filter-row">{(Object.keys(filterCss) as Filter[]).map((item) => <button className={filter === item ? "selected" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>}{activeTab === "type" && <div className="panel-content"><label className="control-label" htmlFor="caption">Caption</label><input id="caption" value={caption} maxLength={26} onChange={(event) => setCaption(event.target.value)} placeholder="a tiny caption" /><div className="toggle-row"><span>Show date stamp</span><button className={`toggle ${showDate ? "on" : ""}`} onClick={() => setShowDate(!showDate)} aria-label="Toggle date stamp"><i /></button></div><label className="control-label spaced">Quick captions</label><div className="quick-captions">{["made with friends", "good times only", "see you soon", "stay soft"].map((text) => <button key={text} onClick={() => setCaption(text)}>{text}</button>)}</div></div>}{activeTab === "decorate" && <div className="panel-content"><label className="control-label">Add a little something</label><div className="sticker-grid">{stickerChoices.map((mark) => <button key={mark} onClick={() => addSticker(mark)}>{mark}</button>)}</div><p className="soft-note">Tap a decoration to add it. Tap one on the preview to remove it.</p></div>}<div className="export-area"><button className="primary-button full" onClick={() => exportImage("png")}>Download PNG <span>↓</span></button><button className="download-link" onClick={() => exportImage("jpeg")}>or save as JPEG</button></div></div></div><canvas ref={canvasRef} className="hidden-canvas" /></section>}
  </main>;
}
