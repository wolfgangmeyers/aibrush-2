import * as uuid from 'uuid'
import moment from 'moment'
import axios, { AxiosResponse } from "axios"
import fs from "fs"

import { Server } from "./server"
import { BackendService } from "./backend"
import { AIBrushApi, Job, JobInput, JobList, JobResult, JobResultList, ImageList, Image, JobTarget } from "./client/api"

describe("server", () => {
    let server: Server
    let client: AIBrushApi

    beforeAll(async () => {
        const backendService = new BackendService("", "")
        const databases = await backendService.listDatabases()
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db)
            }
        }
    })

    beforeEach(async () => {
        // remove all files in data folder
        try {
            const files = fs.readdirSync("./data_test")
            for (const file of files) {
                fs.unlinkSync("./data/" + file)
            }
        } catch {}


        const sockfile = `/tmp/aibrush-backend-${uuid.v4()}.sock`

        const databaseName = `aibrush_test_${moment().valueOf()}`
        const backendService = new BackendService(databaseName, "data_test")

        server = new Server(backendService, sockfile)
        await server.init()
        await server.start()

        const httpClient = axios.create({
            socketPath: sockfile, headers: {

            }
        })
        client = new AIBrushApi(undefined, "", httpClient)
    })

    afterEach(async () => {
        await server.stop()
    })

    describe("when the database is empty", () => {
        describe("when listing jobs", () => {
            let jobsResult: AxiosResponse<JobList>

            beforeEach(async () => {
                jobsResult = await client.listJobs()
            })

            it("should return an empty list", () => {
                expect(jobsResult.data.jobs).toEqual([])
            })
        })
    })

    describe("when getting a job that doesn't exist", () => {
        let jobResult: AxiosResponse<Job>

        beforeEach(async () => {
            jobResult = await client.getJob(uuid.v4())
        })

        it("should return null", () => {
            expect(jobResult.data).toBeNull()
        })
    })

    describe("when creating a job", () => {
        let createResult: AxiosResponse<Job>

        const jobInput: JobInput = {
            phrases: ["test job"],
            inverse_phrases: ["bad stuff"],
            label: "test job",
            count: 5,
            iterations: 1,
            parent: uuid.v4(),
        }

        beforeEach(async () => {
            createResult = await client.createJob(jobInput)
        })

        it("should return the created job", () => {
            // check id and created
            expect(createResult.data.id).toBeTruthy()
            expect(createResult.data.created).toBeTruthy()
            // check input
            expect(createResult.data.label).toBe("test job")
            expect(createResult.data.parent).toBe(jobInput.parent)
            expect(createResult.data.phrases).toEqual(jobInput.phrases)
            expect(createResult.data.inverse_phrases).toEqual(jobInput.inverse_phrases)
            expect(createResult.data.count).toEqual(jobInput.count)
            expect(createResult.data.iterations).toEqual(jobInput.iterations)
        })

        describe("when listing jobs", () => {
            let jobsResult: AxiosResponse<JobList>

            beforeEach(async () => {
                jobsResult = await client.listJobs()
            })

            it("should return the created job", () => {
                expect(jobsResult.data.jobs).toEqual([createResult.data])
            })
        })

        describe("when listing job results", () => {
            let jobResults: AxiosResponse<JobResultList>

            beforeEach(async () => {
                jobResults = await client.listJobResults(createResult.data.id)
            })

            it("should return an empty list", () => {
                expect(jobResults.data.results).toEqual([])
            })
        })

        describe("when getting new job tasks", () => {
            let jobTasks: Array<Job>

            beforeEach(async () => {
                jobTasks = []
                let jobTask = (await client.getJobTask(createResult.data.id)).data
                while (jobTask) {
                    jobTasks.push(jobTask)
                    jobTask = (await client.getJobTask(createResult.data.id)).data
                }
            })

            it("should get the correct count of new tasks", () => {
                expect(jobTasks.length).toEqual(jobInput.count)
            })
        })

        describe("when cancelling a job", () => {

            beforeEach(async () => {
                await client.cancelJob(createResult.data.id)
            })

            describe("when getting a job", () => {
                let jobResult: AxiosResponse<Job>

                beforeEach(async () => {
                    jobResult = await client.getJob(createResult.data.id)
                })

                it("should be cancelled", () => {
                    expect(jobResult.data.cancelled).toBeTruthy()
                })
            })

            // after cancelling a job, no tasks should be returned for it
            describe("when listing job tasks", () => {
                let jobTasks: Array<Job>

                beforeEach(async () => {
                    jobTasks = []
                    let jobTask = (await client.getJobTask(createResult.data.id)).data
                    while (jobTask) {
                        jobTasks.push(jobTask)
                        jobTask = (await client.getJobTask(createResult.data.id)).data
                    }
                })

                it("should return an empty list", () => {
                    expect(jobTasks).toEqual([])
                })
            })
        })

        // when a job target is unset / when getting a job target
        describe("when getting a job target that is unset", () => {
            let jobTarget: JobTarget

            beforeEach(async () => {
                jobTarget = (await client.getJobTarget(createResult.data.id)).data
            })

            it("should return null", () => {
                expect(jobTarget).toBeNull()
            })
        })

        describe("when setting a job target", () => {
            let jobTarget: JobTarget

            beforeEach(async () => {
                jobTarget = {
                    image: "asdf"
                }
                await client.setJobTarget(createResult.data.id, jobTarget)
            })

            describe("when getting a job target", () => {
                let jobTargetResult: AxiosResponse<JobTarget>

                beforeEach(async () => {
                    jobTargetResult = await client.getJobTarget(createResult.data.id)
                })

                it("should return the job target", () => {
                    expect(jobTargetResult.data).toEqual(jobTarget)
                })
            })
            // get job target and verify that it is the same
            describe("when getting job target", () => {
                let jobTargetResult: AxiosResponse<JobTarget>

                beforeEach(async () => {
                    jobTargetResult = await client.getJobTarget(createResult.data.id)
                })

                it("should return the job target", () => {
                    expect(jobTargetResult.data).toEqual(jobTarget)
                })
            })

            // after a job has been deleted
            describe("after job has been deleted", () => {

                beforeEach(async () => {
                    await client.deleteJob(createResult.data.id)
                })

                // make sure job target is deleted as well
                describe("when getting a job target", () => {
                    let jobTarget: JobTarget

                    beforeEach(async () => {
                        jobTarget = (await client.getJobTarget(createResult.data.id)).data
                    })

                    it("should return null", () => {
                        expect(jobTarget).toBeNull()
                    })
                })
            })
        })

        describe("when deleting a job", () => {
            let deleteResult: AxiosResponse<void>

            beforeEach(async () => {
                deleteResult = await client.deleteJob(createResult.data.id)
            })

            it("should return the deleted job", () => {
                expect(deleteResult.data).toEqual("")
            })

            describe("when listing jobs", () => {
                let jobsResult: AxiosResponse<JobList>

                beforeEach(async () => {
                    jobsResult = await client.listJobs()
                })

                it("should return an empty list", () => {
                    expect(jobsResult.data.jobs).toEqual([])
                })
            })


        })
    })

    describe("when submitting job results", () => {
        let job: Job
        let jobResult: AxiosResponse<JobResult>

        beforeEach(async () => {
            const createResult = await client.createJob({
                phrases: ["test job"],
                label: "test job",
                count: 1,
                iterations: 1,
                parent: uuid.v4(),
            })
            job = createResult.data
            jobResult = await client.submitJobResult(job.id, {
                encoded_image: "asdf",
                encoded_latents: "asdf",
                encoded_thumbnail: "asdf",
                score: 0.5,
            })
        })

        it("should return the created job result", () => {
            // check id and created
            expect(jobResult.data.id).toBeTruthy()
            expect(jobResult.data.created).toBeTruthy()
            // check input
            expect(jobResult.data.phrases).toEqual(job.phrases)
            expect(jobResult.data.encoded_image).toBeUndefined()
            expect(jobResult.data.encoded_latents).toBeUndefined()
            expect(jobResult.data.encoded_thumbnail).toBeUndefined()
            expect(jobResult.data.score).toEqual(0.5)
        })

        describe("when listing job results", () => {
            let jobResults: AxiosResponse<JobResultList>

            beforeEach(async () => {
                jobResults = await client.listJobResults(job.id)
            })

            it("should return the created job result", () => {
                expect(jobResults.data.results).toEqual([{
                    ...jobResult.data,
                    // image and latents aren't included in the list response
                    encoded_image: undefined,
                    encoded_latents: undefined,
                    encoded_thumbnail: undefined,
                }])
            })
        })

        describe("when getting a job result by id with no download option", () => {
            let getResult: AxiosResponse<JobResult>

            beforeEach(async () => {
                getResult = await client.getJobResult(jobResult.data.id)
            })

            it("should return the created job result", () => {
                expect(getResult.data).toEqual({
                    ...jobResult.data,
                    encoded_image: undefined,
                    encoded_latents: undefined,
                    encoded_thumbnail: undefined,
                })
            })
        })

        // get job result by id with image option
        describe("when getting a job result by id with image option", () => {
            let getResult: AxiosResponse<JobResult>

            beforeEach(async () => {
                getResult = await client.getJobResult(jobResult.data.id, "image")
            })

            it("should return the created job result", () => {
                expect(getResult.data).toEqual({
                    ...jobResult.data,
                    encoded_image: "asdf",
                    encoded_latents: undefined,
                    encoded_thumbnail: undefined,
                })
            })
        })

        // get job result by id with latents option
        describe("when getting a job result by id with latents option", () => {
            let getResult: AxiosResponse<JobResult>

            beforeEach(async () => {
                getResult = await client.getJobResult(jobResult.data.id, "latents")
            })

            it("should return the created job result", () => {
                expect(getResult.data).toEqual({
                    ...jobResult.data,
                    encoded_image: undefined,
                    encoded_latents: "asdf",
                    encoded_thumbnail: undefined,
                })
            })
        })

        describe("when getting a job result by id with thumbnail download option", () => {
            let getResult: AxiosResponse<JobResult>

            beforeEach(async () => {
                getResult = await client.getJobResult(jobResult.data.id, "thumbnail")
            })

            it("should return the created job result", () => {
                expect(getResult.data).toEqual({
                    ...jobResult.data,
                    encoded_image: undefined,
                    encoded_latents: undefined,
                    encoded_thumbnail: "asdf",
                })
            })
        })

        describe("when deleting a job result", () => {
            let deleteResult: AxiosResponse<void>

            beforeEach(async () => {
                deleteResult = await client.deleteJobResult(jobResult.data.id)
            })

            it("should return the deleted job result", () => {
                expect(deleteResult.data).toEqual("")
            })

            describe("when listing job results", () => {
                let jobResults: AxiosResponse<JobResultList>

                beforeEach(async () => {
                    jobResults = await client.listJobResults(job.id)
                })

                it("should return an empty list", () => {
                    expect(jobResults.data.results).toEqual([])
                })
            })
        })

        describe("when deleting a parent job with results", () => {
            beforeEach(async () => {
                await client.deleteJob(job.id)
            })

            describe("when getting job result", () => {
                let getResult: AxiosResponse<JobResult>

                beforeEach(async () => {
                    getResult = await client.getJobResult(jobResult.data.id)
                })

                it("should return 404", () => {
                    expect(getResult.data).toBeNull()
                })
            })

            describe("when checking data folder", () => {
                // list files in ./data folder, should be an empty list.
                it("should return an empty list", async () => {
                    const files = fs.readdirSync("./data")
                    expect(files).toEqual([])
                })
            })
        })

        describe("when saving a job result", () => {
            beforeEach(async () => {
                await client.saveJobResult(jobResult.data.id)
            })

            describe("when listing job results", () => {
                let jobResults: AxiosResponse<JobResultList>

                beforeEach(async () => {
                    jobResults = await client.listJobResults(job.id)
                })

                it("should return the created job result", () => {
                    // the job result is deleted because it has been converted
                    // into a saved image
                    expect(jobResults.data.results).toEqual([])
                })
            })

            describe("when listing images", () => {
                let images: AxiosResponse<ImageList>

                beforeEach(async () => {
                    images = await client.listImages()
                })

                it("should return the created image", () => {
                    expect(images.data.images).toEqual([{
                        ...jobResult.data,
                        job_id: undefined,
                        label: "untitled",
                        score: undefined,
                        encoded_image: undefined,
                        encoded_latents: undefined,
                        encoded_thumbnail: undefined,
                    }])
                })
            })

            // get image by id with no download option
            describe("when getting an image by id with no download option", () => {
                let getResult: AxiosResponse<Image>

                beforeEach(async () => {
                    getResult = await client.getImage(jobResult.data.id)
                })

                it("should return the created image", () => {
                    expect(getResult.data).toEqual({
                        id: jobResult.data.id,
                        phrases: jobResult.data.phrases,
                        inverse_phrases: [],
                        label: "untitled",
                        created: jobResult.data.created,
                    })
                })
            })

            // get imgae ny id with image option
            describe("when getting an image by id with image download option", () => {

                let getResult: AxiosResponse<Image>

                beforeEach(async () => {
                    getResult = await client.getImage(jobResult.data.id, "image")
                })

                it("should return the created image", () => {
                    expect(getResult.data).toEqual({
                        id: jobResult.data.id,
                        phrases: jobResult.data.phrases,
                        inverse_phrases: [],
                        label: "untitled",
                        created: jobResult.data.created,
                        encoded_image: "asdf",
                    })
                })

            })

            // get image by id with latents download option
            describe("when getting an image by id with latents download option", () => {
                let getResult: AxiosResponse<Image>

                beforeEach(async () => {
                    getResult = await client.getImage(jobResult.data.id, "latents")
                })

                it("should return the created image", () => {
                    expect(getResult.data).toEqual({
                        id: jobResult.data.id,
                        phrases: jobResult.data.phrases,
                        inverse_phrases: [],
                        label: "untitled",
                        created: jobResult.data.created,
                        encoded_latents: "asdf",
                    })
                })
            })

            // get image by id with thumbnail download option
            describe("when getting an image by id with thumbnail download option", () => {
                let getResult: AxiosResponse<Image>

                beforeEach(async () => {
                    getResult = await client.getImage(jobResult.data.id, "thumbnail")
                })

                it("should return the created image", () => {
                    expect(getResult.data).toEqual({
                        id: jobResult.data.id,
                        phrases: jobResult.data.phrases,
                        inverse_phrases: [],
                        label: "untitled",
                        created: jobResult.data.created,
                        encoded_thumbnail: "asdf",
                    })
                })
            })

            describe("when deleting an image", () => {
                let deleteResult: AxiosResponse<void>

                beforeEach(async () => {
                    deleteResult = await client.deleteImage(jobResult.data.id)
                })

                it("should return the deleted image", () => {
                    expect(deleteResult.data).toEqual("")
                })

                describe("when listing images", () => {
                    let images: AxiosResponse<ImageList>

                    beforeEach(async () => {
                        images = await client.listImages()
                    })

                    it("should return an empty list", () => {
                        expect(images.data.images).toEqual([])
                    })
                })
            })
        })
    })
})