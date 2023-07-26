import axios from "axios";
import moment from "moment";
import {
    AlchemistPayload,
    HordeClient,
    HordeRequestPayload,
} from "./hordeclient";
import { GenerationJob, LocalImage } from "./models";
import { AugmentImageInput, GenerateImageInput } from "./models";
import * as uuid from "uuid";

const fetchHordeData = async () => {
    const { data } = await axios.get(
        "https://raw.githubusercontent.com/db0/AI-Horde-image-model-reference/main/stable_diffusion.json"
    );
    return data;
};

const hordeStateMap: { [key: string]: string } = {
    waiting: "pending",
    processing: "processing",
    done: "completed",
};

let _triggers: { [key: string]: string[] } | null = null;
let _lastUpdated: moment.Moment | null = null;

async function initTriggers() {
    const data = await fetchHordeData();
    _triggers = {};
    Object.keys(data).forEach((key) => {
        const modelInfo = data[key];
        if (modelInfo.trigger) {
            _triggers![key] = modelInfo.trigger;
        }
    });
}

export async function addTrigger(
    prompt: string,
    model: string
): Promise<string> {
    // check last updated
    if (_lastUpdated === null || moment().diff(_lastUpdated, "minutes") > 60) {
        await initTriggers();
        _lastUpdated = moment();
    }
    if (_triggers![model]) {
        const triggerList = _triggers![model];
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

const augmentationToForm: { [key: string]: string } = {
    upscale: "RealESRGAN_x4plus",
    face_restore: "GFPGAN",
    remove_background: "strip_background",
};

function stripWeightsFromPrompt(prompt: string): string {
    if (!prompt) {
        return prompt;
    }
    // Use a regular expression to match and remove the weights and parentheses
    const strippedPrompt = prompt.replace(/[:()\d]+(\.\d+)?/g, "");
    return strippedPrompt;
}

function combinePrompts(prompt: string, negativePrompt: string): string {
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

export class HordeGenerator {
    constructor(readonly client: HordeClient) {}

    // TODO: pass in onProgress callback
    // onUploadProgress: (progressEvent: any) => {
    //     const percentCompleted =
    //         progressEvent.loaded / progressEvent.total;
    //     setUploadingProgress(percentCompleted);
    // },

    // TODO: optimize with n > 1
    async generateImages(
        input: GenerateImageInput,
        onUploadProgress?: (progressEvent: any) => void
    ): Promise<GenerationJob> {
        let prompt = await addTrigger(input.params.prompt || "", input.model);
        prompt = prompt.trim();
        let negativePrompt = stripWeightsFromPrompt(
            input.params.negative_prompt || ""
        );
        negativePrompt = negativePrompt.trim();
        prompt = combinePrompts(prompt, negativePrompt);
        const promises: Promise<LocalImage | null>[] = [];
        const payload: HordeRequestPayload = {
            params: {
                n: input.count,
                width: input.params.width || 512,
                height: input.params.height || 512,
                steps: input.params.steps || 20,
                karras: true,
                sampler_name: "k_euler",
                cfg_scale: input.params.cfg_scale || 7.5,
                denoising_strength: input.params.denoising_strength || 0.75,
                hires_fix: false,
                post_processing: [],
                control_type: input.params.controlnet_type || undefined,
                seed:
                    input.params.seed || undefined,
                loras:
                    input.params.loras &&
                    input.params.loras.map((lora) => ({
                        name: lora.name,
                        model: lora.strength,
                        clip: lora.strength,
                    })),
            },
            prompt,
            nsfw: true,
            censor_nsfw: false,
            trusted_workers: false,
            slow_workers: false,
            r2: true,
            models: [input.model],
            source_processing: "img2img",
        };
        if (input.encoded_image) {
            payload.source_image = input.encoded_image;
        }
        if (input.encoded_mask) {
            payload.source_mask = input.encoded_mask;
            if (input.model.toLocaleLowerCase().indexOf("inpainting") !== -1) {
                payload.source_processing = "inpainting";
                payload.params.karras = false;
                payload.params.steps = 50;
            }
        }
        const jobId = await this.client.initiateImageGeneration(payload, onUploadProgress);
        if (!jobId) {
            throw new Error("Failed to initiate image generation");
        }
        return {
            id: jobId,
            model: input.model,
            params: input.params,
            status: "pending",
            created_at: moment().valueOf(),
            progress: 0,
            count: input.count,
        };
    }

    // TODO: optional efficient nsfw check
    async checkGenerationJob(job: GenerationJob): Promise<GenerationJob> {
        job = JSON.parse(JSON.stringify(job)) as GenerationJob;
        const checkResult = await this.client.checkImageJob(job.id);
        job.status = checkResult.status;
        job.progress = checkResult.progress;
        if (job.status === "completed") {
            console.log("job is completed")
            job.images = [];
            const results = await this.client.fetchImageResults(job.id);
            console.log("fetch image results", results.length);
            for (const result of results) {
                const image: LocalImage = {
                    id: uuid.v4(),
                    status: result.censored ? "error" : "completed",
                    error: result.censored ? "Image was censored" : undefined,
                    imageData: `data:image/webp;base64,${result.imageData.toString("base64")}`,
                    format: "webp",
                    nsfw: false, // TODO: nsfw check
                    model: job.model,
                    params: {
                        ...job.params,
                        seed: result.seed,
                    },
                    created_at: moment().valueOf(),
                    updated_at: moment().valueOf(),
                };
                job.images.push(image);
            }
        }
        console.log("checkGenerationJob: job status", job.status)
        return job;
    }

    async checkGenerationJobs(jobs: GenerationJob[]): Promise<GenerationJob[]> {
        jobs = JSON.parse(JSON.stringify(jobs)) as GenerationJob[];
        const promises = jobs.map((job) => this.checkGenerationJob(job));
        return Promise.all(promises);
    }

    // TODO: change to not need LocalImage
    async augmentImage(input: AugmentImageInput): Promise<LocalImage> {
        // copy over image and update id to augmentation request
        const image = JSON.parse(JSON.stringify(input.image)) as LocalImage;
        image.status = "pending";
        const payload: AlchemistPayload = {
            forms: [{ name: augmentationToForm[input.augmentation] }],
            source_image: input.image.imageData!,
            slow_workers: false,
            trusted_workers: false,
        };
        console.log("alchemist payload", payload);
        try {
            const id = await this.client.initiateAlchemistImageInterrogation(
                payload
            );
            if (!id) {
                console.error(
                    "Failed to initiate alchemist image interrogation"
                );
                image.status = "error";
                image.error =
                    "Failed to initiate alchemist image interrogation";
                return image;
            }
            image.id = id;
        } catch (e: any) {
            console.error("Failed to augment image", e);
            image.status = "error";
            image.error = e.message;
        }
        return image;
    }

    async checkAugmentation(image: LocalImage): Promise<LocalImage> {
        image = JSON.parse(JSON.stringify(image)) as LocalImage;
        try {
            const status = await this.client.checkInterrogationStatus(image.id);
            image.status = (hordeStateMap[status] || status) as any;
            if (image.status === "completed") {
                const result = await this.client.fetchInterrogationResult(
                    image.id
                );
                if (typeof result === "boolean") {
                    image.nsfw = result;
                } else if (typeof result === "object") {
                    const imageData = result as Buffer;
                    const base64ImageData = imageData.toString("base64");
                    const src = `data:image/webp;base64,${base64ImageData}`;
                    image.imageData = src;
                }
            }
        } catch (e: any) {
            console.error("image failed", e);
            image.status = "error";
            image.error = e.message;
        }
        return image;
    }
}
