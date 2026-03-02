import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageGenerator } from './imagegenerator';
import { HordeGenerator } from './hordegenerator';
import { NanoGPTGenerator } from './nanogptgenerator';
import { GenerateImageInput, GenerationJob } from './models';

function makeHordeGenerator(): HordeGenerator {
    return {
        generateImages: vi.fn().mockResolvedValue({ id: 'horde-1', backend: 'horde', status: 'pending' }),
        checkGenerationJob: vi.fn().mockResolvedValue({ id: 'horde-1', backend: 'horde', status: 'completed' }),
        checkGenerationJobs: vi.fn().mockResolvedValue([{ id: 'horde-1', backend: 'horde', status: 'completed' }]),
        client: {
            deleteImageRequest: vi.fn().mockResolvedValue(undefined),
        },
    } as unknown as HordeGenerator;
}

function makeNanoGPTGenerator(): NanoGPTGenerator {
    return {
        generateImages: vi.fn().mockResolvedValue({ id: 'nano-1', backend: 'nanogpt', status: 'pending' }),
        checkGenerationJob: vi.fn().mockResolvedValue({ id: 'nano-1', backend: 'nanogpt', status: 'completed' }),
        checkGenerationJobs: vi.fn().mockResolvedValue([{ id: 'nano-1', backend: 'nanogpt', status: 'completed' }]),
    } as unknown as NanoGPTGenerator;
}

function makeInput(backend?: 'horde' | 'nanogpt'): GenerateImageInput {
    return {
        model: 'test-model',
        params: { prompt: 'test' },
        count: 1,
        hires_fix: false,
        backend,
    };
}

function makeJob(backend: 'horde' | 'nanogpt', id = 'job-1'): GenerationJob {
    return { id, backend, status: 'pending', model: 'test', params: {}, count: 1, progress: 0, created_at: 0 };
}

describe('ImageGenerator', () => {
    let hordeGen: HordeGenerator;
    let nanoGen: NanoGPTGenerator;

    beforeEach(() => {
        hordeGen = makeHordeGenerator();
        nanoGen = makeNanoGPTGenerator();
    });

    describe('generateImages', () => {
        it('routes to horde when backend is horde', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.generateImages(makeInput('horde'));
            expect(hordeGen.generateImages).toHaveBeenCalled();
            expect(nanoGen.generateImages).not.toHaveBeenCalled();
        });

        it('routes to nanogpt when backend is nanogpt', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.generateImages(makeInput('nanogpt'));
            expect(nanoGen.generateImages).toHaveBeenCalled();
            expect(hordeGen.generateImages).not.toHaveBeenCalled();
        });

        it('defaults to horde when no backend field', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.generateImages(makeInput()); // no backend
            expect(hordeGen.generateImages).toHaveBeenCalled();
        });

        it('throws when backend is nanogpt but generator is absent', async () => {
            const ig = new ImageGenerator(hordeGen); // no nanoGen
            await expect(ig.generateImages(makeInput('nanogpt'))).rejects.toThrow('NanoGPT is not configured');
        });
    });

    describe('checkGenerationJob', () => {
        it('routes horde job to hordeGenerator', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.checkGenerationJob(makeJob('horde'));
            expect(hordeGen.checkGenerationJob).toHaveBeenCalled();
            expect(nanoGen.checkGenerationJob).not.toHaveBeenCalled();
        });

        it('routes nanogpt job to nanoGPTGenerator', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.checkGenerationJob(makeJob('nanogpt'));
            expect(nanoGen.checkGenerationJob).toHaveBeenCalled();
            expect(hordeGen.checkGenerationJob).not.toHaveBeenCalled();
        });

        it('throws when nanogpt job but no generator', async () => {
            const ig = new ImageGenerator(hordeGen);
            await expect(ig.checkGenerationJob(makeJob('nanogpt'))).rejects.toThrow();
        });
    });

    describe('deleteJob', () => {
        it('calls hordeGenerator.client.deleteImageRequest for horde jobs', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.deleteJob(makeJob('horde'));
            expect((hordeGen as any).client.deleteImageRequest).toHaveBeenCalledWith('job-1');
        });

        it('does NOT call deleteImageRequest for nanogpt jobs (no-op)', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await ig.deleteJob(makeJob('nanogpt'));
            expect((hordeGen as any).client.deleteImageRequest).not.toHaveBeenCalled();
        });

        it('resolves silently for nanogpt jobs', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            await expect(ig.deleteJob(makeJob('nanogpt'))).resolves.toBeUndefined();
        });
    });

    describe('checkGenerationJobs', () => {
        it('partitions mixed jobs and calls each generator', async () => {
            const ig = new ImageGenerator(hordeGen, nanoGen);
            const jobs = [makeJob('horde', 'h1'), makeJob('nanogpt', 'n1'), makeJob('horde', 'h2')];
            const results = await ig.checkGenerationJobs(jobs);
            expect(nanoGen.checkGenerationJob).toHaveBeenCalledOnce();
            expect(hordeGen.checkGenerationJob).toHaveBeenCalledTimes(2);
            expect(results).toHaveLength(3);
        });

        it('marks nano jobs as error when nanoGPTGenerator is absent', async () => {
            const ig = new ImageGenerator(hordeGen); // no nanoGen
            const jobs = [makeJob('horde', 'h1'), makeJob('nanogpt', 'n1')];
            const results = await ig.checkGenerationJobs(jobs);
            expect(results).toHaveLength(2);
            const nanoResult = results.find((j) => j.backend === 'nanogpt');
            expect(nanoResult?.status).toBe('error');
            expect(nanoResult?.error).toBeTruthy();
            // Horde job still processed
            const hordeResult = results.find((j) => j.backend === 'horde');
            expect(hordeResult?.status).toBe('completed');
        });
    });
});
