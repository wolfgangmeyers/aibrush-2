import axios from "axios";
import { Buffer } from "buffer";
import { CheckResult, GenerationResult, StatusEnum } from "./models";

const baseUrl = "https://stablehorde.net/api";

export interface RequestStatusCheck {
    /** The amount of finished jobs in this request. */
    finished: number;
    processing: number;
    waiting: number;
    restarted: number;
    done: boolean;
    faulted: boolean;
    wait_time: number;
    queue_position: number;
    kudos: number;
    is_possible: boolean;
}

export interface HordeRequestPayload {
    params: {
        n: number;
        width: number;
        height: number;
        steps: number;
        sampler_name: string;
        cfg_scale: number;
        denoising_strength: number;
        karras: boolean;
        hires_fix: boolean;
        post_processing: string[];
        control_type?: string;
        seed?: string;
        loras?: HordeLoraConfig[];
    };
    prompt: string;
    api_key?: string;
    nsfw: boolean;
    censor_nsfw: boolean;
    trusted_workers: boolean;
    slow_workers: boolean;
    r2: boolean;
    models: string[];
    source_processing: string;
    source_image?: string;
    source_mask?: string;
    workers?: string[];
}

export interface HordeLoraConfig {
    name: string;
    model: number;
    clip: number;
    inject_trigger?: string;
}

export interface AlchemistForm {
    name: string;
}

export interface AlchemistPayload {
    source_image: string;
    forms: AlchemistForm[];
    slow_workers: boolean;
    trusted_workers: boolean;
}

export class HordeClient {
    constructor(private apiKey: string) {}

    updateApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }

    // TODO: pass in onProgress callback
    // onUploadProgress: (progressEvent: any) => {
    //     const percentCompleted =
    //         progressEvent.loaded / progressEvent.total;
    //     setUploadingProgress(percentCompleted);
    // },

    async initiateImageGeneration(
        payload: HordeRequestPayload,
        onUploadProgress?: (progressEvent: any) => void
    ): Promise<string | null> {
        payload.api_key = this.apiKey;
        const submitReq = await axios.post(
            `${baseUrl}/v2/generate/async`,
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    apiKey: this.apiKey,
                },
                onUploadProgress,
            }
        );
        const submitResults = submitReq.data;
        const reqId = submitResults.id;

        return reqId;
    }

    async checkImageJob(reqId: string): Promise<CheckResult> {
        const chkReq = await axios.get(
            `${baseUrl}/v2/generate/check/${reqId}`,
            {
                headers: {
                    apiKey: this.apiKey,
                },
            }
        );
        const chkResults = (await chkReq.data) as RequestStatusCheck;
        console.log(JSON.stringify(chkResults));
        const total =
            chkResults.waiting +
            chkResults.processing +
            chkResults.restarted +
            chkResults.finished;
        let status: string;
        if (chkResults.processing > 0) {
            status = "processing";
        } else if (chkResults.done) {
            status = "completed";
        } else {
            status = "pending";
        }

        const progress = chkResults.finished / total;
        return {
            status: status as StatusEnum,
            progress,
        };
    }

    // TODO: optimization - optional NSFW check
    async fetchImageResults(reqId: string): Promise<GenerationResult[]> {
        const retrieveReq = await axios.get(
            `${baseUrl}/v2/generate/status/${reqId}`,
            {
                headers: {
                    apiKey: this.apiKey,
                },
            }
        );
        const resultsJson = await retrieveReq.data;
        if (resultsJson.faulted) {
            throw new Error("Something went wrong when generating the request");
        }
        const promises: Promise<GenerationResult>[] =
            resultsJson.generations.map(async (result: any) => {
                if (result.censored) {
                    return {
                        censored: true,
                    };
                }
                const webpImageResponse = await axios.get(result.img, {
                    responseType: "arraybuffer",
                });
                return {
                    imageData: Buffer.from(webpImageResponse.data),
                    censored: false,
                    seed: result.seed,
                };
            });
        return Promise.all(promises);
    }

    async deleteImageRequest(reqId: string): Promise<void> {
        await axios.delete(`${baseUrl}/v2/generate/status/${reqId}`, {
            headers: {
                apiKey: this.apiKey,
            },
        });
        console.log(`Request with ID: ${reqId} has been deleted.`);
    }

    async initiateAlchemistImageInterrogation(
        payload: AlchemistPayload
    ): Promise<string> {
        const submitReq = await axios.post(
            `${baseUrl}/v2/interrogate/async`,
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    apiKey: this.apiKey,
                },
            }
        );
        const submitResults = submitReq.data;
        const reqId = submitResults.id;

        return reqId;
    }

    async checkInterrogationStatus(reqId: string): Promise<string> {
        const retrieveReq = await axios.get(
            `${baseUrl}/v2/interrogate/status/${reqId}`,
            {
                headers: {
                    apiKey: this.apiKey,
                },
            }
        );
        const resultsJson = await retrieveReq.data;
        console.log(JSON.stringify(resultsJson));

        return resultsJson.state;
    }

    async fetchInterrogationResult(reqId: string): Promise<any> {
        const retrieveReq = await axios.get(
            `${baseUrl}/v2/interrogate/status/${reqId}`,
            {
                headers: {
                    apiKey: this.apiKey,
                },
            }
        );
        const resultsJson = await retrieveReq.data;
        console.log("alchemy results: " + JSON.stringify(resultsJson));
        if (resultsJson.forms[0].result.nsfw !== undefined) {
            return resultsJson.forms[0].result.nsfw;
        }
        const webpImageResponse = await axios.get(
            resultsJson.forms[0].result[resultsJson.forms[0].form],
            {
                responseType: "arraybuffer",
            }
        );
        return Buffer.from(webpImageResponse.data);
    }

    async deleteInterrogationRequest(reqId: string): Promise<void> {
        await axios.delete(`${baseUrl}/v2/interrogate/status/${reqId}`, {
            headers: {
                apiKey: this.apiKey,
            },
        });
        console.log(`Request with ID: ${reqId} has been deleted.`);
    }
}
