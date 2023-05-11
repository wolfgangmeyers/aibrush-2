const BASE_IMAGE_SIZE = 512 * 512;

export function calculateImagesCost(count: number, width: number, height: number): number {
    // 512x512 = 1 credit
    // floor(count * width * height / 512 / 512)
    return Math.max(Math.floor(count * width * height / BASE_IMAGE_SIZE), 1);
}