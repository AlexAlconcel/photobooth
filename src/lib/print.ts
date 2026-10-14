import { MAX_COPIES, MIN_COPIES, parseCopies } from "./copies";

export type PrintMethod = "browser" | "bridge" | "direct";

export type PrinterStatus = {
  method: PrintMethod;
  label: string;
  available: boolean;
  detail: string;
};

export type PrintJob = {
  imageUrl: string;
  copies: number;
  paperWidthMm: number;
  grayscale: boolean;
};

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

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>KixClicks print</title>
<style>
  @page { size: auto; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { display: flex; justify-content: center; align-items: start; }
  img { max-width: 100%; height: auto; display: block; }
</style></head><body>
  <img id="strip" alt="KixClicks photo strip" src="${job.imageUrl}" />
</body></html>`);
    doc.close();

    const image = doc.getElementById("strip");
    if (!(image instanceof HTMLImageElement)) {
      frame.remove();
      return { submitted: false, message: "The print preview image was missing." };
    }

    try {
      await waitForImage(image);
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
        message: `Print dialog opened. Confirm ${copies.copies} cop${copies.copies === 1 ? "y" : "ies"} in the system dialog if your printer supports it. Opening the dialog does not confirm that paper was printed.`,
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
