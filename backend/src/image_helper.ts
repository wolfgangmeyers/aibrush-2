import sharp from "sharp";

export function mergeImage(baseImage: Buffer, overlayImage: Buffer, x: number, y: number): Promise<Buffer> {
  return sharp(baseImage)
    .composite([{ input: overlayImage, left: x, top: y }])
    .toBuffer();
}
