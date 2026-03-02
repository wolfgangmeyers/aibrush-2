// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AugmentControls } from './augment-tool';
import { decodeImage, imageDataToCanvas } from '../../lib/imageutil';

// Prevent ImageUtilWorker from doing real work
vi.mock('../../lib/imageutil', () => ({
    ImageUtilWorker: class { destroy = vi.fn(); },
    imageDataToCanvas: vi.fn((imageData: any) => {
        const el = { width: imageData?.width ?? 512, height: imageData?.height ?? 512, remove: vi.fn(), toDataURL: vi.fn(() => 'data:image/png;base64,MOCKPNG'), getContext: vi.fn() } as any;
        return el;
    }),
    fixImageSize: vi.fn((c: any) => c),
    decodeImage: vi.fn(() => Promise.resolve(new window.Image())),
}));

vi.mock('../../lib/credits', () => ({ calculateImagesCost: vi.fn(() => 1) }));
vi.mock('../../lib/sleep', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }));

function makeRenderer(overrides: any = {}): any {
    return {
        getWidth: vi.fn(() => 512),
        getHeight: vi.fn(() => 512),
        getEncodedImage: vi.fn(() => 'MOCKBASE64'),
        getImageData: vi.fn(() => ({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) })),
        setBaseImage: vi.fn(),
        ...overrides,
    };
}

function makeHordeGenerator(): any {
    return {
        augmentImage: vi.fn(),
        checkAugmentation: vi.fn(),
        client: { deleteInterrogationRequest: vi.fn() },
    };
}

function makeNanoGPTGenerator(): any {
    return {
        generateImages: vi.fn(),
        checkGenerationJob: vi.fn(),
        lastKnownBalance: null,
    };
}

function makeImage(): any {
    return {
        id: 'test-image',
        params: { width: 512, height: 512, prompt: 'test' },
        status: 'completed',
        model: 'test-model',
        nsfw: false,
        created_at: 0,
        updated_at: 0,
    };
}

function makeTool(): any {
    return { name: 'augment', saveListener: undefined };
}

function completedNanoGPTJob() {
    return {
        id: 'job-1',
        status: 'completed',
        backend: 'nanogpt',
        model: 'Upscaler',
        params: {},
        count: 1,
        progress: 0,
        created_at: 0,
        images: [{ imageData: 'data:image/png;base64,UPSCALED' }],
    };
}

function completedHordeAugmentation() {
    return { id: 'aug-1', status: 'completed', imageData: 'data:image/png;base64,HORDEOUT' };
}

/** Mock document.createElement('canvas') to return a functional fake canvas with a mock 2d context. */
function setupCanvasMock() {
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
            let _w = 0, _h = 0;
            const ctx = {
                drawImage: vi.fn(),
                getImageData: vi.fn().mockImplementation((_x: number, _y: number, w: number, h: number) => ({
                    width: w,
                    height: h,
                    data: new Uint8ClampedArray(w * h * 4),
                })),
            };
            return {
                get width() { return _w; },
                set width(v: number) { _w = v; },
                get height() { return _h; },
                set height(v: number) { _h = v; },
                getContext: vi.fn(() => ctx),
                remove: vi.fn(),
            } as any;
        }
        return orig(tag);
    });
}

describe('AugmentControls render', () => {
    describe('Upscale button', () => {
        it('shows "Upscale Image 2x" button for Horde backend', () => {
            const { getByText } = render(
                <AugmentControls
                    renderer={makeRenderer()}
                    tool={makeTool()}
                    generator={makeHordeGenerator()}
                    selectedBackend="horde"
                    image={makeImage()}
                />
            );
            expect(getByText(/Upscale Image 2x/)).toBeTruthy();
        });

        it('shows "Upscale Image 2x" button for NanoGPT backend', () => {
            const { getByText } = render(
                <AugmentControls
                    renderer={makeRenderer()}
                    tool={makeTool()}
                    generator={makeHordeGenerator()}
                    nanoGPTGenerator={makeNanoGPTGenerator()}
                    selectedBackend="nanogpt"
                    image={makeImage()}
                />
            );
            expect(getByText(/Upscale Image 2x/)).toBeTruthy();
        });
    });

    describe('Restore Faces button', () => {
        it('shows "Restore Faces" button for Horde backend', () => {
            const { getByText } = render(
                <AugmentControls
                    renderer={makeRenderer()}
                    tool={makeTool()}
                    generator={makeHordeGenerator()}
                    selectedBackend="horde"
                    image={makeImage()}
                />
            );
            expect(getByText(/Restore Faces/)).toBeTruthy();
        });

        it('hides "Restore Faces" button for NanoGPT backend', () => {
            const { queryByText } = render(
                <AugmentControls
                    renderer={makeRenderer()}
                    tool={makeTool()}
                    generator={makeHordeGenerator()}
                    nanoGPTGenerator={makeNanoGPTGenerator()}
                    selectedBackend="nanogpt"
                    image={makeImage()}
                />
            );
            expect(queryByText(/Restore Faces/)).toBeNull();
        });
    });
});

describe('AugmentControls upscale action', () => {
    beforeEach(() => {
        setupCanvasMock();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('draws NanoGPT upscale result at 2x input dimensions and encodes as PNG', async () => {
        const nanoGen = makeNanoGPTGenerator();
        nanoGen.generateImages.mockResolvedValue(completedNanoGPTJob());

        // Capture the canvas to verify toDataURL is called with "image/png"
        let capturedCanvas: any;
        vi.mocked(imageDataToCanvas).mockImplementationOnce((imageData: any) => {
            const el = {
                width: imageData?.width ?? 512,
                height: imageData?.height ?? 512,
                remove: vi.fn(),
                toDataURL: vi.fn(() => 'data:image/png;base64,MOCKPNG'),
                getContext: vi.fn(),
            } as any;
            capturedCanvas = el;
            return el;
        });

        const renderer = makeRenderer();
        const { getByText } = render(
            <AugmentControls
                renderer={renderer}
                tool={makeTool()}
                generator={makeHordeGenerator()}
                nanoGPTGenerator={nanoGen}
                selectedBackend="nanogpt"
                image={makeImage()}
            />
        );

        fireEvent.click(getByText(/Upscale Image 2x/));

        await waitFor(() => {
            expect(renderer.setBaseImage).toHaveBeenCalledWith(
                expect.objectContaining({ width: 1024, height: 1024 })
            );
        });
        expect(capturedCanvas.toDataURL).toHaveBeenCalledWith("image/png");
    });

    it('Horde path calls augmentImage and draws result at 2x input dimensions', async () => {
        const generator = makeHordeGenerator();
        generator.augmentImage.mockResolvedValue(completedHordeAugmentation());

        const renderer = makeRenderer();
        const { getByText } = render(
            <AugmentControls
                renderer={renderer}
                tool={makeTool()}
                generator={generator}
                selectedBackend="horde"
                image={makeImage()}
            />
        );

        fireEvent.click(getByText(/Upscale Image 2x/));

        await waitFor(() => {
            expect(generator.augmentImage).toHaveBeenCalledWith(
                expect.objectContaining({ augmentation: 'upscale' })
            );
            expect(renderer.setBaseImage).toHaveBeenCalledWith(
                expect.objectContaining({ width: 1024, height: 1024 })
            );
        });
    });

    it('falls back to Horde path when nanoGPTGenerator is undefined and backend is nanogpt', async () => {
        const generator = makeHordeGenerator();
        generator.augmentImage.mockResolvedValue(completedHordeAugmentation());

        const renderer = makeRenderer();
        const { getByText, queryByText } = render(
            <AugmentControls
                renderer={renderer}
                tool={makeTool()}
                generator={generator}
                // nanoGPTGenerator intentionally omitted
                selectedBackend="nanogpt"
                image={makeImage()}
            />
        );

        // Restore Faces is hidden for nanogpt backend even when nanoGPTGenerator is absent
        expect(queryByText(/Restore Faces/)).toBeNull();

        fireEvent.click(getByText(/Upscale Image 2x/));

        await waitFor(() => {
            expect(generator.augmentImage).toHaveBeenCalled();
        });
    });

    it('shows Revert button and does not update image when decodeImage rejects', async () => {
        vi.mocked(decodeImage).mockRejectedValueOnce(new Error('Image decode failed'));

        const nanoGen = makeNanoGPTGenerator();
        nanoGen.generateImages.mockResolvedValue(completedNanoGPTJob());

        const renderer = makeRenderer();
        const { getByText } = render(
            <AugmentControls
                renderer={renderer}
                tool={makeTool()}
                generator={makeHordeGenerator()}
                nanoGPTGenerator={nanoGen}
                selectedBackend="nanogpt"
                image={makeImage()}
            />
        );

        fireEvent.click(getByText(/Upscale Image 2x/));

        await waitFor(() => {
            expect(getByText(/Revert/)).toBeTruthy();
        });
        expect(renderer.setBaseImage).not.toHaveBeenCalled();
    });
});
