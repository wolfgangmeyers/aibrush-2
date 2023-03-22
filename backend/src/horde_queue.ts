import * as AWS from "aws-sdk";
import { inherits } from "util";

export interface HordeRequest {
    authToken: string;
    imageId: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    denoisingStrength: number;
    nsfw: boolean;
    censorNsfw: boolean;
    model: string;
    augmentation: "face_restore" | "remove_background" | "upscale";
    controlnetType: string | null;
}

export interface HordeQueue {
    submitImage(image: HordeRequest): Promise<void>;
    popImage(): Promise<HordeRequest>;
    init(): Promise<void>;
}

export class SQSHordeQueue implements HordeQueue {
    private readonly sqs: AWS.SQS;
    private readonly queueName: string;
    private queueUrl: string;

    constructor(
        queueName: string,
        config: AWS.SQS.ClientConfiguration,
        private waitTimeSeconds = 20
    ) {
        this.sqs = new AWS.SQS(config);
        this.queueName = queueName;
    }

    async init() {
        // check if a queue with the given name exists
        const queues = await this.sqs
            .listQueues({
                QueueNamePrefix: this.queueName,
            })
            .promise();

        // if not, create it
        if (queues.QueueUrls && queues.QueueUrls.length > 0) {
            this.queueUrl = queues.QueueUrls[0];
        } else {
            const queue = await this.sqs
                .createQueue({
                    QueueName: this.queueName,
                })
                .promise();
            this.queueUrl = queue.QueueUrl!;
        }
        console.log("Horde queue URL:", this.queueUrl)
    }

    async submitImage(image: HordeRequest): Promise<void> {
        await this.sqs
            .sendMessage({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(image),
            })
            .promise();
    }

    async popImage(): Promise<HordeRequest> {
        const message = await this.sqs
            .receiveMessage({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: 1,
                WaitTimeSeconds: this.waitTimeSeconds,
            })
            .promise();
        if (message.Messages) {
            const image = JSON.parse(message.Messages[0].Body) as HordeRequest;
            await this.sqs
                .deleteMessage({
                    QueueUrl: this.queueUrl,
                    ReceiptHandle: message.Messages[0].ReceiptHandle!,
                })
                .promise();
            return image;
        }
        return null;
    }
}

export class MockHordeQueue implements HordeQueue {
    private images: HordeRequest[] = [];

    async submitImage(image: HordeRequest): Promise<void> {
        this.images.push(image);
    }

    async popImage(): Promise<HordeRequest> {
        return this.images.shift();
    }
    init(): Promise<void> {
        return;
    }
}
