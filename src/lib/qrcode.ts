import "server-only";

import QRCode from "qrcode";

/**
 * Base URL for QR payloads. When deploying, set NEXT_PUBLIC_APP_URL to the
 * public host (e.g. https://pgso.example.gov.ph) so scanned tags open the
 * live page instead of localhost.
 */
function appBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return raw || "http://localhost:3000";
}

/**
 * One-QR design: the tag encodes the asset's details-page URL, and that page
 * already shows details + history together. Embedding the full data in the QR
 * instead would exceed QR capacity (~3 KB), go stale on every edit, and scan
 * poorly — the URL stays short and always opens current data.
 */
export function assetPageUrl(id: string): string {
  return `${appBaseUrl()}/personnel/assets/${id}`;
}

export function stockPageUrl(id: string): string {
  return `${appBaseUrl()}/personnel/assets/stock/${id}`;
}

export async function generateAssetQrDataUrl(id: string): Promise<string> {
  return generateQrDataUrl(assetPageUrl(id));
}

export async function generateStockQrDataUrl(id: string): Promise<string> {
  return generateQrDataUrl(stockPageUrl(id));
}

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
