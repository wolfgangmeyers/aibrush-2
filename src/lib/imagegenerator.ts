import { Dalle3Generator } from "./dalle3generator";
import { HordeGenerator } from "./hordegenerator";
import { GenerateImageInput, GenerationJob } from "./models";

export class ImageGenerator {
    constructor(private hordeGenerator: HordeGenerator, private dalle3Generator?: Dalle3Generator) {}

    async generateImages(input: GenerateImageInput, onUploadProgress?: (progressEvent: any) => void): Promise<GenerationJob> {
        if (input.model === "dall-e-3") {
            if (!this.dalle3Generator) {
                throw new Error("Dall-e-3 generator not available");
            }
            return this.dalle3Generator.generateImages(input);
        }
        return this.hordeGenerator.generateImages(input, onUploadProgress);
    }

    async checkGenerationJob(job: GenerationJob): Promise<GenerationJob> {
        if (job.model === "dall-e-3") {
            if (!this.dalle3Generator) {
                throw new Error("Dall-e-3 generator not available");
            }
            return this.dalle3Generator.checkGenerationJob(job);
        }
        return this.hordeGenerator.checkGenerationJob(job);
    }

    async checkGenerationJobs(jobs: GenerationJob[]): Promise<GenerationJob[]> {
        // split into two lists and check separately, then join the results
        const dalleJobs = jobs.filter((job) => job.model === "dall-e-3");
        const hordeJobs = jobs.filter((job) => job.model !== "dall-e-3");
        if (dalleJobs.length > 0 && !this.dalle3Generator) {
            throw new Error("Dall-e-3 generator not available");
        }
        const dallePromises = dalleJobs.map((job) => this.dalle3Generator!.checkGenerationJob(job));
        const hordePromises = hordeJobs.map((job) => this.hordeGenerator.checkGenerationJob(job));
        const dalleResults = await Promise.all(dallePromises);
        const hordeResults = await Promise.all(hordePromises);
        return dalleResults.concat(hordeResults);
    }
}