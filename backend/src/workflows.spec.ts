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

describe.skip("workflows", () => {
    let backendService: BackendService;
    let server: Server
    let session: Session
    // second user
    let session2: Session;
    let adminSession: Session;
    let privateServiceAccount: Session;
    let privateServiceAccount2: Session;
    let publicServiceAccount: Session;

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
        adminSession = testHelper.createSession()
    })

    afterEach(async () => {
        await server.stop()
        await sleep(100);
    })

    describe("workflows", () => {
        beforeEach(async () => {
            await testHelper.authenticateUser(backendService, session.httpClient, "test@test.test")
            await testHelper.authenticateUser(backendService, session2.httpClient, "test2@test.test")
            await testHelper.authenticateUser(backendService, adminSession.httpClient, "admin@test.test")
            privateServiceAccount = await testHelper.createServiceAccount(session, "private")
            privateServiceAccount2 = await testHelper.createServiceAccount(session2, "private")
            publicServiceAccount = await testHelper.createServiceAccount(adminSession, "public")
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

            describe("when getting the created workflow as different user", () => {

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

                it("should return fail with status 404", async () => {
                    await expect(session2.client.updateWorkflow(createResponse.data.id, {})).rejects.toThrow(/404/);
                });
            });

            describe("when processing the created workflow as a public service account", () => {

                let processResponse: AxiosResponse<Workflow>;

                beforeEach(async () => {
                    processResponse = await publicServiceAccount.client.processWorkflow();
                })

                it("should return the processed workflow", () => {
                    expect(processResponse.data.workflow_type).toEqual('test');
                    expect(processResponse.data.label).toEqual('test');
                    expect(processResponse.data.config_json).toEqual('{}');
                    expect(processResponse.data.data_json).toEqual('{}');
                    expect(processResponse.data.is_active).toEqual(true);
                    expect(processResponse.data.execution_delay).toEqual(60);
                })

            })

            describe("when processing the created workflow as a private service account", () => {
                let processResponse: AxiosResponse<Workflow>;

                beforeEach(async () => {
                    processResponse = await privateServiceAccount.client.processWorkflow();
                })

                it("should return the processed workflow", () => {
                    expect(processResponse.data.workflow_type).toEqual('test');
                    expect(processResponse.data.label).toEqual('test');
                    expect(processResponse.data.config_json).toEqual('{}');
                    expect(processResponse.data.data_json).toEqual('{}');
                    expect(processResponse.data.is_active).toEqual(true);
                    expect(processResponse.data.execution_delay).toEqual(60);
                })
            })

            describe("when processing the created workflow as a private service account of a different user", () => {
                let processResponse: AxiosResponse<Workflow>;

                beforeEach(async () => {
                    processResponse = await privateServiceAccount2.client.processWorkflow();
                })

                it("should return null", () => {
                    expect(processResponse.data).toBeNull();
                })
            });
        });
        
    })
})
