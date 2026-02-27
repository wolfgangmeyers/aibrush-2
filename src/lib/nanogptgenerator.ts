import * as uuid from 'uuid';
import moment from 'moment';
import { NanoGPTClient } from './nanogptclient';
import { GenerateImageInput, GenerationJob, LocalImage } from './models';

export class NanoGPTGenerator {
    private jobs: { [id: string]: GenerationJob } = {};

    constructor(readonly client: NanoGPTClient) {}

    private async generate(jobId: string): Promise<void> {
        const job = this.jobs[jobId];
        if (!job) return;
        if (!job.params.prompt) {
            job.status = 'error';
            job.error = 'No prompt provided';
            return;
        }

        job.status = 'processing';

        const width = job.params.width || 1024;
        const height = job.params.height || 1024;
        const size = `${width}x${height}`;

        const parsedSeed = job.params.seed ? parseInt(job.params.seed, 10) : undefined;
        const seed = parsedSeed !== undefined && !Number.isNaN(parsedSeed) ? parsedSeed : undefined;

        try {
            const resp = await this.client.generateImage({
                model: job.model,
                prompt: job.params.prompt,
                n: job.count,
                size,
                response_format: 'b64_json',
                seed,
            });

            job.images = [];
            resp.data.forEach((img) => {
                if (!img.b64_json) return;
                const image: LocalImage = {
                    id: uuid.v4(),
                    created_at: moment().valueOf(),
                    updated_at: moment().valueOf(),
                    model: job.model,
                    nsfw: false,
                    status: 'completed',
                    imageData: `data:image/png;base64,${img.b64_json}`,
                    params: { ...job.params },
                    format: 'png',
                };
                job.images!.push(image);
            });

            // Guard: if no images were decoded (e.g. API returned 'url' format instead of 'b64_json'),
            // treat as error rather than silently completing with an empty images array.
            if (job.images.length === 0) {
                job.status = 'error';
                job.error = 'NanoGPT returned no image data. Ensure response_format is b64_json.';
                return;
            }
            job.status = 'completed';
        } catch (e: any) {
            console.error('NanoGPT generation failed for job', jobId, e);
            job.error = e.message;
            job.status = 'error';
        }
    }

    async generateImages(input: GenerateImageInput): Promise<GenerationJob> {
        const job: GenerationJob = {
            id: uuid.v4(),
            params: input.params,
            model: input.model,
            status: 'pending',
            progress: 0,
            created_at: moment().valueOf(),
            count: input.count,
            backend: 'nanogpt',
        };
        this.jobs[job.id] = job;
        const snapshot = JSON.parse(JSON.stringify(job)); // snapshot before fire-and-forget mutates status
        this.generate(job.id).catch((e) => console.error('Unhandled error in NanoGPT generate:', e)); // fire-and-forget
        return snapshot;
    }

    async checkGenerationJob(job: GenerationJob): Promise<GenerationJob> {
        const existing = this.jobs[job.id];
        if (!existing) {
            throw new Error('NanoGPT job not found');
        }
        if (existing.status === 'completed' || existing.status === 'error') {
            delete this.jobs[job.id];
        }
        return JSON.parse(JSON.stringify(existing));
    }

    async checkGenerationJobs(jobs: GenerationJob[]): Promise<GenerationJob[]> {
        return Promise.all(jobs.map((j) => this.checkGenerationJob(j)));
    }
}
