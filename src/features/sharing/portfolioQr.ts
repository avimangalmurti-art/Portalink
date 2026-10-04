import { generate } from 'lean-qr';
/** The existing PNG format: default QR correction, four-module quiet zone,
 * integer scaling, white background, and no decorative obstruction. */
export function createPortfolioQrImage(url: string): HTMLCanvasElement {
  const raw = document.createElement('canvas');
  generate(url).toCanvas(raw, { pad: 4, off: [255, 255, 255, 255] });
  const output = document.createElement('canvas');
  output.width = 1024; output.height = 1024;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('QR image could not be created.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.imageSmoothingEnabled = false;
  const size = Math.floor(1024 / raw.width) * raw.width;
  ctx.drawImage(raw, (1024 - size) / 2, (1024 - size) / 2, size, size);
  return output;
}
