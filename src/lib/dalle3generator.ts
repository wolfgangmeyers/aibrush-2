import OpenAI from "openai";
import * as uuid from "uuid";
import { GenerateImageInput, GenerationJob, LocalImage } from "./models";
import moment from "moment";

export class Dalle3Generator {

    private jobs: {[key: string]: GenerationJob} = {};

    constructor(private client: OpenAI) {}

    async generate(jobId: string) {
        const job = this.jobs[jobId];
        if (!job) {
            console.error("Job not found");
            return;
        }
        if (!job.params.prompt) {
            console.error("Job has no prompt");
            delete this.jobs[jobId];
            return;
        }
        job.status = "processing";
        job.params.width = 1024;
        job.params.height = 1024;
        job.count = Math.min(job.count, 4);
        try {
            const resp = await this.client.images.generate({
                model: "dall-e-3",
                prompt: job.params.prompt,
                response_format: "b64_json",
                size: "1024x1024",
                quality: "hd",
                style: "natural",
                n: 1,
            })
    
            job.images = [];
    
            //b64_json is a base64 encoded webp image
            resp.data.forEach(img => {
                const base64 = img.b64_json;
                if (!base64) {
                    console.log("No image data returned");
                    return;
                }
                const image: LocalImage = {
                    id: uuid.v4(),
                    created_at: moment().valueOf(),
                    model: "dall-e-3",
                    nsfw: false,
                    status: "completed",
                    imageData: `data:image/webp;base64,${base64}`,
                    params: job.params,
                    format: "webp",
                    updated_at: moment().valueOf(),
                };
                job.images!.push(image);
            });
            job.status = "completed";
        } catch (e: any) {
            console.error(e);
            job.error = e.message;
            job.status = "error";
        }
        
    }

    async generateImages(input: GenerateImageInput): Promise<GenerationJob> {
        const job: GenerationJob = {
            id: uuid.v4(),
            params: input.params,
            model: "dall-e-3",
            status: "pending",
            progress: 0,
            created_at: moment().valueOf(),
            count: input.count,
            backend: "openai",
        };
        this.jobs[job.id] = job;
        this.generate(job.id);
        return JSON.parse(JSON.stringify(job));
    }

    async checkGenerationJob(job: GenerationJob): Promise<GenerationJob> {
        const existingJob = this.jobs[job.id];
        if (!existingJob) {
            throw new Error("Job not found");
        }
        if (existingJob.status === "completed" || existingJob.status === "error") {
            delete this.jobs[job.id];
            return existingJob;
        }
        return JSON.parse(JSON.stringify(existingJob));
    }

    async checkGenerationJobs(jobs: GenerationJob[]): Promise<GenerationJob[]> {
        jobs = JSON.parse(JSON.stringify(jobs)) as GenerationJob[];
        const promises = jobs.map((job) => this.checkGenerationJob(job));
        return Promise.all(promises);
    }
}