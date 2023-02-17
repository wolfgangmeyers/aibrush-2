import { S3 } from "@aws-sdk/client-s3";

const s3 = new S3({
    region: "us-west-2"
});

import sharp from "sharp";

function mergeImage(baseImage: Buffer, overlayImage: Buffer, x: number, y: number): Promise<Buffer> {
  return sharp(baseImage)
    .composite([{ input: overlayImage, left: x, top: y }])
    .toBuffer();
}

interface MergeImageRequest {
    baseImageKey: string;
    overlayImageKey: string;
    x: number;
    y: number;
}

async function downloadImage(key: string): Promise<Buffer> {
    // return null if object doesn't exist
    try {
        const data = await s3.getObject({
            Bucket: "aibrush2-filestore",
            Key: key,
        });
        const imageData = await data.Body.transformToByteArray();
        // imageData to buffer
        return Buffer.from(imageData);
    } catch (e) {
        return null;
    }
}

async function uploadImage(key: string, data: Buffer): Promise<void> {
    // convert to png
    const png = await sharp(data).png().toBuffer();
    // upload to s3
    await s3.putObject({
        Bucket: "aibrush2-filestore",
        Key: key,
        Body: png,
    });
}

export const handler = async(event: MergeImageRequest) => {
    const { baseImageKey, overlayImageKey, x, y } = event;
    // download base image
    const baseImage = await downloadImage(baseImageKey);
    // download overlay image
    const overlayImage = await downloadImage(overlayImageKey);
    // merge images
    const mergedImage = await mergeImage(baseImage, overlayImage, x, y);
    // upload merged image
    await uploadImage(baseImageKey, mergedImage);
};
