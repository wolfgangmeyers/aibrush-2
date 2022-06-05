import moment from 'moment'
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios"
import fs from "fs"
import path from "path"

import { Server } from "./server"
import { BackendService } from "./backend"
import {
    AIBrushApi,
    Workflow,
    WorkflowList,
    WorkflowEvent,
    WorkflowEventList,
} from "./client/api"

// import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from './config'
import { Authentication, hash } from './auth'
import { sleep } from './sleep'
import { Session, TestHelper } from './testHelper'

jest.setTimeout(60000);

describe("workflows", () => {
    let backendService: BackendService;
    let server: Server
    let session: Session
    // second user
    let session2: Session;
    let databaseName: string;

    let testHelper: TestHelper;

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config);
        server = new Server(config, backendService, 35456)
        await server.init()
        await server.start()
        session = testHelper.createSession()
        session2 = testHelper.createSession()
    })

    afterEach(async () => {
        await server.stop()
        await sleep(100);
    })

    describe.only("workflows", () => {
        let authenticationResult: Authentication;

        beforeEach(async () => {
            authenticationResult = await testHelper.authenticateUser(backendService, session.httpClient, "test@test.test")
        })

    //     /api/workflows:
    //     get:
    //       description: Get the workflows
    //       operationId: getWorkflows
    //       tags:
    //         - AIBrush
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/WorkflowList"
    //     post:
    //       description: Create a new workflow
    //       operationId: createWorkflow
    //       tags:
    //         - AIBrush
    //       requestBody:
    //         content:
    //           application/json:
    //             schema:
    //               $ref: "#/components/schemas/CreateWorkflowInput"
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/Workflow"
    //   /api/workflows/{workflow_id}:
    //     get:
    //       description: Get the workflow
    //       operationId: getWorkflow
    //       tags:
    //         - AIBrush
    //       parameters:
    //         - name: workflow_id
    //           in: path
    //           required: true
    //           schema:
    //             type: string
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/Workflow"
    //     put:
    //       description: Update the workflow
    //       operationId: updateWorkflow
    //       tags:
    //         - AIBrush
    //       parameters:
    //         - name: workflow_id
    //           in: path
    //           required: true
    //           schema:
    //             type: string
    //       requestBody:
    //         content:
    //           application/json:
    //             schema:
    //               $ref: "#/components/schemas/UpdateWorkflowInput"
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/Workflow"
    //     delete:
    //       description: Delete the workflow
    //       operationId: deleteWorkflow
    //       tags:
    //         - AIBrush
    //       parameters:
    //         - name: workflow_id
    //           in: path
    //           required: true
    //           schema:
    //             type: string
    //       responses:
    //         "204":
    //           description: Success
    //   /api/workflows/{workflow_id}/events:
    //     get:
    //       description: Get the workflow events
    //       operationId: getWorkflowEvents
    //       tags:
    //         - AIBrush
    //       parameters:
    //         - name: workflow_id
    //           in: path
    //           required: true
    //           schema:
    //             type: string
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/WorkflowEventList"
    //     post:
    //       description: Create a new workflow event
    //       operationId: createWorkflowEvent
    //       tags:
    //         - AIBrush
    //       parameters:
    //         - name: workflow_id
    //           in: path
    //           required: true
    //           schema:
    //             type: string
    //       requestBody:
    //         content:
    //           application/json:
    //             schema:
    //               $ref: "#/components/schemas/CreateWorkflowEventInput"
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/WorkflowEvent"
    //   /api/process-workflow:
    //     put:
    //       description: Get the next pending workflow and set its status to processing.
    //       operationId: processWorkflow
    //       tags:
    //         - AIBrush
    //       responses:
    //         "200":
    //           description: Success
    //           content:
    //             application/json:
    //               schema:
    //                 $ref: "#/components/schemas/Workflow"
    // Workflow:
    //   type: object
    //   properties:
    //     id:
    //       type: string
    //     created_by:
    //       type: string
    //     workflow_type:
    //       type: string
    //     state:
    //       type: string
    //     config_json:
    //       type: string
    //     data_json:
    //       type: string
    //     is_active:
    //       type: boolean
    //     execution_delay:
    //       type: integer
    //     next_execution:
    //       type: integer
    // WorkflowList:
    //   properties:
    //     workflows:
    //       type: array
    //       items:
    //         $ref: "#/components/schemas/Workflow"
    //   required:
    //     - workflows
    // UpdateWorkflowInput:
    //   type: object
    //   properties:
    //     data_json:
    //       type: string
    //     config_json:
    //       type: string
    //     is_active:
    //       type: boolean
    //     state:
    //       type: string
    //     execution_delay:
    //       type: integer
    // CreateWorkflowInput:
    //   type: object
    //   properties:
    //     workflow_type:
    //       type: string
    //     config_json:
    //       type: string
    //     data_json:
    //       type: string
    //     is_active:
    //       type: boolean
    //     execution_delay:
    //       type: integer
    // WorkflowEvent:
    //   type: object
    //   properties:
    //     id:
    //       type: string
    //     workflow_id:
    //       type: string
    //     created_at:
    //       type: integer
    //     message:
    //       type: string
    // WorkflowEventList:
    //   properties:
    //     workflowEvents:
    //       type: array
    //       items:
    //         $ref: "#/components/schemas/WorkflowEvent"
    //   required:
    //     - workflowEvents
    // CreateWorkflowEventInput:
    //   type: object
    //   properties:
    //     workflow_id:
    //       type: string
    //     message:
    //       type: string

    // test cases
        // when listing workflows in an empty database
        describe('when listing workflows in an empty database', () => {

            let workflows: AxiosResponse<WorkflowList>;

            beforeEach(async () => {
                workflows = await session.client.getWorkflows();
            });

            it('should return an empty list', () => {
                expect(workflows.data.workflows).toHaveLength(0);
            });
        });
        // when creating a new workflow
        
    })
})