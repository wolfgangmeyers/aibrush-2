// To parse this data:
//
//   import { Convert, CivitLoras } from "./file";
//
//   const civitLoras = Convert.toCivitLoras(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface CivitLoras {
    items:    Item[];
    metadata: CivitLorasMetadata;
}

export interface Item {
    id:                    number;
    name:                  string;
    description:           string;
    type:                  ItemType;
    poi:                   boolean;
    nsfw:                  boolean;
    allowNoCredit:         boolean;
    allowCommercialUse:    AllowCommercialUse;
    allowDerivatives:      boolean;
    allowDifferentLicense: boolean;
    stats:                 ItemStats;
    creator:               Creator;
    tags:                  string[];
    modelVersions:         ModelVersion[];
}

export enum AllowCommercialUse {
    Image = "Image",
    None = "None",
    Rent = "Rent",
    Sell = "Sell",
}

export interface Creator {
    username: string;
    image:    string;
}

export interface ModelVersion {
    id:                   number;
    modelId:              number;
    name:                 string;
    createdAt:            Date;
    updatedAt:            Date;
    trainedWords:         string[];
    baseModel:            BaseModel;
    earlyAccessTimeFrame: number;
    description:          null | string;
    stats:                ModelVersionStats;
    files:                File[];
    images:               Image[];
    downloadUrl:          string;
}

export enum BaseModel {
    Other = "Other",
    SD15 = "SD 1.5",
    SD21768 = "SD 2.1 768",
}

export interface File {
    name:              string;
    id:                number;
    sizeKB:            number;
    type:              FileType;
    metadata:          FileMetadata;
    pickleScanResult:  ScanResult;
    pickleScanMessage: PickleScanMessage;
    virusScanResult:   ScanResult;
    scannedAt:         Date;
    hashes:            FileHashes;
    downloadUrl:       string;
    primary:           boolean;
}

export interface FileHashes {
    AutoV1: string;
    AutoV2: string;
    SHA256: string;
    CRC32:  string;
    BLAKE3: string;
}

export interface FileMetadata {
    fp:     null | string;
    size:   null | string;
    format: Format;
}

export enum Format {
    SafeTensor = "SafeTensor",
}

export enum PickleScanMessage {
    NoPickleImports = "No Pickle imports",
}

export enum ScanResult {
    Success = "Success",
}

export enum FileType {
    Model = "Model",
}

export interface Image {
    id:     number;
    url:    string;
    nsfw:   AllowCommercialUse;
    width:  number;
    height: number;
    hash:   string;
    meta:   Meta | null;
}

export interface Meta {
    Size:                               string;
    seed:                               number;
    Model:                              string;
    model?:                             string;
    steps:                              number;
    hashes?:                            MetaHashes;
    prompt:                             string;
    weight?:                            string;
    sampler:                            Sampler;
    cfgScale:                           number;
    "Clip skip"?:                       string;
    resources:                          Resource[];
    "Model hash":                       string;
    "resize mode"?:                     string;
    "control mode"?:                    string;
    "\"preprocessor"?:                  string;
    "pixel perfect"?:                   ADetailerInpaintFull;
    "ADetailer conf"?:                  string;
    negativePrompt:                     string;
    "ADetailer model"?:                 string;
    "starting/ending"?:                 string;
    "Face restoration"?:                string;
    "Noise multiplier"?:                string;
    "ADetailer version"?:               string;
    "handsome-squidward"?:              string;
    "ADetailer mask blur"?:             string;
    "preprocessor params"?:             string;
    "ADetailer dilate/erode"?:          string;
    "ADetailer inpaint full"?:          ADetailerInpaintFull;
    "ADetailer inpaint padding"?:       string;
    "ADetailer negative prompt"?:       string;
    "ADetailer ControlNet model"?:      string;
    "ADetailer ControlNet weight"?:     string;
    "ADetailer denoising strength"?:    string;
    "Gross-Up-Merge"?:                  string;
    "ADetailer prompt"?:                string;
    "Hires upscale"?:                   string;
    "Hires upscaler"?:                  string;
    "Denoising strength"?:              string;
    "DDetailer cfg"?:                   string;
    "DDetailer conf a"?:                string;
    "DDetailer conf b"?:                string;
    "DDetailer prompt"?:                string;
    "DDetailer bitwise"?:               AllowCommercialUse;
    "DDetailer model a"?:               string;
    "DDetailer model b"?:               AllowCommercialUse;
    "DDetailer denoising"?:             string;
    "DDetailer mask blur"?:             string;
    "DDetailer dilation a"?:            string;
    "DDetailer dilation b"?:            string;
    "DDetailer neg prompt"?:            string;
    "DDetailer offset x a"?:            string;
    "DDetailer offset x b"?:            string;
    "DDetailer offset y a"?:            string;
    "DDetailer offset y b"?:            string;
    "DDetailer inpaint full"?:          ADetailerInpaintFull;
    "DDetailer preprocess b"?:          string;
    "DDetailer inpaint padding"?:       string;
    "Hires steps"?:                     string;
    "AddNet Enabled"?:                  ADetailerInpaintFull;
    "AddNet Model 1"?:                  string;
    "AddNet Module 1"?:                 AddNetModule;
    "AddNet Weight A 1"?:               string;
    "AddNet Weight B 1"?:               string;
    "Mask blur"?:                       string;
    "Ultimate SD upscale padding"?:     string;
    "Ultimate SD upscale upscaler"?:    TiledDiffusionUpscalerEnum;
    "Ultimate SD upscale mask_blur"?:   string;
    "Ultimate SD upscale tile_width"?:  string;
    "Ultimate SD upscale tile_height"?: string;
    Version?:                           string;
    "AddNet Model 2"?:                  string;
    "AddNet Module 2"?:                 AddNetModule;
    "AddNet Weight A 2"?:               string;
    "AddNet Weight B 2"?:               string;
    Eta?:                               string;
    ENSD?:                              string;
    "'Overlap'"?:                       string;
    "\"{'Method'"?:                     Method;
    "'Upscaler'"?:                      Upscaler;
    "'Scale factor'"?:                  string;
    "'Keep input size'"?:               KeepInputSize;
    "'Tile batch size'"?:               string;
    "'Latent tile width'"?:             string;
    "'Latent tile height'"?:            string;
    "Tiled Diffusion upscaler"?:        TiledDiffusionUpscalerEnum;
    "Tiled Diffusion scale factor"?:    string;
    "ControlNet Model"?:                string;
    "ControlNet Module"?:               string;
    "ControlNet Weight"?:               string;
    "ControlNet Enabled"?:              ADetailerInpaintFull;
    "ControlNet Guidance End"?:         string;
    "ControlNet Guidance Start"?:       string;
}

export enum Method {
    MultiDiffusion = "'MultiDiffusion'",
}

export enum KeepInputSize {
    True = "True}\"",
}

export enum Upscaler {
    RESRGAN4X = "'R-ESRGAN 4x+'",
    SwinIR4X = "'SwinIR 4x'",
}

export enum ADetailerInpaintFull {
    True = "True",
}

export enum AddNetModule {
    LoRA = "LoRA",
}

export enum TiledDiffusionUpscalerEnum {
    RESRGAN4X = "R-ESRGAN 4x+",
    SwinIR4X = "SwinIR 4x",
}

export interface MetaHashes {
    model: string;
}

export interface Resource {
    hash?:   string;
    name:    string;
    type:    ResourceType;
    weight?: number | null;
}

export enum ResourceType {
    Lora = "lora",
    Model = "model",
}

export enum Sampler {
    DPM2MKarras = "DPM++ 2M Karras",
    DPMSDEKarras = "DPM++ SDE Karras",
    EulerA = "Euler a",
}

export interface ModelVersionStats {
    downloadCount: number;
    ratingCount:   number;
    rating:        number;
}

export interface ItemStats {
    downloadCount: number;
    favoriteCount: number;
    commentCount:  number;
    ratingCount:   number;
    rating:        number;
}

export enum ItemType {
    Lora = "LORA",
}

export interface CivitLorasMetadata {
    totalItems:  number;
    currentPage: number;
    pageSize:    number;
    totalPages:  number;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toCivitLoras(json: string): CivitLoras {
        return cast(JSON.parse(json), r("CivitLoras"));
    }

    public static civitLorasToJson(value: CivitLoras): string {
        return JSON.stringify(uncast(value, r("CivitLoras")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "CivitLoras": o([
        { json: "items", js: "items", typ: a(r("Item")) },
        { json: "metadata", js: "metadata", typ: r("CivitLorasMetadata") },
    ], false),
    "Item": o([
        { json: "id", js: "id", typ: 0 },
        { json: "name", js: "name", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "type", js: "type", typ: r("ItemType") },
        { json: "poi", js: "poi", typ: true },
        { json: "nsfw", js: "nsfw", typ: true },
        { json: "allowNoCredit", js: "allowNoCredit", typ: true },
        { json: "allowCommercialUse", js: "allowCommercialUse", typ: r("AllowCommercialUse") },
        { json: "allowDerivatives", js: "allowDerivatives", typ: true },
        { json: "allowDifferentLicense", js: "allowDifferentLicense", typ: true },
        { json: "stats", js: "stats", typ: r("ItemStats") },
        { json: "creator", js: "creator", typ: r("Creator") },
        { json: "tags", js: "tags", typ: a("") },
        { json: "modelVersions", js: "modelVersions", typ: a(r("ModelVersion")) },
    ], false),
    "Creator": o([
        { json: "username", js: "username", typ: "" },
        { json: "image", js: "image", typ: "" },
    ], false),
    "ModelVersion": o([
        { json: "id", js: "id", typ: 0 },
        { json: "modelId", js: "modelId", typ: 0 },
        { json: "name", js: "name", typ: "" },
        { json: "createdAt", js: "createdAt", typ: Date },
        { json: "updatedAt", js: "updatedAt", typ: Date },
        { json: "trainedWords", js: "trainedWords", typ: a("") },
        { json: "baseModel", js: "baseModel", typ: r("BaseModel") },
        { json: "earlyAccessTimeFrame", js: "earlyAccessTimeFrame", typ: 0 },
        { json: "description", js: "description", typ: u(null, "") },
        { json: "stats", js: "stats", typ: r("ModelVersionStats") },
        { json: "files", js: "files", typ: a(r("File")) },
        { json: "images", js: "images", typ: a(r("Image")) },
        { json: "downloadUrl", js: "downloadUrl", typ: "" },
    ], false),
    "File": o([
        { json: "name", js: "name", typ: "" },
        { json: "id", js: "id", typ: 0 },
        { json: "sizeKB", js: "sizeKB", typ: 3.14 },
        { json: "type", js: "type", typ: r("FileType") },
        { json: "metadata", js: "metadata", typ: r("FileMetadata") },
        { json: "pickleScanResult", js: "pickleScanResult", typ: r("ScanResult") },
        { json: "pickleScanMessage", js: "pickleScanMessage", typ: r("PickleScanMessage") },
        { json: "virusScanResult", js: "virusScanResult", typ: r("ScanResult") },
        { json: "scannedAt", js: "scannedAt", typ: Date },
        { json: "hashes", js: "hashes", typ: r("FileHashes") },
        { json: "downloadUrl", js: "downloadUrl", typ: "" },
        { json: "primary", js: "primary", typ: true },
    ], false),
    "FileHashes": o([
        { json: "AutoV1", js: "AutoV1", typ: "" },
        { json: "AutoV2", js: "AutoV2", typ: "" },
        { json: "SHA256", js: "SHA256", typ: "" },
        { json: "CRC32", js: "CRC32", typ: "" },
        { json: "BLAKE3", js: "BLAKE3", typ: "" },
    ], false),
    "FileMetadata": o([
        { json: "fp", js: "fp", typ: u(null, "") },
        { json: "size", js: "size", typ: u(null, "") },
        { json: "format", js: "format", typ: r("Format") },
    ], false),
    "Image": o([
        { json: "id", js: "id", typ: 0 },
        { json: "url", js: "url", typ: "" },
        { json: "nsfw", js: "nsfw", typ: r("AllowCommercialUse") },
        { json: "width", js: "width", typ: 0 },
        { json: "height", js: "height", typ: 0 },
        { json: "hash", js: "hash", typ: "" },
        { json: "meta", js: "meta", typ: u(r("Meta"), null) },
    ], false),
    "Meta": o([
        { json: "Size", js: "Size", typ: "" },
        { json: "seed", js: "seed", typ: 0 },
        { json: "Model", js: "Model", typ: "" },
        { json: "model", js: "model", typ: u(undefined, "") },
        { json: "steps", js: "steps", typ: 0 },
        { json: "hashes", js: "hashes", typ: u(undefined, r("MetaHashes")) },
        { json: "prompt", js: "prompt", typ: "" },
        { json: "weight", js: "weight", typ: u(undefined, "") },
        { json: "sampler", js: "sampler", typ: r("Sampler") },
        { json: "cfgScale", js: "cfgScale", typ: 3.14 },
        { json: "Clip skip", js: "Clip skip", typ: u(undefined, "") },
        { json: "resources", js: "resources", typ: a(r("Resource")) },
        { json: "Model hash", js: "Model hash", typ: "" },
        { json: "resize mode", js: "resize mode", typ: u(undefined, "") },
        { json: "control mode", js: "control mode", typ: u(undefined, "") },
        { json: "\"preprocessor", js: "\"preprocessor", typ: u(undefined, "") },
        { json: "pixel perfect", js: "pixel perfect", typ: u(undefined, r("ADetailerInpaintFull")) },
        { json: "ADetailer conf", js: "ADetailer conf", typ: u(undefined, "") },
        { json: "negativePrompt", js: "negativePrompt", typ: "" },
        { json: "ADetailer model", js: "ADetailer model", typ: u(undefined, "") },
        { json: "starting/ending", js: "starting/ending", typ: u(undefined, "") },
        { json: "Face restoration", js: "Face restoration", typ: u(undefined, "") },
        { json: "Noise multiplier", js: "Noise multiplier", typ: u(undefined, "") },
        { json: "ADetailer version", js: "ADetailer version", typ: u(undefined, "") },
        { json: "handsome-squidward", js: "handsome-squidward", typ: u(undefined, "") },
        { json: "ADetailer mask blur", js: "ADetailer mask blur", typ: u(undefined, "") },
        { json: "preprocessor params", js: "preprocessor params", typ: u(undefined, "") },
        { json: "ADetailer dilate/erode", js: "ADetailer dilate/erode", typ: u(undefined, "") },
        { json: "ADetailer inpaint full", js: "ADetailer inpaint full", typ: u(undefined, r("ADetailerInpaintFull")) },
        { json: "ADetailer inpaint padding", js: "ADetailer inpaint padding", typ: u(undefined, "") },
        { json: "ADetailer negative prompt", js: "ADetailer negative prompt", typ: u(undefined, "") },
        { json: "ADetailer ControlNet model", js: "ADetailer ControlNet model", typ: u(undefined, "") },
        { json: "ADetailer ControlNet weight", js: "ADetailer ControlNet weight", typ: u(undefined, "") },
        { json: "ADetailer denoising strength", js: "ADetailer denoising strength", typ: u(undefined, "") },
        { json: "Gross-Up-Merge", js: "Gross-Up-Merge", typ: u(undefined, "") },
        { json: "ADetailer prompt", js: "ADetailer prompt", typ: u(undefined, "") },
        { json: "Hires upscale", js: "Hires upscale", typ: u(undefined, "") },
        { json: "Hires upscaler", js: "Hires upscaler", typ: u(undefined, "") },
        { json: "Denoising strength", js: "Denoising strength", typ: u(undefined, "") },
        { json: "DDetailer cfg", js: "DDetailer cfg", typ: u(undefined, "") },
        { json: "DDetailer conf a", js: "DDetailer conf a", typ: u(undefined, "") },
        { json: "DDetailer conf b", js: "DDetailer conf b", typ: u(undefined, "") },
        { json: "DDetailer prompt", js: "DDetailer prompt", typ: u(undefined, "") },
        { json: "DDetailer bitwise", js: "DDetailer bitwise", typ: u(undefined, r("AllowCommercialUse")) },
        { json: "DDetailer model a", js: "DDetailer model a", typ: u(undefined, "") },
        { json: "DDetailer model b", js: "DDetailer model b", typ: u(undefined, r("AllowCommercialUse")) },
        { json: "DDetailer denoising", js: "DDetailer denoising", typ: u(undefined, "") },
        { json: "DDetailer mask blur", js: "DDetailer mask blur", typ: u(undefined, "") },
        { json: "DDetailer dilation a", js: "DDetailer dilation a", typ: u(undefined, "") },
        { json: "DDetailer dilation b", js: "DDetailer dilation b", typ: u(undefined, "") },
        { json: "DDetailer neg prompt", js: "DDetailer neg prompt", typ: u(undefined, "") },
        { json: "DDetailer offset x a", js: "DDetailer offset x a", typ: u(undefined, "") },
        { json: "DDetailer offset x b", js: "DDetailer offset x b", typ: u(undefined, "") },
        { json: "DDetailer offset y a", js: "DDetailer offset y a", typ: u(undefined, "") },
        { json: "DDetailer offset y b", js: "DDetailer offset y b", typ: u(undefined, "") },
        { json: "DDetailer inpaint full", js: "DDetailer inpaint full", typ: u(undefined, r("ADetailerInpaintFull")) },
        { json: "DDetailer preprocess b", js: "DDetailer preprocess b", typ: u(undefined, "") },
        { json: "DDetailer inpaint padding", js: "DDetailer inpaint padding", typ: u(undefined, "") },
        { json: "Hires steps", js: "Hires steps", typ: u(undefined, "") },
        { json: "AddNet Enabled", js: "AddNet Enabled", typ: u(undefined, r("ADetailerInpaintFull")) },
        { json: "AddNet Model 1", js: "AddNet Model 1", typ: u(undefined, "") },
        { json: "AddNet Module 1", js: "AddNet Module 1", typ: u(undefined, r("AddNetModule")) },
        { json: "AddNet Weight A 1", js: "AddNet Weight A 1", typ: u(undefined, "") },
        { json: "AddNet Weight B 1", js: "AddNet Weight B 1", typ: u(undefined, "") },
        { json: "Mask blur", js: "Mask blur", typ: u(undefined, "") },
        { json: "Ultimate SD upscale padding", js: "Ultimate SD upscale padding", typ: u(undefined, "") },
        { json: "Ultimate SD upscale upscaler", js: "Ultimate SD upscale upscaler", typ: u(undefined, r("TiledDiffusionUpscalerEnum")) },
        { json: "Ultimate SD upscale mask_blur", js: "Ultimate SD upscale mask_blur", typ: u(undefined, "") },
        { json: "Ultimate SD upscale tile_width", js: "Ultimate SD upscale tile_width", typ: u(undefined, "") },
        { json: "Ultimate SD upscale tile_height", js: "Ultimate SD upscale tile_height", typ: u(undefined, "") },
        { json: "Version", js: "Version", typ: u(undefined, "") },
        { json: "AddNet Model 2", js: "AddNet Model 2", typ: u(undefined, "") },
        { json: "AddNet Module 2", js: "AddNet Module 2", typ: u(undefined, r("AddNetModule")) },
        { json: "AddNet Weight A 2", js: "AddNet Weight A 2", typ: u(undefined, "") },
        { json: "AddNet Weight B 2", js: "AddNet Weight B 2", typ: u(undefined, "") },
        { json: "Eta", js: "Eta", typ: u(undefined, "") },
        { json: "ENSD", js: "ENSD", typ: u(undefined, "") },
        { json: "'Overlap'", js: "'Overlap'", typ: u(undefined, "") },
        { json: "\"{'Method'", js: "\"{'Method'", typ: u(undefined, r("Method")) },
        { json: "'Upscaler'", js: "'Upscaler'", typ: u(undefined, r("Upscaler")) },
        { json: "'Scale factor'", js: "'Scale factor'", typ: u(undefined, "") },
        { json: "'Keep input size'", js: "'Keep input size'", typ: u(undefined, r("KeepInputSize")) },
        { json: "'Tile batch size'", js: "'Tile batch size'", typ: u(undefined, "") },
        { json: "'Latent tile width'", js: "'Latent tile width'", typ: u(undefined, "") },
        { json: "'Latent tile height'", js: "'Latent tile height'", typ: u(undefined, "") },
        { json: "Tiled Diffusion upscaler", js: "Tiled Diffusion upscaler", typ: u(undefined, r("TiledDiffusionUpscalerEnum")) },
        { json: "Tiled Diffusion scale factor", js: "Tiled Diffusion scale factor", typ: u(undefined, "") },
        { json: "ControlNet Model", js: "ControlNet Model", typ: u(undefined, "") },
        { json: "ControlNet Module", js: "ControlNet Module", typ: u(undefined, "") },
        { json: "ControlNet Weight", js: "ControlNet Weight", typ: u(undefined, "") },
        { json: "ControlNet Enabled", js: "ControlNet Enabled", typ: u(undefined, r("ADetailerInpaintFull")) },
        { json: "ControlNet Guidance End", js: "ControlNet Guidance End", typ: u(undefined, "") },
        { json: "ControlNet Guidance Start", js: "ControlNet Guidance Start", typ: u(undefined, "") },
    ], false),
    "MetaHashes": o([
        { json: "model", js: "model", typ: "" },
    ], false),
    "Resource": o([
        { json: "hash", js: "hash", typ: u(undefined, "") },
        { json: "name", js: "name", typ: "" },
        { json: "type", js: "type", typ: r("ResourceType") },
        { json: "weight", js: "weight", typ: u(undefined, u(3.14, null)) },
    ], false),
    "ModelVersionStats": o([
        { json: "downloadCount", js: "downloadCount", typ: 0 },
        { json: "ratingCount", js: "ratingCount", typ: 0 },
        { json: "rating", js: "rating", typ: 3.14 },
    ], false),
    "ItemStats": o([
        { json: "downloadCount", js: "downloadCount", typ: 0 },
        { json: "favoriteCount", js: "favoriteCount", typ: 0 },
        { json: "commentCount", js: "commentCount", typ: 0 },
        { json: "ratingCount", js: "ratingCount", typ: 0 },
        { json: "rating", js: "rating", typ: 3.14 },
    ], false),
    "CivitLorasMetadata": o([
        { json: "totalItems", js: "totalItems", typ: 0 },
        { json: "currentPage", js: "currentPage", typ: 0 },
        { json: "pageSize", js: "pageSize", typ: 0 },
        { json: "totalPages", js: "totalPages", typ: 0 },
    ], false),
    "AllowCommercialUse": [
        "Image",
        "None",
        "Rent",
        "Sell",
    ],
    "BaseModel": [
        "Other",
        "SD 1.5",
        "SD 2.1 768",
    ],
    "Format": [
        "SafeTensor",
    ],
    "PickleScanMessage": [
        "No Pickle imports",
    ],
    "ScanResult": [
        "Success",
    ],
    "FileType": [
        "Model",
    ],
    "Method": [
        "'MultiDiffusion'",
    ],
    "KeepInputSize": [
        "True}\"",
    ],
    "Upscaler": [
        "'R-ESRGAN 4x+'",
        "'SwinIR 4x'",
    ],
    "ADetailerInpaintFull": [
        "True",
    ],
    "AddNetModule": [
        "LoRA",
    ],
    "TiledDiffusionUpscalerEnum": [
        "R-ESRGAN 4x+",
        "SwinIR 4x",
    ],
    "ResourceType": [
        "lora",
        "model",
    ],
    "Sampler": [
        "DPM++ 2M Karras",
        "DPM++ SDE Karras",
        "Euler a",
    ],
    "ItemType": [
        "LORA",
    ],
};
