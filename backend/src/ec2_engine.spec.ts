import moment from "moment";
import { hash } from "./auth";
import { BackendService } from "./backend"
import { FakeClock } from "./clock";
import { Ec2Engine, EC2_SCALING_EVENT, FakeEC2Client, TYPE_EC2 } from "./ec2_engine";
import { MetricsClient } from "./metrics";
import { TestHelper } from "./testHelper";

describe("EC2Engine", () => {
    let backendService: BackendService;
    let ec2Engine: Ec2Engine;
    let testHelper: TestHelper;
    let databaseName: string;
    let mockEc2Client: FakeEC2Client;
    let clock: FakeClock;

    const adminId = hash("admin@test.test")

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config, new MetricsClient(""));
        await backendService.init();
        mockEc2Client = new FakeEC2Client([]);
        clock = new FakeClock(moment());
        // vastEngine = new VastEngine(mockVastClient, backendService, "wolfgangmeyers/aibrush:latest", clock, new MetricsClient(""));
        ec2Engine = new Ec2Engine(mockEc2Client, backendService, clock, new MetricsClient(""), "us-west-2");
        await backendService.createUser("admin@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
    });

    describe("scale to 0, 0 workers", () => {
        it("should not scale", async () => {
            await ec2Engine.scale(0);
            expect(mockEc2Client._instances.length).toBe(0);
            const lastEventTime = await backendService.getLastEventTime(EC2_SCALING_EVENT);
            expect(lastEventTime).toBe(0);
        });
    });

    describe("scale to 1, 0 workers", () => {
        it("should scale", async () => {
            await ec2Engine.scale(1);
            expect(mockEc2Client._instances.length).toBe(1);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(1);
            expect(workers[0].engine).toBe(TYPE_EC2);
            expect(workers[0].num_gpus).toBe(1);
            expect(workers[0].cloud_instance_id).toBe(mockEc2Client._instances[0].InstanceId);
            const lastEventTime = await backendService.getLastEventTime(EC2_SCALING_EVENT);
            expect(lastEventTime).toBe(clock.now().valueOf());
        });
    })

    describe("scale to 1, 1 workers", () => {
        it("should not scale", async () => {
            let worker = await backendService.createWorker("EC2 Worker");
            worker = await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_EC2,
                1,
                "i-1234567890"
            )
            mockEc2Client._instances.push({
                InstanceId: "i-1234567890",
            });
            await ec2Engine.scale(1);
            expect(mockEc2Client._instances.length).toBe(1);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(1);
        });
    })

    describe("scale to 0, 1 workers", () => {
        it("should scale", async () => {
            let worker = await backendService.createWorker("EC2 Worker");
            worker = await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_EC2,
                1,
                "i-1234567890"
            )
            mockEc2Client._instances.push({
                InstanceId: "i-1234567890",
            });
            await ec2Engine.scale(0);
            expect(mockEc2Client._instances.length).toBe(0);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(0);
        });
    })

    describe("scale to 0, 1 workers (TYPE_VASTAI)", () => {
        it("should not scale", async () => {
            let worker = await backendService.createWorker("EC2 Worker");
            worker = await backendService.updateWorkerDeploymentInfo(
                worker.id,
                "VASTAI",
                1,
                "i-1234567890"
            )
            mockEc2Client._instances.push({
                InstanceId: "i-1234567890",
            });
            await ec2Engine.scale(0);
            expect(mockEc2Client._instances.length).toBe(1);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(1);
        });
    })

    describe("scale to 60, 1 workers", () => {
        it("should scale", async () => {
            let worker = await backendService.createWorker("EC2 Worker");
            worker = await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_EC2,
                1,
                "i-1234567890"
            )
            mockEc2Client._instances.push({
                InstanceId: "i-1234567890",
            });
            await ec2Engine.scale(60);
            expect(mockEc2Client._instances.length).toBe(60);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(60);
        });
    })

    describe("scale to 1, 60 workers", () => {
        it("should scale", async () => {
            for (let i = 0; i < 60; i++) {
                let worker = await backendService.createWorker("EC2 Worker");
                const instanceId = `i-${i}`;
                worker = await backendService.updateWorkerDeploymentInfo(
                    worker.id,
                    TYPE_EC2,
                    1,
                    instanceId
                )
                mockEc2Client._instances.push({
                    InstanceId: instanceId,
                });
            }
            await ec2Engine.scale(1);
            expect(mockEc2Client._instances.length).toBe(1);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(1);
        });
    })

    describe("scale to 0, 1 workers, scaldown cooldown in effect", () => {
        it("should not scale", async () => {
            let worker = await backendService.createWorker("EC2 Worker");
            worker = await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_EC2,
                1,
                "i-1234567890"
            )
            mockEc2Client._instances.push({
                InstanceId: "i-1234567890",
            });
            await backendService.setLastEventTime(EC2_SCALING_EVENT, clock.now().valueOf());
            await ec2Engine.scale(0);
            expect(mockEc2Client._instances.length).toBe(1);
            const workers = await backendService.listWorkers();
            expect(workers.length).toBe(1);
        });
    })

    describe("capacity", () => {
        it("should return 60", async () => {
            expect(await ec2Engine.capacity()).toBe(60);
        });
    })
})
