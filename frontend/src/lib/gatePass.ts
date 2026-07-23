import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { api } from './api';

/**
 * The backend's QR image encodes raw text ("ERP_GATE_PASS:<token>"), not a
 * URL — a real camera scan of it just shows gibberish. This module decodes
 * that image client-side to recover the token, then renders our own QR that
 * encodes a public scan-page URL instead, so scanning it opens that page.
 */

const QR_PREFIX = 'ERP_GATE_PASS:';

export function gatePassPublicUrl(token: string) {
  return `${window.location.origin}/gate-pass/scan/${token}`;
}

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function decodeGatePassToken(qrBlob: Blob): Promise<string | null> {
  const imageData = await blobToImageData(qrBlob);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  if (!result) return null;
  const text = result.data.trim();
  return text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
}

export interface GatePassScanQr {
  token: string;
  publicUrl: string;
  qrDataUrl: string;
}

/**
 * Fetches the backend-generated QR for a gate pass (existing protected
 * `/gate-passes/:id/qr` endpoint), decodes its embedded token, and renders a
 * new QR encoding the public scan-page URL for that token.
 */
export async function buildGatePassScanQr(qrUrlPath: string): Promise<GatePassScanQr> {
  const res = await api.get(qrUrlPath, { responseType: 'blob' });
  const token = await decodeGatePassToken(res.data as Blob);
  if (!token) throw new Error('Could not read the gate pass QR code');
  const publicUrl = gatePassPublicUrl(token);
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 2, width: 320 });
  return { token, publicUrl, qrDataUrl };
}
