import * as AWS from 'aws-sdk';

export class Ec2Engine {
    constructor(private regions: Array<string>) {
    }

    async listInstancesByRegion(): Promise<Array<{ region: string, instances: Array<AWS.EC2.Instance> }>> {
        const promises = this.regions.map(async (region) => {
            const ec2 = new AWS.EC2({ region });
            const instances = await ec2.describeInstances().promise();
            return {
                region,
                instances: instances.Reservations.flatMap((reservation) => reservation.Instances),
            };
        });
        return Promise.all(promises);
    }

    async createInstance(region: string, workerLoginCode: string): Promise<AWS.EC2.Reservation> {
        let commandsString = `#!/bin/bash
docker pull wolfgangmeyers/aibrush:latest
docker run -e 'WORKER_LOGIN_CODE=${workerLoginCode}' --gpus all wolfgangmeyers/aibrush:latest /app/aibrush-2/worker/images_worker.sh
`;
        const ec2 = new AWS.EC2({ region });
        const result = await ec2.runInstances({
            MinCount: 1,
            MaxCount: 1,
            LaunchTemplate: {
                LaunchTemplateId: process.env.EC2_LAUNCH_TEMPLATE_ID,
            },
            UserData: Buffer.from(commandsString).toString('base64'),
        }).promise()
        if (result.$response.error) {
            throw result.$response.error;
        }
        return result;
    }

    async destroyInstance(region: string, instanceId: string): Promise<void> {
        const ec2 = new AWS.EC2({ region });
        await ec2.terminateInstances({
            InstanceIds: [instanceId],
        }).promise();
    }
}