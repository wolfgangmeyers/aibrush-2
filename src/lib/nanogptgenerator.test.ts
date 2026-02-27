import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NanoGPTGenerator } from './nanogptgenerator';
import { NanoGPTClient } from './nanogptclient';
import { GenerateImageInput } from './models';

function makeClient(overrides: Partial<NanoGPTClient> = {}): NanoGPTClient {
    return {
        generateImage: vi.fn().mockResolvedValue({
            created: 1000,
            data: [{ b64_json: 'AAAA' }],
            cost: 0.04,
            paymentSource: 'balance',
            remainingBalance: 9.96,
        }),
        listImageModels: vi.fn().mockResolvedValue([]),
        ...overrides,
    } as unknown as NanoGPTClient;
}

function makeInput(overrides: Partial<GenerateImageInput> = {}): GenerateImageInput {
    return {
        model: 'hidream',
        params: { prompt: 'a test image', width: 1024, height: 1024 },
        count: 1,
        hires_fix: false,
        backend: 'nanogpt',
        ...overrides,
    };
}

describe('NanoGPTGenerator', () => {
    let client: NanoGPTClient;
    let generator: NanoGPTGenerator;

    beforeEach(() => {
        client = makeClient();
        generator = new NanoGPTGenerator(client);
    });

    describe('generateImages', () => {
        it('returns a pending job with backend nanogpt', async () => {
            const job = await generator.generateImages(makeInput());
            expect(job.status).toBe('pending');
            expect(job.backend).toBe('nanogpt');
            expect(job.model).toBe('hidream');
        });

        it('returns a deep copy (not a live reference)', async () => {
            const job = await generator.generateImages(makeInput());
            // Mutating the returned job should not affect internal state
            (job as any).status = 'error';
            // Wait for generation to complete
            await new Promise((r) => setTimeout(r, 10));
            const updated = await generator.checkGenerationJob(job);
            expect(updated.status).toBe('completed');
        });
    });

    describe('checkGenerationJob', () => {
        it('returns completed job with images after async generation', async () => {
            const job = await generator.generateImages(makeInput());
            // Wait for fire-and-forget to complete
            await new Promise((r) => setTimeout(r, 10));
            const updated = await generator.checkGenerationJob(job);
            expect(updated.status).toBe('completed');
            expect(updated.images).toHaveLength(1);
            expect(updated.images![0].imageData).toBe('data:image/png;base64,AAAA');
        });

        it('returns deep copy of in-progress job (not live ref)', async () => {
            // Slow API so job stays pending/processing
            const slowClient = makeClient({
                generateImage: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
            });
            const slowGenerator = new NanoGPTGenerator(slowClient);
            const job = await slowGenerator.generateImages(makeInput());
            // Briefly wait — job will be 'processing' not 'completed'
            await new Promise((r) => setTimeout(r, 5));
            const checked = await slowGenerator.checkGenerationJob(job);
            // It's a copy — mutating it doesn't affect internal state
            (checked as any).status = 'error';
            const checked2 = await slowGenerator.checkGenerationJob(job);
            expect(checked2.status).not.toBe('error');
        });

        it('returns error status when generation fails', async () => {
            const errClient = makeClient({
                generateImage: vi.fn().mockRejectedValue(new Error('API down')),
            });
            const errGenerator = new NanoGPTGenerator(errClient);
            const job = await errGenerator.generateImages(makeInput());
            await new Promise((r) => setTimeout(r, 10));
            const updated = await errGenerator.checkGenerationJob(job);
            expect(updated.status).toBe('error');
            expect(updated.error).toContain('API down');
        });

        it('cleans up job from internal map after completion', async () => {
            const job = await generator.generateImages(makeInput());
            await new Promise((r) => setTimeout(r, 10));
            const completed = await generator.checkGenerationJob(job);
            expect(completed.status).toBe('completed');
            // Calling again on the same job ID should throw
            await expect(generator.checkGenerationJob(job)).rejects.toThrow('job not found');
        });

        it('throws job not found for an unknown job ID', async () => {
            await expect(
                generator.checkGenerationJob({ id: 'nonexistent', status: 'pending', backend: 'nanogpt' } as any)
            ).rejects.toThrow('job not found');
        });

        it('sets error when prompt is empty', async () => {
            const job = await generator.generateImages(makeInput({ params: { prompt: '' } }));
            await new Promise((r) => setTimeout(r, 10));
            const updated = await generator.checkGenerationJob(job);
            expect(updated.status).toBe('error');
            expect(client.generateImage).not.toHaveBeenCalled();
        });

        it('sets error when API returns no b64_json data (all entries missing)', async () => {
            const noDataClient = makeClient({
                generateImage: vi.fn().mockResolvedValue({
                    created: 1000,
                    data: [{ url: 'https://example.com/img.png' }], // url format, no b64_json
                    cost: 0.04,
                    paymentSource: 'balance',
                    remainingBalance: 9.96,
                }),
            });
            const gen = new NanoGPTGenerator(noDataClient);
            const job = await gen.generateImages(makeInput());
            await new Promise((r) => setTimeout(r, 10));
            const updated = await gen.checkGenerationJob(job);
            expect(updated.status).toBe('error');
            expect(updated.error).toContain('no image data');
        });
    });

    describe('checkGenerationJobs', () => {
        it('checks all jobs and returns results', async () => {
            const job1 = await generator.generateImages(makeInput());
            const job2 = await generator.generateImages(makeInput({ model: 'flux-pro' }));
            await new Promise((r) => setTimeout(r, 10));
            const results = await generator.checkGenerationJobs([job1, job2]);
            expect(results).toHaveLength(2);
            expect(results.every((j) => j.status === 'completed')).toBe(true);
        });
    });
});
