import * as AWS from 'aws-sdk';
import { Image } from './client';
import { HordeRequest, SQSHordeQueue } from "./horde_queue";

describe("SQSHordeQueue", () => {
    let queue: SQSHordeQueue;

    beforeEach(async () => {
        queue = new SQSHordeQueue("test-queue", {
            endpoint: new AWS.Endpoint("http://localhost:4566"),
            region: "us-west-2",
        }, 0.1);
        await queue.init();
    });

    describe("when calling popImage on an empty queue", () => {
        let image: HordeRequest;

        beforeEach(async () => {
            image = await queue.popImage();
        });

        it("should return null", () => {
            expect(image).toBeNull();
        });
    })

    describe("when submitting an image", () => {
        let image: HordeRequest;

        beforeEach(async () => {
            image = {
                authToken: "asdf",
                imageId: "asdf",
            } as any;
            await queue.submitImage(image);
        });

        describe("when calling popImage", () => {
            let poppedImage: HordeRequest;

            beforeEach(async () => {
                poppedImage = await queue.popImage();
            });

            it("should return the image", () => {
                expect(poppedImage).toEqual(image);
            });

            describe("when calling popImage again", () => {
                let poppedImage2: HordeRequest;

                beforeEach(async () => {
                    poppedImage2 = await queue.popImage();
                });

                it("should return null", () => {
                    expect(poppedImage2).toBeNull();
                });
            });
        })
    })
})