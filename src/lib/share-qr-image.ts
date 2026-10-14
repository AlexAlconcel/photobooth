import QRCode from "qrcode";

const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
  width: 320,
  color: { dark: "#500d20", light: "#ffffff" },
};

export async function qrDataUrlForShareLink(shareUrl: string) {
  return QRCode.toDataURL(shareUrl, QR_OPTIONS);
}
