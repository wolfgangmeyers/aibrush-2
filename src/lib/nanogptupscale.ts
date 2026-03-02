import { sleep } from "./sleep";
import { NanoGPTGenerator } from "./nanogptgenerator";
import { GenerationJob } from "./models";

/** Poll interval between NanoGPT job status checks. */
const POLL_INTERVAL_MS = 2000;

/**
 * Submits an upscale job to NanoGPT and polls until completion.
 * Accepts injectable sleep/now functions for testability.
 *
 * NOTE: The actual maximum wait time is `timeoutMs + POLL_INTERVAL_MS` because
 * the timeout is checked after each sleep+poll cycle, not before. At the
 * default 2 s poll interval the overshoot is small but worth knowing.
 *
 * @param encodedPng Raw base64 PNG string (no data URL prefix)
 * @returns Full data URL of the upscaled image
 */
export async function performNanoGPTUpscale(
    encodedPng: string,
    generator: NanoGPTGenerator,
    opts?: {
        sleepFn?: (ms: number) => Promise<void>;
        nowFn?: () => number;
        timeoutMs?: number;
    }
): Promise<string> {
    const { sleepFn = sleep, nowFn = Date.now, timeoutMs = 120_000 } = opts ?? {};

    let job: GenerationJob = await generator.generateImages({
        model: "Upscaler",
        // "upscale" is the sentinel prompt value required by the Upscaler model.
        params: { prompt: "upscale" },
        // Upscaler always produces one result.
        count: 1,
        encoded_image: encodedPng,
    });

    const start = nowFn();
    while (job.status !== "completed" && job.status !== "error") {
        await sleepFn(POLL_INTERVAL_MS);
        job = await generator.checkGenerationJob(job);
        if (nowFn() - start > timeoutMs) {
            throw new Error("NanoGPT upscale timed out");
        }
    }

    if (job.status === "error") {
        throw new Error(job.error || "NanoGPT upscale failed");
    }

    const resultImageData = job.images?.[0]?.imageData;
    if (!resultImageData) {
        throw new Error("NanoGPT upscale returned no image data");
    }

    return resultImageData;
}
