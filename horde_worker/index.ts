import { SQSEvent } from "aws-lambda";
import * as AWS from "aws-sdk";
import sharp from "sharp";
import Bugsnag from "@bugsnag/js";
import axios from "axios";

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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
}

async function processImage(request: HordeRequest) {
    try {
        updateImage(request.imageId, "processing", request.authToken);
        let prompt = addTrigger(request.prompt, request.model);
        const negativePrompt = request.negativePrompt;
        if (negativePrompt.length > 0) {
            prompt = `${prompt} ### ${negativePrompt}`;
        }
        prompt = stripBlacklistedTerms(request.nsfw, prompt);
        console.log(prompt);
        const payload: any = {
            params: {
                n: 1,
                width: request.width,
                height: request.height,
                steps: request.steps,
                sampler_name: "k_euler",
                cfg_scale: request.cfgScale,
                denoising_strength: request.denoisingStrength,
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
            payload.source_processing = "inpainting";
        }
        const submitReq = await axios.post(
            "https://stablehorde.net/api/v2/generate/async",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    apiKey: hordeApiKey,
                },
            }
        );
        // poll for status and retrieve image
        const submitResults = submitReq.data;
        const reqId = submitResults.id;
        let isDone = false;
        let retry = 0;
        while (!isDone) {
            try {
                const chkReq = await axios.get(
                    `https://stablehorde.net/api/v2/generate/check/${reqId}`,
                    {
                        headers: {
                            apiKey: hordeApiKey,
                        },
                    }
                );
                const chkResults = await chkReq.data;
                console.log(chkResults);
                isDone = chkResults.done;
                await sleep(800);
            } catch (e) {
                retry += 1;
                console.log(
                    `Error ${e} when retrieving status. Retry ${retry}/10`
                );
                if (retry < 10) {
                    await sleep(1000);
                    continue;
                }
                Bugsnag.notify(e);
                return null;
            }
        }
        const retrieveReq = await axios.get(
            `https://stablehorde.net/api/v2/generate/status/${reqId}`,
            {
                headers: {
                    apiKey: hordeApiKey,
                },
            }
        );
        const resultsJson = await retrieveReq.data;
        if (resultsJson.faulted) {
            console.log(
                "Something went wrong when generating the request. Please contact the horde administrator with your request details:",
                payload
            );
            return null;
        }
        const result = resultsJson.generations[0];
        const webpImageResponse = await axios.get(result.img, {
            responseType: "arraybuffer",
        });
        const webpImageData = webpImageResponse.data;
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
        await processImage(JSON.parse(record.body) as HordeRequest);
    }
};
