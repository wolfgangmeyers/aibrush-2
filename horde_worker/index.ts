import * as AWS from "aws-sdk";
import sharp from "sharp";
import Bugsnag from "@bugsnag/js";
import axios from "axios";
import moment from "moment";
import { sleep } from "./sleep";

import { AlchemistPayload, HordeRequestPayload, processAlchemistImage, processImage } from "./horde";

if (process.env.BUGSNAG_API_KEY) {
    Bugsnag.start({
        apiKey: process.env.BUGSNAG_API_KEY,
    });
}

const callbackEndpoint = "https://www.aibrush.art";

interface UpdateImageInput {
    status: string;
    error?: string;
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

// replaced with image url
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

const blacklisted_terms = ["loli"];

const blacklisted_nsfw_terms = [
    "child",
    "teen",
    "girl",
    "boy",
    "young",
    "youth",
    "underage",
    "infant",
    "baby",
    "under 18",
    "daughter",
    "year-old",
    "year old",
];

// refactor to typescript:
function stripBlacklistedTerms(nsfw: boolean, prompt: string): string {
    prompt = prompt.toLocaleLowerCase();
    for (let term of blacklisted_terms) {
        prompt = prompt.replace(term, "");
    }
    if (nsfw) {
        for (let term of blacklisted_nsfw_terms) {
            prompt = prompt.replace(term, "");
        }
    }
    return prompt;
}

const triggers: { [key: string]: string[] } = {
    "GTA5 Artwork Diffusion": ["gtav style"],
    "AIO Pixel Art": ["16bitscene", "pixelsprite"],
    OrbAI: ["orbai"],
    "Ranma Diffusion": ["80sanimestyle"],
    "App Icon Diffusion": ["IconsMi"],
};

const augmentationToForm = {
    "upscale": "RealESRGAN_x4plus",
    "face_restore": "GFPGAN",
    "remove_background": "strip_background"
}

function addTrigger(prompt: string, model: string): string {
    if (triggers[model]) {
        const triggerList = triggers[model];
        for (let trigger of triggerList) {
            if (
                prompt.toLocaleLowerCase().includes(trigger.toLocaleLowerCase())
            ) {
                return prompt;
            }
        }
        return `${triggerList[0]}, ${prompt}`;
    }
    return prompt;
}

interface HordeRequest {
    authToken: string;
    imageId: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
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

async function processRequest(request: HordeRequest) {
    console.log("processing request", request);
    try {
        updateImage(
            request.imageId,
            { status: "processing" },
            request.authToken
        );
        let prompt = addTrigger(request.prompt, request.model);
        const negativePrompt = request.negativePrompt;
        if (negativePrompt.length > 0) {
            prompt = `${prompt} ### ${negativePrompt}`;
        }
        prompt = stripBlacklistedTerms(request.nsfw, prompt);
        console.log(prompt);

        const imageExistsPromise = imageExists(`${request.imageId}.image.png`);
        const maskExistsPromise = imageExists(`${request.imageId}.mask.png`);
        const [imageOk, maskOk] = await Promise.all([
            imageExistsPromise,
            maskExistsPromise,
        ]);

        const post_processing: string[] = [];

        let webpImageData: Buffer;

        // TODO: support bg removal as well in this flow
        if (request.augmentation) {
            console.log("augmenting image", request.imageId, `(${request.augmentation})`);
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
            const payload: AlchemistPayload = {
                source_image: `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.image.png`,
                forms: [{name: augmentationToForm[request.augmentation]}],
            }
            webpImageData = await processAlchemistImage(payload);
        } else {
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
                },
                prompt,
                api_key: hordeApiKey,
                nsfw: request.nsfw,
                censor_nsfw: !request.nsfw,
                trusted_workers: false,
                r2: true,
                models: [request.model],
                source_processing: "img2img",
            };

            if (imageOk) {
                // convert to base64
                console.log("image data found");
                // payload.source_image = imageData.toString("base64");
                payload.source_image = `https://aibrush2-filestore.s3.amazonaws.com/${request.imageId}.image.png`;
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
        }

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
        await updateImage(
            request.imageId,
            { status: "completed" },
            request.authToken
        );
        console.log("completed request");
    } catch (e) {
        Bugsnag.notify(e);
        // console.log(e);
        let err = "Image could not be processed";
        if (e.response?.data?.message) {
            err = e.response.data.message;
            console.error(JSON.stringify(e.response.data, null, 2));
        }
        await updateImage(
            request.imageId,
            { status: "error", error: err },
            request.authToken
        );
    } finally {
        activeImageCount--;
    }
}

async function poll() {
    if (activeImageCount >= 30) {
        console.log("max active image count reached, waiting");
        await sleep(1000);
        return;
    }
    const messages = await sqsClient
        .receiveMessage({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: Math.min(30 - activeImageCount, 10),
            WaitTimeSeconds: 20,
        })
        .promise();
    console.log(
        `received ${messages.Messages?.length || 0} messages from queue`
    );
    if (messages.Messages) {
        activeImageCount += messages.Messages.length;
        for (const message of messages.Messages) {
            processRequest(JSON.parse(message.Body) as HordeRequest);
        }

        await sqsClient
            .deleteMessageBatch({
                QueueUrl: queueUrl,
                Entries: messages.Messages.map((m) => ({
                    Id: m.MessageId,
                    ReceiptHandle: m.ReceiptHandle,
                })),
            })
            .promise();
    }
}

async function main() {
    while (true) {
        await poll();
    }
}

main();
