import "server-only";

import QRCode from "qrcode";

export async function generateQrDataUrl(
  data: string,
  width = 96,
  dark = "#1b2a4a",
  light = "#ffffff",
): Promise<string> {
  try {
    const svg = await QRCode.toString(data, {
      type: "svg",
      width,
      margin: 1,
      color: { dark, light },
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return "";
  }
}
