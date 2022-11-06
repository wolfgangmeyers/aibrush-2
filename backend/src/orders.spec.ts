import { BackendService } from "./backend";
import { Order, OrderList } from "./client";
import { MetricsClient } from "./metrics";
import { Server } from "./server";
import { sleep } from "./sleep";
import { Session, TestHelper } from "./testHelper";

jest.setTimeout(60000);

describe("orders", () => {
    let backendService: BackendService;
    let server: Server;
    let testHelper: TestHelper;
    let session: Session;
    let adminSession: Session;
    let databaseName: string;

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config, new MetricsClient(""));
        server = new Server(
            config,
            backendService,
            35456,
            new MetricsClient("")
        );
        await server.init();
        await server.start();
        session = testHelper.createSession();
        adminSession = testHelper.createSession();
        await backendService.createUser("admin@test.test");
    });

    afterEach(async () => {
        await server.stop();
        await sleep(100);
    });

    beforeEach(async () => {
        await testHelper.authenticateUser(
            backendService,
            session.httpClient,
            "test@test.test"
        );
        await testHelper.authenticateUser(
            backendService,
            adminSession.httpClient,
            "admin@test.test"
        );
    });

    describe("listing orders in an empty database as admin", () => {
        let orderList: OrderList;

        beforeEach(async () => {
            orderList = (await adminSession.client.getOrders()).data;
        });

        it("should return an empty list", () => {
            expect(orderList.orders).toHaveLength(0);
        });
    })

    describe("creating an order as admin", () => {
        let order: Order;

        beforeEach(async () => {
            order = (await adminSession.client.createOrder({
                hours: 1,
                gpu_count: 1,
            })).data;
        });

        it("should return the order", () => {
            expect(order.id).toBeDefined();
            expect(order.gpu_count).toBe(1);
            expect(order.created_at).toBeDefined();
            expect(order.ends_at).toBeDefined();
            expect(order.is_active).toBe(true);
            expect(order.amount_paid_cents).toEqual(0);

            expect(order.ends_at - order.created_at).toBe(3600 * 1000);
        })

        describe("listing orders as admin", () => {
            let orderList: OrderList;

            beforeEach(async () => {
                orderList = (await adminSession.client.getOrders()).data;
            });

            it("should return the order", () => {
                expect(orderList.orders).toHaveLength(1);
                expect(orderList.orders[0].id).toBe(order.id);
            });
        })
    })
})