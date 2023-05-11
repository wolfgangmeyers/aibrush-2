import * as AWS from "aws-sdk";
import sharp from "sharp";
import Bugsnag from "@bugsnag/js";
import axios from "axios";
import moment from "moment";
import { sleep } from "./sleep";
import { MetricsClient } from "./metrics";
import { addTrigger } from "./triggers";

import {
    AlchemistPayload,
    HordeRequestPayload,
    processAlchemistImage,
    processImage,
} from "./horde";
import { PromiseResult } from "aws-sdk/lib/request";

if (process.env.BUGSNAG_API_KEY) {
    Bugsnag.start({
        apiKey: process.env.BUGSNAG_API_KEY,
    });
}

const callbackEndpoint = "https://www.aibrush.art";

const metricsClient = new MetricsClient(process.env.NEW_RELIC_LICENSE_KEY);

interface UpdateImageInput {
    status: string;
    error?: string;
    nsfw?: boolean;
}

async function updateImage(
    imageId: string,
    input: UpdateImageInput,
    authToken: string
) {
    const url = `${callbackEndpoint}/api/images/${imageId}`;
    await axios.patch(url, input, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
    });
}

const s3Client = new AWS.S3({
    region: "us-west-2",
});
const sqsClient = new AWS.SQS({
    region: "us-west-2",
});

// keep track of how many images are being processed
let activeImageCount = 0;

// // we pass the image url to the horde, so this isn't really needed
// async function downloadImage(key: string): Promise<Buffer> {
//     // return null if object doesn't exist
//     try {
//         const data = await s3Client
//             .getObject({
//                 Bucket: "aibrush2-filestore",
//                 Key: key,
//             })
//             .promise();
//         const imageData = data.Body as Buffer;
//         // load with sharp
//         const image = sharp(imageData);
//         // convert to webp and return buffer
//         const webp = await image.webp().toBuffer();
//         return webp;
//     } catch (e) {
//         return null;
//     }
// }

// check if an image with a given key exists, without downloading it
async function imageExists(key: string): Promise<boolean> {
    try {
        await s3Client
            .headObject({
                Bucket: "aibrush2-filestore",
                Key: key,
            })
            .promise();
        return true;
    } catch (e) {
        return false;
    }
}

async function uploadImage(key: string, data: Buffer): Promise<void> {
    // convert to png
    const png = await sharp(data).png().toBuffer();
    // upload to s3
    await s3Client
        .putObject({
            Bucket: "aibrush2-filestore",
            Key: key,
            Body: png,
        })
        .promise();
}

const hordeApiKey = process.env.STABLE_HORDE_API_KEY;
const hordeBaseUrl = "https://stablehorde.net/api";
const queueUrl = process.env.HORDE_QUEUE_URL;
const paidQueueUrl = process.env.PAID_HORDE_QUEUE_URL;

const augmentationToForm = {
    upscale: "RealESRGAN_x4plus",
    face_restore: "GFPGAN",
    remove_background: "strip_background",
};

interface HordeRequest {
    authToken: string;
    imageId: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    seed: string;
    denoisingStrength: number;
    nsfw: boolean;
    censorNsfw: boolean;
    model: string;
    augmentation: "face_restore" | "remove_background" | "upscale";
    controlnetType: string | null;
}

const inpaintingModels: { [key: string]: boolean } = {
    stable_diffusion_inpainting: true,
    stable_diffusion_2_inpainting: true,
    dreamlike_diffusion_inpainting: true,
    anything_v4_inpainting: true,
};

function stripWeightsFromPrompt(prompt: string): string {
    if (!prompt) {
        return prompt;
    }
    // Use a regular expression to match and remove the weights and parentheses
    const strippedPrompt = prompt.replace(/[:()\d]+(\.\d+)?/g, "");
    return strippedPrompt;
}

function combinePrompts(prompt, negativePrompt) {
    const separator = "###";
    const maxChars = 1000;
    const maxPromptLength = maxChars - separator.length;

    // If there's no negative prompt, simply truncate the prompt and return it.
    if (!negativePrompt) {
        return prompt.substring(0, maxChars);
    }

    let promptLength = prompt.length;
    let negativePromptLength = negativePrompt.length;

    if (promptLength + negativePromptLength <= maxPromptLength) {
        // If the combined length is less than maxPromptLength, no need to truncate
        return `${prompt}${separator}${negativePrompt}`;
    }

    // Determine how many characters to take from each prompt
    let halfLength = Math.floor(maxPromptLength / 2);
    if (promptLength <= halfLength) {
        // If the prompt is shorter than half length, take all of it and truncate the negative prompt
        negativePromptLength = maxPromptLength - promptLength;
    } else if (negativePromptLength <= halfLength) {
        // If the negative prompt is shorter than half length, take all of it and truncate the prompt
        promptLength = maxPromptLength - negativePromptLength;
    } else {
        // If both prompts are longer than half length, truncate both
        promptLength = negativePromptLength = halfLength;
    }

    // Truncate prompts and combine
    prompt = prompt.substring(0, promptLength);
    negativePrompt = negativePrompt.substring(0, negativePromptLength);
    return `${prompt}${separator}${negativePrompt}`;
}

async function processRequest(request: HordeRequest) {
    const metricParams = {
        model: request.model,
        success: true,
    };
    console.log("processing request", request);
    try {
        updateImage(
            request.imageId,
            { status: "processing" },
            request.authToken
        );
        let prompt = await addTrigger(request.prompt, request.model);
        prompt = prompt.trim();
        let negativePrompt = stripWeightsFromPrompt(request.negativePrompt);
        negativePrompt = negativePrompt.trim();
        prompt = combinePrompts(prompt, negativePrompt);
        console.log(prompt);

        const imageExistsPromise = imageExists(
            `${request.imageId}.init_image.png`
        );
        const maskExistsPromise = imageExists(`${request.imageId}.mask.png`);
        const [imageOk, maskOk] = await Promise.all([
            imageExistsPromise,
            maskExistsPromise,
        ]);

        const post_processing: string[] = [];

        let webpImageData: Buffer;

        // TODO: support bg removal as well in this flow
        if (request.augmentation) {
            console.log(
                "augmenting image",
                request.imageId,
                `(${request.augmentation})`
            );
            if (!imageOk) {
                updateImage(
                    request.imageId,
                    {
                        status: "error",
                        error: "no image provided for augmentation",
                    },
                    request.authToken
                );
                return;
            }
            // const payload: AlchemistPayload = {
            //     source_image: `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.image.png`,
            //     forms: [{ name: augmentationToForm[request.augmentation] }],
            // };
            // webpImageData = await processAlchemistImage(payload);
            post_processing.push(augmentationToForm[request.augmentation]);
        }
        // } else {
        // regular old image generation
        const payload: HordeRequestPayload = {
            params: {
                n: 1,
                width: request.width,
                height: request.height,
                steps: 20,
                karras: true,
                sampler_name: "k_euler",
                cfg_scale: request.cfgScale,
                denoising_strength: request.controlnetType
                    ? undefined
                    : request.denoisingStrength,
                // TODO: does this work? Maybe we can use it to handle larger
                // areas of an image in the editor
                hires_fix: false,
                post_processing,
                control_type: request.controlnetType || undefined,
                seed: request.seed || undefined,
            },
            prompt,
            api_key: hordeApiKey,
            nsfw: request.nsfw,
            censor_nsfw: !request.nsfw,
            trusted_workers: false,
            slow_workers: false,
            r2: true,
            models: [request.model],
            source_processing: "img2img",
        };

        if (imageOk) {
            // payload.source_image = imageData.toString("base64");
            payload.source_image = `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.init_image.png`;
        }
        if (maskOk) {
            console.log("mask data found");
            // payload.source_mask = maskData.toString("base64");
            payload.source_mask = `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.mask.png`;
            if (inpaintingModels[request.model]) {
                payload.source_processing = "inpainting";
                payload.params.karras = false;
                payload.params.steps = 50;
            }
        }

        console.log("sending payload", payload);

        webpImageData = await processImage(payload);
        // }

        console.log("received response from stable horde");
        if (!webpImageData) {
            await updateImage(
                request.imageId,
                { status: "error", error: "Image request timed out" },
                request.authToken
            );
            return;
        }

        const upload1 = uploadImage(
            `${request.imageId}.image.png`,
            webpImageData
        );
        const thumbnail = await sharp(Buffer.from(webpImageData))
            .resize(128, 128, {
                fit: "contain",
            })
            .webp()
            .toBuffer();
        const upload2 = uploadImage(
            `${request.imageId}.thumbnail.png`,
            thumbnail
        );
        await Promise.all([upload1, upload2]);
        let nsfw = false;
        if (request.augmentation !== "upscale") {
            nsfw = await processAlchemistImage({
                source_image: `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.image.png`,
                forms: [{ name: "nsfw" }],
            });
            // console.log("nsfw result", nsfw);
        }

        await updateImage(
            request.imageId,
            { status: "completed", nsfw },
            request.authToken
        );
        console.log("completed request");
    } catch (e) {
        metricParams.success = false;
        Bugsnag.notify(e);
        // console.log(e);
        let err = "Image could not be processed";
        if (e.response?.data?.message) {
            err = e.response.data.message;
            console.error(JSON.stringify(e.response.data, null, 2));
        }
        if (e.message && e.message.includes("censored")) {
            err = e.message;
        }
        await updateImage(
            request.imageId,
            { status: "error", error: err },
            request.authToken
        );
    } finally {
        activeImageCount--;
        metricsClient.addMetric(
            "horde.processRequest",
            1,
            "count",
            metricParams
        );
    }
}

async function poll() {
    metricsClient.addMetric("horde.poll", 1, "count", {});
    if (activeImageCount >= 30) {
        console.log("max active image count reached, waiting");
        await sleep(1000);
        return;
    }
    let paidMessages = await sqsClient
        .receiveMessage({
            QueueUrl: paidQueueUrl,
            MaxNumberOfMessages: Math.min(30 - activeImageCount, 10),
            WaitTimeSeconds: 1,
        })
        .promise();
    paidMessages.Messages = paidMessages.Messages || [];
    console.log(
        `received ${
            paidMessages.Messages?.length || 0
        } paid messages from queue`
    );
    if (paidMessages.Messages && paidMessages.Messages.length > 0) {
        activeImageCount += paidMessages.Messages.length;
        for (const message of paidMessages.Messages) {
            processRequest(JSON.parse(message.Body) as HordeRequest);
        }
        await deleteMessages(paidQueueUrl, paidMessages.Messages);
    }

    let freeMessages: PromiseResult<AWS.SQS.ReceiveMessageResult, AWS.AWSError>;
    // if there are less than 30 total messages (active + paid), get some from the free queue
    if (activeImageCount < 30) {
        freeMessages = await sqsClient
            .receiveMessage({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: Math.min(30 - activeImageCount, 10),
                WaitTimeSeconds: 1,
            })
            .promise();
        freeMessages.Messages = freeMessages.Messages || [];
        console.log(
            `received ${
                freeMessages.Messages?.length || 0
            } free messages from queue`
        );
    }

    if (freeMessages?.Messages && freeMessages.Messages.length > 0) {
        activeImageCount += freeMessages.Messages.length;
        for (const message of freeMessages.Messages) {
            processRequest(JSON.parse(message.Body) as HordeRequest);
        }
        await deleteMessages(queueUrl, freeMessages.Messages);
    }
}

async function deleteMessages(queueUrl: string, messages: AWS.SQS.Message[]) {
    await sqsClient
        .deleteMessageBatch({
            QueueUrl: queueUrl,
            Entries: messages.map((m) => ({
                Id: m.MessageId,
                ReceiptHandle: m.ReceiptHandle,
            })),
        })
        .promise();
}

async function main() {
    while (true) {
        await poll();
    }
}

main();
