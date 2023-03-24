import axios from "axios";
import moment from "moment";

const hordeApiKey = process.env.STABLE_HORDE_API_KEY;
const hordeBaseUrl =
    process.env.STABLE_HORDE_URL || "https://stablehorde.net/api";
const altHordeApiKey = process.env.ALTERNATE_HORDE_API_KEY;
const altHordeBaseUrl =
    process.env.ALTERNATE_HORDE_URL || "https://aibrush.ngrok.io/api";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    };
    prompt: string;
    api_key: string;
    nsfw: boolean;
    censor_nsfw: boolean;
    trusted_workers: boolean;
    r2: boolean;
    models: string[];
    source_processing: string;
    source_image?: string;
    source_mask?: string;
    workers?: string[];
}

export interface AlchemistForm {
    name: string;
}

export interface AlchemistPayload {
    source_image: string;
    forms: AlchemistForm[];
}

export interface AlchemistResult {

}

const altModels = {
    "Epic Diffusion Inpainting": true,
};

export async function processImage(
    payload: HordeRequestPayload
): Promise<Buffer> {
    const model = payload.models[0];
    const baseUrl = altModels[model] ? altHordeBaseUrl : hordeBaseUrl;
    const apiKey = altModels[model] ? altHordeApiKey : hordeApiKey;
    const submitReq = await axios.post(
        `${baseUrl}/v2/generate/async`,
        payload,
        {
            headers: {
                "Content-Type": "application/json",
                apiKey: apiKey,
            },
        }
    );
    // poll for status and retrieve image
    const submitResults = submitReq.data;
    const reqId = submitResults.id;
    let isDone = false;
    let retry = 0;
    const start = moment();
    while (!isDone) {
        try {
            const chkReq = await axios.get(
                `${baseUrl}/v2/generate/check/${reqId}`,
                {
                    headers: {
                        apiKey: apiKey,
                    },
                }
            );
            const chkResults = await chkReq.data;
            console.log(JSON.stringify(chkResults));
            isDone = chkResults.done;
            await sleep(800);
            if (moment().diff(start, "seconds") > 110) {
                console.log("Horde request timed out");
                await axios.delete(`${baseUrl}/v2/generate/status/${reqId}`, {
                    headers: {
                        apiKey: apiKey,
                    },
                });
                return null;
            }
        } catch (e) {
            retry += 1;
            console.log(`Error ${e} when retrieving status. Retry ${retry}/10`);
            if (retry < 10) {
                await sleep(1000);
                continue;
            }
            throw e;
        }
    }
    const retrieveReq = await axios.get(
        `${baseUrl}/v2/generate/status/${reqId}`,
        {
            headers: {
                apiKey: apiKey,
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
    console.log("Request completed by worker " + result.worker_id);
    const webpImageResponse = await axios.get(result.img, {
        responseType: "arraybuffer",
    });
    return webpImageResponse.data;
}

export async function processAlchemistImage(
    payload: AlchemistPayload
): Promise<any> {
    const submitReq = await axios.post(
        `${hordeBaseUrl}/v2/interrogate/async`,
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
    const start = moment();
    while (!isDone) {
        try {
            const retrieveReq = await axios.get(
                `${hordeBaseUrl}/v2/interrogate/status/${reqId}`,
                {
                    headers: {
                        apiKey: hordeApiKey,
                    },
                }
            );
            const resultsJson = await retrieveReq.data;
            console.log(JSON.stringify(resultsJson));
            if (resultsJson.state === "done") {
                isDone = true;
                if (payload.forms[0].name == "nsfw") {
                    return resultsJson.forms[0].result.nsfw;
                }
                const webpImageResponse = await axios.get(resultsJson.forms[0].result[resultsJson.forms[0].form], {
                    responseType: "arraybuffer",
                });
                return webpImageResponse.data;
            } else {
                if (moment().diff(start, "seconds") > 110) {
                    console.log("Horde request timed out");
                    await axios.delete(`${hordeBaseUrl}/v2/interrogate/status/${reqId}`, {
                        headers: {
                            apiKey: hordeApiKey,
                        },
                    });
                    return null;
                }
                await sleep(1000);
            }
        } catch (e) {
            retry += 1;
            console.log(`Error ${e} when retrieving status. Retry ${retry}/10`);
            if (retry < 10) {
                await sleep(1000);
                continue;
            }
            throw e;
        }
    }
    return null;
}
