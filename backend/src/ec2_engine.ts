import * as AWS from "aws-sdk";
import * as uuid from "uuid";
import moment from "moment";
import { BackendService } from "./backend";
import { Clock } from "./clock";
import { MetricsClient } from "./metrics";
import { ScalingEngine } from "./scaling_engine";
import Bugsnag from "@bugsnag/js";

export const SCALEDOWN_COOLDOWN = moment.duration(10, "minutes");
export const TYPE_EC2 = "ec2";
const WORKER_COMMAND = "/app/aibrush-2/worker/images_worker.sh";
const WORKER_IMAGE = "wolfgangmeyers/aibrush:latest";
export const EC2_SCALING_EVENT = "ec2_scaling_event";

export class Ec2Engine implements ScalingEngine {
    constructor(
        private ec2Client: EC2Client,
        private backend: BackendService,
        private clock: Clock,
        private metricsClient: MetricsClient,
        private region: string
    ) {}

    async capacity(): Promise<number> {
        return 60;
    }
    async scale(activeOrders: number): Promise<number> {
        console.log("scaling EC2 to ", activeOrders);
        const lastScalingOperation = await this.backend.getLastEventTime(
            EC2_SCALING_EVENT
        );
        this.metricsClient.addMetric(
            "ec2_engine.scale",
            activeOrders,
            "gauge",
            {}
        );
        const workers = (await this.backend.listWorkers()).filter(
            (worker) => worker.engine == TYPE_EC2 && worker.gpu_type === "A10G"
        );
        let scaled = false;
        while (workers.length < activeOrders) {
            scaled = true;
            const tags: any = {
                operation_type: "create",
            };
            // create new worker
            const worker = await this.backend.createWorker("EC2 Worker");
            try {
                const workerLoginCode =
                    await this.backend.generateWorkerLoginCode(worker.id);
                const reservation = await this.ec2Client.createInstance(
                    this.region,
                    workerLoginCode.login_code
                );
                const instanceId = reservation.Instances[0].InstanceId;
                workers.push(
                    await this.backend.updateWorkerDeploymentInfo(
                        worker.id,
                        TYPE_EC2,
                        1,
                        instanceId,
                        "A10G",
                    )
                );
            } catch (err) {
                tags.error = err.message;
                Bugsnag.notify(err, (evt) => {
                    evt.context = "EC2Engine.createInstance";
                });
                await this.backend.deleteWorker(worker.id);
                break;
            } finally {
                this.metricsClient.addMetric(
                    "ec2_engine.create",
                    1,
                    "count",
                    tags
                );
            }
        }
        if (
            this.clock.now().diff(lastScalingOperation, "milliseconds") >=
            SCALEDOWN_COOLDOWN.asMilliseconds()
        ) {
            while (workers.length > activeOrders) {
                scaled = true;
                const tags: any = {
                    operation_type: "destroy",
                };
                // destroy worker
                const worker = workers.pop();
                if (!worker) {
                    break;
                }
                try {
                    await this.ec2Client.destroyInstance(
                        this.region,
                        worker.cloud_instance_id
                    );
                    await this.backend.deleteWorker(worker.id);
                } catch (err) {
                    tags.error = err.message;
                    throw err;
                } finally {
                    this.metricsClient.addMetric(
                        "ec2_engine.destroy",
                        1,
                        "count",
                        tags
                    );
                }
            }
        }

        if (scaled) {
            await this.backend.setLastEventTime(
                EC2_SCALING_EVENT,
                this.clock.now().valueOf()
            );
        }
        return workers.length;
    }
}

export interface EC2Client {
    createInstance(
        region: string,
        workerLoginCode: string
    ): Promise<AWS.EC2.Reservation>;

    destroyInstance(region: string, instanceId: string): Promise<void>;
}

export class EC2ClientImpl implements EC2Client {
    async createInstance(
        region: string,
        workerLoginCode: string
    ): Promise<AWS.EC2.Reservation> {
        let commandsString = `#!/bin/bash
docker pull ${WORKER_IMAGE}
docker run -e 'WORKER_LOGIN_CODE=${workerLoginCode}' --gpus all ${WORKER_IMAGE} ${WORKER_COMMAND}
`;
        const ec2 = new AWS.EC2({ region });
        const result = await ec2
            .runInstances({
                MinCount: 1,
                MaxCount: 1,
                LaunchTemplate: {
                    LaunchTemplateId: process.env.EC2_LAUNCH_TEMPLATE_ID,
                },
                UserData: Buffer.from(commandsString).toString("base64"),
            })
            .promise();
        if (result.$response.error) {
            throw result.$response.error;
        }
        return result;
    }

    async destroyInstance(region: string, instanceId: string): Promise<void> {
        const ec2 = new AWS.EC2({ region });
        await ec2
            .terminateInstances({
                InstanceIds: [instanceId],
            })
            .promise();
    }

    // private async listInstances(): Promise<Array<AWS.EC2.Instance>> {
    //     const ec2 = new AWS.EC2({ region: this.region });
    //     const instances = await ec2.describeInstances().promise();
    //     return instances.Reservations.flatMap((reservation) => reservation.Instances);
    // }
}

export class FakeEC2Client implements EC2Client {

    provisionError: any = null;

    constructor(public _instances: Array<AWS.EC2.Instance>) {}

    async createInstance(
        region: string,
        workerLoginCode: string
    ): Promise<AWS.EC2.Reservation> {
        if (this.provisionError) {
            throw this.provisionError;
        }
        this._instances.push({
            InstanceId: uuid.v4(),
            region: region,
            workerLoginCode: workerLoginCode,
        } as any);
        return {
            Instances: [this._instances[this._instances.length - 1]],
        } as AWS.EC2.Reservation;
    }

    async destroyInstance(region: string, instanceId: string): Promise<void> {
        this._instances = this._instances.filter(
            (instance) => instance.InstanceId != instanceId
        );
        return;
    }
}
