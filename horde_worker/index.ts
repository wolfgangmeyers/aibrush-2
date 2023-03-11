import { SQSEvent } from "aws-lambda";
import * as AWS from "aws-sdk";
import sharp from "sharp";
import Bugsnag from "@bugsnag/js";
import axios from "axios";

import { HordeRequestPayload, processImage } from "./horde";

if (process.env.BUGSNAG_API_KEY) {
    Bugsnag.start({
        apiKey: process.env.BUGSNAG_API_KEY,
    });
}

const callbackEndpoint = process.env.CALLBACK_ENDPOINT || "https://aibrush.ngrok.io";

async function updateImage(imageId: string, status: string, authToken: string) {
    const url = `${callbackEndpoint}/api/images/${imageId}`;
    await axios.patch(url, {
        status,
    }, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
    });
}

const s3Client = new AWS.S3({
    region: "us-west-2",
});

async function downloadImage(key: string): Promise<Buffer> {
    // return null if object doesn't exist
    try {
        const data = await s3Client
            .getObject({
                Bucket: "aibrush2-filestore",
                Key: key,
            })
            .promise();
        const imageData = data.Body as Buffer;
        // load with sharp
        const image = sharp(imageData);
        // convert to webp and return buffer
        const webp = await image.webp().toBuffer();
        return webp;
    } catch (e) {
        return null;
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

const triggers = {
    "GTA5 Artwork Diffusion": "gtav style",
};

function addTrigger(prompt: string, model: string): string {
    if (triggers[model]) {
        const trigger = triggers[model];
        if (!prompt.toLocaleLowerCase().includes(trigger.toLocaleLowerCase())) {
            return `${trigger}, ${prompt}`;
        }
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
    upscale: boolean;
}

async function processRequest(request: HordeRequest) {
    try {
        updateImage(request.imageId, "processing", request.authToken);
        let prompt = addTrigger(request.prompt, request.model);
        const negativePrompt = request.negativePrompt;
        if (negativePrompt.length > 0) {
            prompt = `${prompt} ### ${negativePrompt}`;
        }
        prompt = stripBlacklistedTerms(request.nsfw, prompt);
        console.log(prompt);
        const post_processing: string[] = [];
        if (request.upscale) {
            post_processing.push("RealESRGAN_x4plus");
        }
        const payload: HordeRequestPayload = {
            params: {
                n: 1,
                width: request.width,
                height: request.height,
                steps: 20,
                karras: true,
                sampler_name: "k_euler",
                cfg_scale: request.cfgScale,
                denoising_strength: request.denoisingStrength,
                // TODO: does this work? Maybe we can use it to handle larger
                // areas of an image in the editor
                hires_fix: false,
                post_processing,
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
        const imageDataPromise = downloadImage(`${request.imageId}.image.png`);
        const maskDataPromise = downloadImage(`${request.imageId}.mask.png`);
        const [imageData, maskData] = await Promise.all([
            imageDataPromise,
            maskDataPromise,
        ]);
        if (imageData) {
            // convert to base64
            payload.source_image = imageData.toString("base64");
        }
        if (maskData) {
            payload.source_mask = maskData.toString("base64");
            if (request.model == "stable_diffusion_inpainting") {
                payload.source_processing = "inpainting";
            }
        }

        const webpImageData = await processImage(payload);
        if (!webpImageData) {
            await updateImage(request.imageId, "error", request.authToken);
            return;
        }

        const upload1 = uploadImage(`${request.imageId}.image.png`, webpImageData);
        const thumbnail = await sharp(Buffer.from(webpImageData)).resize(128, 128, {
            fit: "contain",
        }).webp().toBuffer();
        const upload2 = uploadImage(`${request.imageId}.thumbnail.png`, thumbnail);
        await Promise.all([upload1, upload2]);
        await updateImage(request.imageId, "completed", request.authToken);
    } catch (e) {
        Bugsnag.notify(e);
        console.log(e);
        await updateImage(request.imageId, "error", request.authToken);
    }
}

export const handler = async (event: SQSEvent) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        await processRequest(JSON.parse(record.body) as HordeRequest);
    }
};
