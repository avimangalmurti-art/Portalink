import encode, { init } from '@jsquash/webp/encode.js';
import standardEncoderUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import simdEncoderUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

let encoder: ReturnType<typeof init> | undefined;

export async function encodeCoverWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The cover could not be read.');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);

  encoder ??= init({
    locateFile: (filename: string) => filename === 'webp_enc_simd.wasm' ? simdEncoderUrl : standardEncoderUrl,
  }).catch(error => {
    encoder = undefined;
    throw error;
  });
  await encoder;
  const bytes = await encode(pixels, { quality: 86 });
  return new Blob([bytes], { type: 'image/webp' });
}
