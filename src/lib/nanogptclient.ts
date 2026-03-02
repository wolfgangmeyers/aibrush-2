export const NANOGPT_BASE_URL = 'https://nano-gpt.com/api/v1';

export interface NanoGPTImageRequest {
    model: string;
    prompt: string;
    n?: number;
    size?: string;
    response_format?: 'b64_json' | 'url';
    guidance_scale?: number;
    num_inference_steps?: number;
    seed?: number;
    imageDataUrl?: string;    // full data URL for base image (img2img)
    maskDataUrl?: string;     // full data URL for inpainting mask
    strength?: number;        // denoising strength 0.0–1.0
}

export interface NanoGPTImageData {
    b64_json?: string;
    url?: string;
}

export interface NanoGPTImageResponse {
    created: number;
    data: NanoGPTImageData[];
    cost: number;
    paymentSource: string;
    remainingBalance: number;
}

export interface NanoGPTModel {
    id: string;
    name?: string;
    description?: string;
    pricing?: {
        per_image?: Record<string, number>;
        currency?: string;
    };
    capabilities?: {
        image_generation?: boolean;
        image_to_image?: boolean;
        inpainting?: boolean;
        nsfw?: boolean;
    };
}

export interface NanoGPTCapabilities {
    image_to_image: boolean;
    inpainting: boolean;
    nsfw: boolean;
}

export interface NanoGPTDisplayModel {
    /** Model ID used in API calls (e.g. "hidream") */
    name: string;
    /** Short human-readable label (e.g. "FLUX.2 [max]") */
    displayName?: string;
    description: string;
    featured: boolean;
    pricePerImage?: number;
    capabilities?: NanoGPTCapabilities;
}

/** Extract a single representative price from a model's per_image pricing map. */
export function extractPricePerImage(pricing: NanoGPTModel['pricing']): number | undefined {
    const p = pricing?.per_image;
    if (!p) return undefined;
    return p['auto'] ?? p['1024x1024'] ?? p['1024*1024'] ?? p['1:1'] ?? Object.values(p)[0];
}

/**
 * Model IDs documented by NanoGPT as supporting image-to-image generation.
 * Source: https://docs.nano-gpt.com/api-reference/image-generation
 * Use this allowlist instead of the unreliable `image_to_image` capability flag.
 */
export const NANOGPT_IMG2IMG_MODELS: ReadonlySet<string> = new Set([
    // Single-image input models
    'flux-dev-image-to-image',
    'ghiblify',
    'gemini-flash-edit',
    'hidream-edit',
    'bagel',
    'SDXL-ArliMix-v1',
    'Upscaler',
    // Multi-image input models (also accept imageDataUrl)
    'flux-kontext',
    'flux-kontext/dev',
    'gpt-4o-image',
    'gpt-image-1',
]);

export const NANOGPT_FEATURED_MODELS: NanoGPTDisplayModel[] = [
    { name: 'flux-2-max', description: 'FLUX.2 [max] — Production flagship model', featured: true },
    { name: 'flux-2-turbo', description: 'FLUX.2 [turbo] — Fast, speed-optimised generation', featured: true },
    { name: 'hidream', description: 'HiDream — High quality image generation', featured: true },
    { name: 'flux-pro', description: 'FLUX Pro — Premium quality ($0.04–0.05/image)', featured: true },
    { name: 'gpt-image-1.5', description: "OpenAI's latest image model via NanoGPT", featured: true },
];

export class NanoGPTClient {
    constructor(private apiKey: string) {}

    async generateImage(request: NanoGPTImageRequest): Promise<NanoGPTImageResponse> {
        let response: Response;
        try {
            response = await fetch(`${NANOGPT_BASE_URL}/images/generations`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });
        } catch (e: any) {
            throw new Error(
                'NanoGPT request failed. Check your network connection. ' +
                '(If this is a CORS error, the NanoGPT API may not allow browser calls from this origin.)'
            );
        }

        if (!response.ok) {
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                throw new Error(
                    `Rate limit exceeded.${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`
                );
            }
            let errMsg = `NanoGPT API error: ${response.status}`;
            try {
                const data = await response.json();
                errMsg = data?.error?.message || errMsg;
            } catch {}
            throw new Error(errMsg);
        }

        return response.json();
    }

    async listImageModels(): Promise<NanoGPTModel[]> {
        let response: Response;
        try {
            response = await fetch(`${NANOGPT_BASE_URL}/image-models?detailed=true`, {
                headers: { Authorization: `Bearer ${this.apiKey}` },
            });
        } catch (e: any) {
            throw new Error('Failed to fetch NanoGPT models: network error.');
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch NanoGPT models: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.data)) return data.data;
        return Object.entries(data)
            .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
            .map(([id, model]: [string, any]) => ({ ...model, id }));
    }
}
