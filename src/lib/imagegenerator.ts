import { HordeGenerator } from "./hordegenerator";
import { NanoGPTGenerator } from "./nanogptgenerator";
import { GenerateImageInput, GenerationJob } from "./models";

export class ImageGenerator {
    constructor(
        private hordeGenerator: HordeGenerator,
        private nanoGPTGenerator?: NanoGPTGenerator
    ) {}

    async generateImages(input: GenerateImageInput, onUploadProgress?: (progressEvent: any) => void): Promise<GenerationJob> {
        if (input.backend === 'nanogpt') {
            if (!this.nanoGPTGenerator) {
                throw new Error('NanoGPT is not configured. Please add your NanoGPT API key in settings.');
            }
            return this.nanoGPTGenerator.generateImages(input);
        }
        return this.hordeGenerator.generateImages(input, onUploadProgress);
    }

    async checkGenerationJob(job: GenerationJob): Promise<GenerationJob> {
        if (job.backend === 'nanogpt') {
            if (!this.nanoGPTGenerator) {
                throw new Error('NanoGPT generator not available');
            }
            return this.nanoGPTGenerator.checkGenerationJob(job);
        }
        return this.hordeGenerator.checkGenerationJob(job);
    }

    async checkGenerationJobs(jobs: GenerationJob[]): Promise<GenerationJob[]> {
        const nanoJobs = jobs.filter((j) => j.backend === 'nanogpt');
        const hordeJobs = jobs.filter((j) => j.backend !== 'nanogpt');

        if (nanoJobs.length > 0 && !this.nanoGPTGenerator) {
            // Mark all orphaned NanoGPT jobs as error rather than silently dropping them
            const errored = nanoJobs.map((j) => ({
                ...j,
                status: 'error' as const,
                error: 'NanoGPT generator not available',
            }));
            const hordeResults = await Promise.all(hordeJobs.map((j) => this.hordeGenerator.checkGenerationJob(j)));
            return [...errored, ...hordeResults];
        }

        const nanoResults = nanoJobs.length > 0
            ? await Promise.all(nanoJobs.map((j) => this.nanoGPTGenerator!.checkGenerationJob(j)))
            : [];
        const hordeResults = await Promise.all(hordeJobs.map((j) => this.hordeGenerator.checkGenerationJob(j)));

        return [...nanoResults, ...hordeResults];
    }
}
