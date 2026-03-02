import { describe, it, expect, vi } from 'vitest';
import { performNanoGPTUpscale } from './nanogptupscale';
import { NanoGPTGenerator } from './nanogptgenerator';
import { GenerationJob, LocalImage } from './models';

const noSleep = () => Promise.resolve();

function completedJob(imageData = 'data:image/png;base64,UPSCALED'): GenerationJob {
    const img: LocalImage = {
        id: 'img-1',
        created_at: 0,
        updated_at: 0,
        model: 'Upscaler',
        nsfw: false,
        status: 'completed',
        params: {},
        imageData,
    };
    return {
        id: 'job-1',
        status: 'completed',
        backend: 'nanogpt',
        model: 'Upscaler',
        params: {},
        count: 1,
        progress: 0,
        created_at: 0,
        images: [img],
    };
}

function pendingJob(): GenerationJob {
    return {
        id: 'job-1',
        status: 'pending',
        backend: 'nanogpt',
        model: 'Upscaler',
        params: {},
        count: 1,
        progress: 0,
        created_at: 0,
    };
}

function makeGenerator(overrides: Partial<NanoGPTGenerator> = {}): NanoGPTGenerator {
    return {
        generateImages: vi.fn().mockResolvedValue(pendingJob()),
        checkGenerationJob: vi.fn().mockResolvedValue(completedJob()),
        checkGenerationJobs: vi.fn(),
        lastKnownBalance: null,
        client: {} as any,
        ...overrides,
    } as unknown as NanoGPTGenerator;
}

describe('performNanoGPTUpscale', () => {
    it('calls generateImages with model=Upscaler and the provided encoded image', async () => {
        const gen = makeGenerator();
        await performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep });
        expect(gen.generateImages).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'Upscaler',
                encoded_image: 'TESTPNG',
            })
        );
    });

    it('returns the result imageData URL from the completed job', async () => {
        const gen = makeGenerator();
        const result = await performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep });
        expect(result).toBe('data:image/png;base64,UPSCALED');
    });

    it('polls checkGenerationJob until job completes', async () => {
        let callCount = 0;
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve(callCount < 3 ? { ...pendingJob(), status: 'processing' } : completedJob());
            }),
        });
        const result = await performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep });
        expect(gen.checkGenerationJob).toHaveBeenCalledTimes(3);
        expect(result).toBe('data:image/png;base64,UPSCALED');
    });

    it('throws with job error message when status is error', async () => {
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockResolvedValue({
                ...pendingJob(), status: 'error', error: 'Model unavailable',
            }),
        });
        await expect(performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep }))
            .rejects.toThrow('Model unavailable');
    });

    it('throws generic message when job error message is absent', async () => {
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockResolvedValue({
                ...pendingJob(), status: 'error',
            }),
        });
        await expect(performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep }))
            .rejects.toThrow('NanoGPT upscale failed');
    });

    it('throws when job completes with empty images array', async () => {
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockResolvedValue({
                ...pendingJob(), status: 'completed', images: [],
            }),
        });
        await expect(performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep }))
            .rejects.toThrow('no image data');
    });

    it('throws when job completes but imageData is missing on first result', async () => {
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockResolvedValue({
                ...pendingJob(), status: 'completed', images: [{}],
            }),
        });
        await expect(performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep }))
            .rejects.toThrow('no image data');
    });

    it('throws timeout error when job does not complete within timeoutMs', async () => {
        const gen = makeGenerator({
            checkGenerationJob: vi.fn().mockResolvedValue({ ...pendingJob(), status: 'processing' }),
        });
        let tick = 0;
        const nowFn = () => tick++ * 40_000; // each call jumps 40s
        await expect(
            performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep, nowFn, timeoutMs: 120_000 })
        ).rejects.toThrow('timed out');
    });

    it('submits generateImages with prompt="upscale"', async () => {
        const gen = makeGenerator();
        await performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep });
        expect(gen.generateImages).toHaveBeenCalledWith(
            expect.objectContaining({ params: expect.objectContaining({ prompt: 'upscale' }) })
        );
    });

    it('handles defensive case where generateImages returns completed status directly (skips polling)', async () => {
        const gen = makeGenerator({
            generateImages: vi.fn().mockResolvedValue(completedJob()),
        });
        const result = await performNanoGPTUpscale('TESTPNG', gen, { sleepFn: noSleep });
        expect(gen.checkGenerationJob).not.toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,UPSCALED');
    });
});
