import { MAX_COPIES, MIN_COPIES, parseCopies } from "./copies";

export type PrintMethod = "browser" | "bridge" | "direct";

export type PrinterStatus = {
  method: PrintMethod;
  label: string;
  available: boolean;
  detail: string;
};

export type PaperPreset = "fit" | "photo" | "letter" | "thermal-54" | "thermal-80";

export type PrintJob = {
  imageUrl: string;
  copies: number;
  paperWidthMm: number;
  grayscale: boolean;
  paperPreset?: PaperPreset;
};

export const PAPER_PRESETS: { id: PaperPreset; label: string; widthMm: number }[] = [
  { id: "fit", label: "Fit page", widthMm: 0 },
  { id: "photo", label: "4×6 in", widthMm: 102 },
  { id: "letter", label: "Letter", widthMm: 216 },
  { id: "thermal-54", label: "54 mm", widthMm: 54 },
  { id: "thermal-80", label: "80 mm", widthMm: 80 },
];

function pageRule(preset: PaperPreset) {
  if (preset === "photo") return "@page { size: 4in 6in; margin: 5mm; }";
  if (preset === "letter") return "@page { size: letter portrait; margin: 12mm; }";
  if (preset === "thermal-54") return "@page { size: 54mm auto; margin: 2mm; }";
  if (preset === "thermal-80") return "@page { size: 80mm auto; margin: 3mm; }";
  return "@page { size: auto; margin: 10mm; }";
}

async function asPrintableSrc(imageUrl: string) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("The print image could not be read.");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The print image could not be prepared."));
    reader.readAsDataURL(blob);
  });
}

export interface PrinterAdapter {
  id: PrintMethod;
  inspect(): Promise<PrinterStatus>;
  print(job: PrintJob): Promise<{ submitted: boolean; message: string }>;
}

export function validatePrintCopies(value: string | number) {
  const copies = parseCopies(value);
  if (copies === null) {
    return { ok: false as const, error: `Enter a whole number from ${MIN_COPIES} to ${MAX_COPIES}.` };
  }
  return { ok: true as const, copies };
}

export async function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The print preview image failed to load."));
  });
}

export const browserPrintAdapter: PrinterAdapter = {
  id: "browser",
  async inspect() {
    return {
      method: "browser",
      label: "Browser / system printer",
      available: typeof window !== "undefined" && typeof window.print === "function",
      detail: "Opens your operating system print dialog. Choose the printer and confirm copies there.",
    };
  },
  async print(job) {
    const copies = validatePrintCopies(job.copies);
    if (!copies.ok) return { submitted: false, message: copies.error };
    if (typeof window.print !== "function") {
      return {
        submitted: false,
        message: "This browser does not provide a print dialog. Download the strip and print it from another device, or from your phone’s Share / Print menu.",
      };
    }

    let src: string;
    try {
      src = await asPrintableSrc(job.imageUrl);
    } catch (error) {
      return { submitted: false, message: error instanceof Error ? error.message : "The print image could not be prepared." };
    }

    const preset = job.paperPreset ?? "fit";
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return { submitted: false, message: "The print frame could not be created." };
    }

    const pages = Array.from({ length: copies.copies }, (_, index) =>
      `<div class="print-copy"><img ${index === 0 ? 'id="strip" ' : ""}alt="KixClicks photo strip" /></div>`,
    ).join("");

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>KixClicks print</title>
<style>
  ${pageRule(preset)}
  html, body { margin: 0; padding: 0; background: #fff; }
  body { margin: 0; }
  .print-copy { page-break-after: always; display: flex; justify-content: center; align-items: flex-start; }
  .print-copy:last-child { page-break-after: auto; }
  img {
    max-width: 100%;
    max-height: calc(100vh - 16mm);
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
</style></head><body>${pages}</body></html>`);
    doc.close();

    const image = doc.getElementById("strip");
    if (!(image instanceof HTMLImageElement)) {
      frame.remove();
      return { submitted: false, message: "The print preview image was missing." };
    }

    try {
      for (const item of Array.from(doc.images)) item.src = src;
      await waitForImage(image);
      const extras = Array.from(doc.images).filter((item) => item !== image);
      await Promise.all(extras.map((item) => waitForImage(item).catch(() => undefined)));
      await new Promise<void>((resolve) => {
        const finish = () => {
          window.removeEventListener("focus", finish);
          frame.remove();
          resolve();
        };
        window.addEventListener("focus", finish, { once: true });
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(finish, 120_000);
      });
      return {
        submitted: true,
        message: `Print dialog opened for ${copies.copies} cop${copies.copies === 1 ? "y" : "ies"}. Choose a printer in the browser dialog. Websites cannot print silently, and opening the dialog does not confirm that paper came out.`,
      };
    } catch (error) {
      frame.remove();
      return { submitted: false, message: error instanceof Error ? error.message : "Printing failed." };
    }
  },
};

export const directPrintAdapter: PrinterAdapter = {
  id: "direct",
  async inspect() {
    const usb = "usb" in navigator;
    const serial = "serial" in navigator;
    if (!usb && !serial) {
      return {
        method: "direct",
        label: "Direct USB / serial",
        available: false,
        detail: "This browser does not expose WebUSB or Web Serial, so a thermal printer cannot be addressed from the page.",
      };
    }
    return {
      method: "direct",
      label: "Direct USB / serial",
      available: true,
      detail: "A device picker can be shown, but no printer model is configured. KixClicks will not send unknown ESC/POS or vendor commands.",
    };
  },
  async print() {
    return {
      submitted: false,
      message: "Direct thermal printing is not configured for a specific printer model. Use browser printing, or add a local print bridge on the computer attached to the printer.",
    };
  },
};

export const localBridgeAdapter: PrinterAdapter = {
  id: "bridge",
  async inspect() {
    try {
      const response = await fetch("http://127.0.0.1:4173/health", { method: "GET" });
      if (!response.ok) {
        return {
          method: "bridge",
          label: "Local print bridge",
          available: false,
          detail: "A local bridge responded, but it is not ready to print.",
        };
      }
      const payload = (await response.json()) as { ok?: boolean; printer?: string };
      return {
        method: "bridge",
        label: "Local print bridge",
        available: Boolean(payload.ok),
        detail: payload.printer
          ? `Bridge online for ${payload.printer}.`
          : "Bridge online. Configure a printer adapter in print-bridge before sending jobs.",
      };
    } catch {
      return {
        method: "bridge",
        label: "Local print bridge",
        available: false,
        detail: "No local bridge at 127.0.0.1:4173. Run the optional print-bridge on the computer connected to the printer.",
      };
    }
  },
  async print(job) {
    const copies = validatePrintCopies(job.copies);
    if (!copies.ok) return { submitted: false, message: copies.error };
    try {
      const response = await fetch("http://127.0.0.1:4173/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: job.imageUrl,
          copies: copies.copies,
          paperWidthMm: job.paperWidthMm,
          grayscale: job.grayscale,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        return { submitted: false, message: payload.message || "The local print bridge rejected the job." };
      }
      return { submitted: true, message: payload.message || "The bridge accepted the job. Check the printer for physical output." };
    } catch {
      return { submitted: false, message: "Could not reach the local print bridge." };
    }
  },
};

export async function inspectPrinters(): Promise<PrinterStatus[]> {
  return Promise.all([browserPrintAdapter.inspect(), localBridgeAdapter.inspect(), directPrintAdapter.inspect()]);
}

export function adapterFor(method: PrintMethod): PrinterAdapter {
  if (method === "bridge") return localBridgeAdapter;
  if (method === "direct") return directPrintAdapter;
  return browserPrintAdapter;
}
