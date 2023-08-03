export interface Image {
    id: string;
    created_at: number;
    created_by?: string;
    updated_at: number;
    params: ImageParams;
    label?: string;
    parent?: string;
    score?: number;
    negative_score?: number;
    status: StatusEnum;
    model: string;
    nsfw: boolean;
    temporary?: boolean;
    deleted_at?: number;
    error?: string;
    format?: "png" | "webp" | "jpeg";
}

export interface GenerationJob {
    id: string;
    params: ImageParams;
    model: string;
    status: StatusEnum;
    progress: number;
    error?: string;
    images?: LocalImage[];
    created_at: number;
    count: number;
}

export interface CheckResult {
    status: StatusEnum;
    progress: number;
}

export interface GenerationResult {
    imageData: Buffer;
    censored: boolean;
    seed: string;
}

export interface LoraConfig {
    name: string;
    strength: number;
}

export interface ImageParams {
    prompt?: string;
    steps?: number;
    negative_prompt?: string;
    width?: number;
    height?: number;
    denoising_strength?: number;
    cfg_scale?: number;
    seed?: string;
    controlnet_type?: string;
    augmentation?: string;
    loras?: Array<LoraConfig>;
}

export interface GenerateImageInput {
    parent?: string;
    encoded_image?: string;
    encoded_mask?: string;
    model: string;
    params: ImageParams;
    count: number;
    hires_fix: boolean;
}

export interface AugmentImageInput {
    image: {
        imageData?: string;
    };
    augmentation: "face_restore" | "remove_background" | "upscale" | "nsfw";
}

export type StatusEnum = "pending" | "processing" | "completed" | "saved" | "error" | "deleted";

export interface LocalImage extends Image {
    imageData?: string;
    thumbnailData?: string;
}

export interface StableDiffusionModel {
    'name': string;
    'baseline': string;
    'type': string;
    'description': string;
    'tags': Array<string>;
    'showcases': Array<string>;
    'version': string;
    'style': string;
    'nsfw': boolean;
    'download_all': boolean;
    'config': object;
    'available': boolean;
    'inpainting': boolean;
}

export interface User {
    username: string;
    id: number;
    kudos: number;
}
