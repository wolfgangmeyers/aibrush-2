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

    describe("workflows", () => {
        let authenticationResult: Authentication;

        beforeEach(async () => {
            authenticationResult = await testHelper.authenticateUser(backendService, session.httpClient, "test@test.test")
        })

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
        describe('when creating a new workflow', () => {
            
            let createResponse: AxiosResponse<Workflow>;

            beforeEach(async () => {
                createResponse = await session.client.createWorkflow(
                    {
                        workflow_type: 'test',
                        label: 'test',
                        config_json: '{}',
                        data_json: '{}',
                        is_active: true,
                        execution_delay: 60,
                        state: 'created',
                    }
                );
            });

            it('should return the created workflow', () => {
                expect(createResponse.data.workflow_type).toEqual('test');
                expect(createResponse.data.label).toEqual('test');
                expect(createResponse.data.config_json).toEqual('{}');
                expect(createResponse.data.data_json).toEqual('{}');
                expect(createResponse.data.is_active).toEqual(true);
                expect(createResponse.data.execution_delay).toEqual(60);
            });

            describe("when listing workflows", () => {
                    
                let workflows: AxiosResponse<WorkflowList>;

                beforeEach(async () => {
                    workflows = await session.client.getWorkflows();
                });

                it('should return the created workflow', () => {
                    expect(workflows.data.workflows).toHaveLength(1);
                    expect(workflows.data.workflows[0].workflow_type).toEqual('test');
                    expect(workflows.data.workflows[0].label).toEqual('test');
                    expect(workflows.data.workflows[0].config_json).toEqual('{}');
                    expect(workflows.data.workflows[0].data_json).toEqual('{}');
                    expect(workflows.data.workflows[0].is_active).toEqual(true);
                    expect(workflows.data.workflows[0].execution_delay).toEqual(60);
                });
            });

            describe("when listing workflows as different user", () => {

                let authResult: Authentication;

                beforeEach(async () => {
                    authResult = await testHelper.authenticateUser(backendService, session2.httpClient, "test2@test.test")
                });

                let workflows: AxiosResponse<WorkflowList>;

                beforeEach(async () => {
                    workflows = await session2.client.getWorkflows();
                });

                it('should return an empty list', () => {
                    expect(workflows.data.workflows).toHaveLength(0);
                });
            });

            describe("when getting the created workflow", () => {
                        
                let getResponse: AxiosResponse<Workflow>;

                beforeEach(async () => {
                    getResponse = await session.client.getWorkflow(createResponse.data.id);
                });

                it('should return the created workflow', () => {
                    expect(getResponse.data.workflow_type).toEqual('test');
                    expect(getResponse.data.label).toEqual('test');
                    expect(getResponse.data.config_json).toEqual('{}');
                    expect(getResponse.data.data_json).toEqual('{}');
                    expect(getResponse.data.is_active).toEqual(true);
                    expect(getResponse.data.execution_delay).toEqual(60);
                });
            });

            describe.only("when getting the created workflow as different user", () => {
                let authResult: Authentication;

                beforeEach(async () => {
                    authResult = await testHelper.authenticateUser(backendService, session2.httpClient, "test2@test.test")
                });

                it("should return fail with status 404", async () => {
                    await expect(session2.client.getWorkflow(createResponse.data.id)).rejects.toThrow(/404/);
                });
            });


            describe("when deleting the created workflow", () => {

                it("should return a normal response", async () => {
                    const response = await session.client.deleteWorkflow(createResponse.data.id);
                    expect(response.status).toEqual(204);
                });
            })

            describe("when deleting the created workflow as different user", () => {
                let authResult: Authentication;

                beforeEach(async () => {
                    authResult = await testHelper.authenticateUser(backendService, session2.httpClient, "test2@test.test")
                });

                it("should return fail with status 404", async () => {
                    await expect(session2.client.deleteWorkflow(createResponse.data.id)).rejects.toThrow(/404/);
                });
            });

            describe("when updating the created workflow", () => {
                            
                let updateResponse: AxiosResponse<Workflow>;

                beforeEach(async () => {
                    updateResponse = await session.client.updateWorkflow(
                        createResponse.data.id,
                        {
                            data_json: '{}',
                            config_json: '{}',
                            is_active: false,
                            state: 'processing',
                            execution_delay: 60
                        }
                    );
                });

                it('should return the updated workflow', () => {
                    expect(updateResponse.data.workflow_type).toEqual('test');
                    expect(updateResponse.data.label).toEqual('test');
                    expect(updateResponse.data.config_json).toEqual('{}');
                    expect(updateResponse.data.data_json).toEqual('{}');
                    expect(updateResponse.data.is_active).toEqual(false);
                    expect(updateResponse.data.execution_delay).toEqual(60);
                });

                describe("when listing workflows", () => {
                    
                    let workflows: AxiosResponse<WorkflowList>;

                    beforeEach(async () => {
                        workflows = await session.client.getWorkflows();
                    });

                    it('should return the updated workflow', () => {
                        expect(workflows.data.workflows).toHaveLength(1);
                        expect(workflows.data.workflows[0].workflow_type).toEqual('test');
                        expect(workflows.data.workflows[0].label).toEqual('test');
                        expect(workflows.data.workflows[0].config_json).toEqual('{}');
                        expect(workflows.data.workflows[0].data_json).toEqual('{}');
                        expect(workflows.data.workflows[0].is_active).toEqual(false);
                        expect(workflows.data.workflows[0].execution_delay).toEqual(60);
                    });
                });

                describe("when getting the updated workflow", () => {
                    
                    let getResponse: AxiosResponse<Workflow>;

                    beforeEach(async () => {
                        getResponse = await session.client.getWorkflow(createResponse.data.id);
                    });

                    it('should return the updated workflow', () => {
                        expect(getResponse.data.workflow_type).toEqual('test');
                        expect(getResponse.data.label).toEqual('test');
                        expect(getResponse.data.config_json).toEqual('{}');
                        expect(getResponse.data.data_json).toEqual('{}');
                        expect(getResponse.data.is_active).toEqual(false);
                        expect(getResponse.data.execution_delay).toEqual(60);
                    })
                });
            })

            describe("when updating the created workflow as different user", () => {
                let authResult: Authentication;

                beforeEach(async () => {
                    authResult = await testHelper.authenticateUser(backendService, session2.httpClient, "test2@test.test")
                });

                it("should return fail with status 404", async () => {
                    await expect(session2.client.updateWorkflow(createResponse.data.id, {})).rejects.toThrow(/404/);
                });
            });

            // TODO: first, add some test helper methods to create public and private service
            // accounts (Session is returned). Then use those accounts to test below cases.

            // TODO: process as public service account
            
            // TODO: process as private service account (authorized)

            // TODO: process as private service account (unauthorized)
        });
        
    })
})