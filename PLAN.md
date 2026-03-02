# NanoGPT Image-to-Image & Inpainting Plan

## Overview

Extend the NanoGPT backend (already implemented for text-to-image) to support:
1. **Image-to-image**: pass a base image alongside the prompt; the model edits/varies it
2. **Inpainting**: pass a base image and a mask; the model regenerates only the masked area

The existing `enhance-tool` (img2img) and `inpaint-tool` (inpainting) already handle Horde for these modes. We need to thread the NanoGPT backend through these same tools.

---

## NanoGPT API Facts

**Endpoint**: `POST https://nano-gpt.com/api/v1/images/generations`

**New request fields** (added to existing text-to-image fields):

| Field | Type | Description |
|---|---|---|
| `imageDataUrl` | string | Base image as full data URL (`data:image/png;base64,...`) |
| `maskDataUrl` | string | Mask image as full data URL (`data:image/png;base64,...`) |
| `strength` | number | Denoising strength 0.0–1.0 (how much the model transforms the base image) |

> **Verify before shipping**: Field names `imageDataUrl`/`maskDataUrl` are camelCase as observed in API documentation. Confirm against the live wire format in the first integration test — if the API actually expects `image_data_url`/`mask_data_url` (snake_case, matching other API fields), update both the TypeScript interface and the prefix construction in `NanoGPTGenerator`. The `JSON.stringify` of the request object will use whatever casing is in the TypeScript interface.

**Important**: The API wants full data URLs (with the `data:image/...;base64,` prefix), NOT raw base64. Our renderer currently strips this prefix via `canvas.toDataURL().split(",")[1]`. We must re-add it.

**Image-to-image capable models** (`capabilities.image_to_image: true`): large set including `flux-2-max-image-to-image`, `flux-2-turbo-image-to-image`, `gpt-image-1.5`, `nano-banana-2`, `hidream-e1-1`, `flux-kontext`, and many others.

**Inpainting capable models** (`capabilities.inpainting: true`): **only one** — `flux-lora/inpainting`.

---

## Files to Change

### 1. `src/lib/nanogptclient.ts` — Add img2img/inpainting fields

Add three optional fields to `NanoGPTImageRequest`:

```typescript
export interface NanoGPTImageRequest {
    // ... existing fields unchanged ...
    imageDataUrl?: string;    // full data URL for base image
    maskDataUrl?: string;     // full data URL for inpainting mask
    strength?: number;        // denoising strength (0.0–1.0)
}
```

No other changes to the client. The `generateImage()` method already serialises the whole request object as JSON, so new optional fields are transparently included when set.

---

### 2. `src/lib/nanogptgenerator.ts` — Pass image/mask to API

**Core change**: The `generate(jobId)` method needs access to the base image and mask that were provided in `GenerateImageInput`, but `GenerationJob` (the only data the method currently has) does not carry `encoded_image`/`encoded_mask`.

**Solution**: Add a private `imageInputMap` to `NanoGPTGenerator` that maps `jobId → image input data`. This avoids polluting `GenerationJob` with large base64 blobs (which get serialised and copied around the app).

```typescript
private imageInputMap = new Map<string, {
    encodedImage: string;       // raw base64 (no prefix) — Callers must ensure bytes are PNG format
    encodedMask?: string;       // raw base64 (no prefix)
    denoisingStrength?: number;
}>();
```

In `generateImages()`: if `input.encoded_image` is present, store into the map **before** firing the async job:
```typescript
if (input.encoded_image) {
    this.imageInputMap.set(job.id, {
        encodedImage: input.encoded_image,
        encodedMask: input.encoded_mask,
        denoisingStrength: input.params.denoising_strength,
    });
}
```

In `generate(jobId)`: use a `try/finally` that **wraps the entire function body after the job lookup** so the map entry is always cleaned up regardless of which path exits:
```typescript
private async generate(jobId: string): Promise<void> {
    const job = this.jobs[jobId];
    if (!job) return;  // no map entry to clean up (job never existed)

    try {
        if (!job.params.prompt) {
            job.status = 'error';
            job.error = 'No prompt provided';
            return;
        }

        job.status = 'processing';

        const imgInput = this.imageInputMap.get(jobId);
        const request: NanoGPTImageRequest = { /* ... */ };
        if (imgInput) {
            request.imageDataUrl = `data:image/png;base64,${imgInput.encodedImage}`;
            request.strength = imgInput.denoisingStrength ?? 0.75;
            if (imgInput.encodedMask) {
                request.maskDataUrl = `data:image/png;base64,${imgInput.encodedMask}`;
            }
        }

        const resp = await this.client.generateImage(request);
        // ... build images, set status ...
    } catch (e: any) {
        job.error = e.message;
        job.status = 'error';
    } finally {
        this.imageInputMap.delete(jobId);  // always clean up, even on early return from empty-prompt path
    }
}
```

The `try/finally` wraps from after the `!job` guard to the end of the function. The `!job` early return is outside the try because there is nothing to clean up (no map entry was ever added for a job that doesn't exist).

**`strength` default**: `imgInput.denoisingStrength ?? 0.75`. The value `0.75` matches the `variationStrength` default already used in `enhance-tool`. The generator owns the fallback; the tool layer always sets `denoising_strength` from its UI state, so this fallback is a defensive last resort.

**Image format note**: The generator always prefixes `data:image/png;base64,`. Callers (enhance-tool, inpaint-tool) must encode images as PNG when using the NanoGPT backend (see §3 and §4). If a non-PNG image is sent with a PNG data URL prefix, the API will receive corrupt image data and return an opaque 400 error. This is accepted as a usage contract — format errors will surface as `'NanoGPT API error: 400'` rather than a specific message.

---

### 3. `src/lib/imagegenerator.ts` — Add `deleteJob` method

Currently `ImageGenerator` has no job-deletion method. The editor tools call `generator.client.deleteImageRequest` directly. To avoid leaking Horde internals into the tools, add:

```typescript
async deleteJob(job: GenerationJob): Promise<void> {
    if (job.backend === "nanogpt") return; // NanoGPT has no delete API; no-op
    return this.hordeGenerator.client.deleteImageRequest(job.id);
}
```

Both editor tools then call `imageGenerator.deleteJob(job)` instead of reaching into `generator.client`. The NanoGPT no-op is silent and correct (there is nothing to cancel server-side).

---

### 4. `src/pages/image-editor/enhance-tool.tsx` — Support NanoGPT backend

**Current state**: `submit(generator: HordeGenerator, image: LocalImage)` — hardcoded to Horde.

#### 4a. Update `ControlsProps` interface

The React component prop interface (separate from the `submit()` method signature) currently declares `generator: HordeGenerator`. Update it:
```typescript
// Before
interface ControlsProps {
    generator: HordeGenerator;
    // ...
}
// After
interface ControlsProps {
    generator: ImageGenerator;
    // ...
}
```
Also remove the `HordeGenerator` import if it is no longer used directly in this file.

#### 4b. Update `submit()` signature
```typescript
async submit(generator: ImageGenerator, image: LocalImage, selectedBackend: "horde" | "nanogpt")
```

#### 4c. Image format: PNG for NanoGPT, JPEG for Horde

The initial encode **and** the focus-mode resize both need the format conditioned on backend:

```typescript
// Initial encode
let encodedImage = this.renderer.getEncodedImage(
    selectionOverlay!,
    selectedBackend === "nanogpt" ? "png" : "jpeg"
);

// Focus-mode resize (line ~499 — both calls need updating)
encodedImage = await resizeEncodedImage(
    encodedImage, targetSize, targetSize,
    selectedBackend === "nanogpt" ? "png" : "jpeg"   // was hardcoded "jpeg"
);
// Mask resize stays "png" — already correct for both backends
```

#### 4d. Set backend on input
```typescript
input.backend = selectedBackend;
```

#### 4e. Poll loop: check for error status

The existing poll loop only sets `completed = true` when `job.status === "completed"`. Add an error check:
```typescript
if (job.status === "completed") {
    completed = true;
} else if (job.status === "error") {
    completed = true;
    this.notifyError(job.error || "Generation failed");
    this.state = "default";
    return;
}
```
Without this, a NanoGPT API error (stored in `job.status = 'error'`) causes the user to wait the full 2-minute timeout with no feedback.

#### 4f. Replace `generator.client.deleteImageRequest` with `deleteJob`
```typescript
await generator.deleteJob(job);   // was: generator.client.deleteImageRequest(job.id)
```

#### 4g. Model selector

The `ModelSelector` inside the enhance-tool controls should pass `selectedBackend` and `hasInitImage={true}`:
```tsx
<ModelSelector
    selectedBackend={selectedBackend}
    hasInitImage={true}
    // ... other props
/>
```

---

### 5. `src/pages/image-editor/inpaint-tool.tsx` — Support NanoGPT backend

Same pattern as enhance-tool. Key differences: inpaint-tool uses WebP for Horde (not JPEG like enhance-tool), and uses `inpainting={true}` on `ModelSelector`.

#### 5a. Update `ControlsProps` interface
Same change as §4a — `generator: HordeGenerator` → `generator: ImageGenerator`.

#### 5b. Update `submit()` signature
```typescript
async submit(generator: ImageGenerator, image: LocalImage, model: string, selectedBackend: "horde" | "nanogpt")
```

#### 5c. Image format: PNG for NanoGPT, WebP for Horde
```typescript
const encodedImage = this.renderer.getEncodedImage(
    selectionOverlay,
    selectedBackend === "nanogpt" ? "png" : "webp"   // note: WebP for Horde, not JPEG
);
```
The mask is already PNG in the existing code. No change needed for mask format.

#### 5d–5f. Same changes as enhance-tool
- Set `input.backend = selectedBackend`
- Add `job.status === "error"` check in the poll loop (same pattern)
- Replace `generator.client.deleteImageRequest` with `generator.deleteJob(job)`

#### 5g. Model selector
```tsx
<ModelSelector
    selectedBackend={selectedBackend}
    inpainting={true}
    // ... (hasInitImage is implicitly true in inpainting context)
/>
```

Also clean up the commented-out dead code at lines 391–392:
```typescript
// input.encoded_image = encodedImage;  ← remove these dead comments
// input.encoded_mask = encodedMask;
```

---

### 6. `src/pages/image-editor/ImageEditor.tsx` — Pass new props

**Current state**: receives `generator: HordeGenerator` only.

**Add props**:
```typescript
interface Props {
    generator: HordeGenerator;
    nanoGPTGenerator?: NanoGPTGenerator;    // new
    selectedBackend: "horde" | "nanogpt";   // new
}
```

The `generator: HordeGenerator` prop is **retained** because it is needed to construct `imageGenerator` inside `ImageEditor`. It is not passed directly to sub-components — `imageGenerator` is passed instead.

Inside `ImageEditor`, create `imageGenerator`:
```typescript
const imageGenerator = useMemo(
    () => new ImageGenerator(generator, nanoGPTGenerator),
    [generator, nanoGPTGenerator]
);
```

**Callsite update — which uses `generator` vs `imageGenerator`**:

| Callsite in `ImageEditor.tsx` | Before | After |
|---|---|---|
| `<EnhanceControls generator={...}` (line ~75) | `generator` (HordeGenerator) | `imageGenerator` |
| `<InpaintControls generator={...}` (line ~97) | `generator` (HordeGenerator) | `imageGenerator` |
| Any other tool callsites (line ~161) | `generator` (HordeGenerator) | `imageGenerator` |
| `hordeClient`-specific calls (if any) | `generator.client` (keep raw) | keep as-is |

Also pass `selectedBackend` to each tool component prop.

---

### 7. `src/App.tsx` — Thread props to ImageEditor

**Current state**: `<ImageEditor generator={generator} />` — no `nanoGPTGenerator` or `selectedBackend`.

**Change**:
```tsx
<ImageEditor
    generator={generator}
    nanoGPTGenerator={nanoGPTGenerator}
    selectedBackend={selectedBackend}
/>
```

No other changes to App.tsx.

---

### 8. `src/components/ModelSelector.tsx` — Filter by capability

Add a `hasInitImage?: boolean` prop to `ModelSelectorProps`. When `selectedBackend === "nanogpt"`:

| Context | `inpainting` prop | `hasInitImage` prop | Filter applied |
|---|---|---|---|
| Text-to-image | false | false/undefined | No capability filter (show all NanoGPT models) |
| Image-to-image | false | true | Only `capabilities.image_to_image === true` |
| Inpainting | true | true | Only `capabilities.inpainting === true` |

> **Known limitation**: In text-to-image context, `flux-lora/inpainting` (which only works for inpainting) appears in the model list alongside all other models because no capability filter is applied. If selected for text-to-image, the API will return an error. This is an intentional simplification; a follow-up could add `capabilities.image_generation === true` as a filter for this case. Track as a known cosmetic issue.

The filter is applied in `filteredModels`:
```typescript
const filteredModels = (() => {
    const base = models.filter((model) => {
        // Capability filtering for NanoGPT models
        if (selectedBackend === "nanogpt") {
            if (inpainting) {
                if (!model.nanogptCapabilities?.inpainting) return false;
            } else if (hasInitImage) {
                if (!model.nanogptCapabilities?.image_to_image) return false;
            }
            // text-to-image: no capability filter (show all)
        } else {
            // Horde: existing inpainting filter
            if (model.inpainting !== inpainting) return false;
        }
        // Search filter
        return (
            model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (model.displayName || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    });
    // ... existing sort logic ...
})();
```

If the filtered NanoGPT model list is empty (e.g., API failed to return `flux-lora/inpainting`), the `ModelSelector` shows an empty list. The existing empty-state behaviour should handle this gracefully — verify that an empty list renders a sensible UI (e.g., "No models available") rather than a blank panel with no explanation.

The `hasInitImage` prop defaults to `false`, so `ImagePrompt` (text-to-image) needs no change.

---

## Data Flow Summary

```
App.tsx
  ├── selectedBackend (state)
  ├── nanoGPTGenerator (state)
  └── ImageEditor
        ├── nanoGPTGenerator (prop)          ← NEW
        ├── selectedBackend (prop)            ← NEW
        ├── imageGenerator = useMemo(() => new ImageGenerator(generator, nanoGPTGenerator))
        ├── EnhanceTool — receives imageGenerator + selectedBackend
        │     └── submit(imageGenerator, image, selectedBackend)
        │           ├── getEncodedImage(sel, "png" if nanogpt else "jpeg")
        │           ├── resizeEncodedImage(..., "png" if nanogpt else "jpeg")  [focus mode]
        │           ├── input.backend = selectedBackend
        │           ├── input.encoded_image = encodedImage
        │           ├── input.encoded_mask = encodedMask (if masked)
        │           ├── imageGenerator.generateImages(input)
        │           │     └── NanoGPTGenerator.generateImages(input)
        │           │           ├── imageInputMap.set(jobId, {encodedImage, encodedMask, strength})
        │           │           └── generate(jobId) [fire-and-forget]
        │           │                 ├── build request + imageDataUrl + maskDataUrl
        │           │                 ├── client.generateImage(request)
        │           │                 └── imageInputMap.delete(jobId) [finally]
        │           ├── poll loop: check status === 'completed' OR 'error'
        │           └── imageGenerator.deleteJob(job) [on timeout/cancel]
        └── InpaintTool — receives imageGenerator + selectedBackend
              └── submit(imageGenerator, image, model, selectedBackend)
                    ├── getEncodedImage(sel, "png" if nanogpt else "webp")  [note: webp not jpeg]
                    └── (same generator flow as EnhanceTool)
```

---

## Image Format Handling

| Field | Horde path | NanoGPT path |
|---|---|---|
| Base image format (enhance-tool) | JPEG | PNG |
| Base image format (inpaint-tool) | WebP | PNG |
| Focus-mode resize format (enhance-tool) | JPEG | PNG |
| Base image encoding | raw base64 → Horde API | `data:image/png;base64,${encoded}` |
| Mask format (both tools) | PNG | PNG |
| Mask encoding | raw base64 → Horde API | `data:image/png;base64,${encoded}` |

---

## Tests to Update/Add

### `src/lib/nanogptgenerator.test.ts`

New test cases:
- `generateImages` with `encoded_image` → `imageInputMap` receives the entry
- After generation completes: `imageInputMap` is cleared (no leak)
- Request sent to client includes `imageDataUrl` with `data:image/png;base64,` prefix
- Request includes `strength` defaulting to `0.75` when `denoising_strength` is undefined
- Request includes `strength` from `params.denoising_strength` when set
- With `encoded_mask` present: request includes `maskDataUrl` with PNG prefix
- **With `encoded_image` present but NO `encoded_mask`**: request includes `imageDataUrl` but does NOT include `maskDataUrl` (distinct case from above — verifies absence)
- On API error: `imageInputMap` is still cleared (finally block runs even on error)
- Text-to-image (no `encoded_image`): no `imageDataUrl` in request, no entry in `imageInputMap`
- Empty prompt with `encoded_image` present: `imageInputMap` entry is cleaned up even though error returned early (from inside the try block)

### `src/lib/nanogptclient.test.ts`

No new tests needed — the new fields are optional and transparently serialised.

### `src/lib/imagegenerator.test.ts`

New test cases:
- `deleteJob` with `job.backend === "horde"` → calls `hordeGenerator.client.deleteImageRequest`
- `deleteJob` with `job.backend === "nanogpt"` → does NOT call `deleteImageRequest`, resolves silently

---

## Implementation Order

1. `src/lib/nanogptclient.ts` — add three optional fields to `NanoGPTImageRequest`
2. `src/lib/imagegenerator.ts` — add `deleteJob()` method
3. `src/lib/nanogptgenerator.ts` — add `imageInputMap`, wrap generate() body in try/finally, pass image/mask to API
4. `src/components/ModelSelector.tsx` — add `hasInitImage` prop, capability filtering
5. `src/pages/image-editor/ImageEditor.tsx` — add `nanoGPTGenerator` + `selectedBackend` props, create `imageGenerator` via useMemo, update callsites
6. `src/pages/image-editor/enhance-tool.tsx` — update `ControlsProps`, accept `ImageGenerator` + `selectedBackend`, PNG format (initial + resize), error-status poll check, `deleteJob`
7. `src/pages/image-editor/inpaint-tool.tsx` — same pattern as enhance-tool, WebP→PNG for NanoGPT
8. `src/App.tsx` — pass new props to `ImageEditor`
9. Add/update tests

---

## Edge Cases & Limitations

- **Only one inpainting model** (`flux-lora/inpainting`): when backend is NanoGPT and inpainting context is active, the model list will show only this model. The `ModelSelector` should auto-select it if it is the only entry (verify current auto-selection behaviour matches expectation). If the API returns zero models with `inpainting: true`, the list will be empty — verify the empty-list UI renders an explanatory message rather than a blank panel.
- **Image size**: NanoGPT img2img models may have resolution constraints. The size is passed as-is from the tool's width/height calculation; if an unsupported size is sent, the API returns an error which surfaces immediately via the `job.status === 'error'` poll check.
- **Focus mode + NanoGPT**: enhance-tool's focus mode upscales small selections to 1024×1024. Compatible with NanoGPT (target size is already 1024×1024). Both the initial encode and the resize call must use PNG format for NanoGPT (see §4c).
- **`n > 1` for img2img**: NanoGPT accepts `n` for text-to-image; behaviour for img2img with `n > 1` is unverified. We pass `n` through as-is; if the API errors, the user sees the error immediately (via the poll loop error check).
- **Memory**: The `imageInputMap` stores base64 PNGs in-memory for the duration of the API call. Large images (~1–2 MB base64) are held only until the API returns (typically seconds). The `finally` block ensures cleanup.
- **Generator lifecycle**: `NanoGPTGenerator` is created when the API key is saved and lives in React state. If the user saves a new key (recreating the generator) while a job is in flight, the old instance's `imageInputMap` and `jobs` dict are orphaned — `checkGenerationJob` on the new instance will throw `'NanoGPT job not found'`, surfacing an error to the user. This is acceptable: key changes are intentional user actions, not routine events.
- **Text-to-image model list shows `flux-lora/inpainting`**: In text-to-image NanoGPT context, the capability filter is not applied, so inpainting-only models appear. Selecting one for text-to-image will return an API error. This is a known cosmetic limitation.
- **API field name casing**: `imageDataUrl`/`maskDataUrl` are camelCase in the TypeScript interface. Verify against the live NanoGPT API in the first integration test. If the wire format uses snake_case, update both the interface and the generator's prefix construction.
