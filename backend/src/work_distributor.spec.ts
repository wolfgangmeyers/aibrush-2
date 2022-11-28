import moment from "moment";
import { WorkerConfig } from "./client";
import { calculateWorkDistribution, PendingImages, Worker } from "./work_distributor";

describe("Work Distribution Calculations", () => {

    describe("no pending images, no workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([], [], []);
            expect(result).toEqual([]);
        });
    })

    describe("no pending images, one worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }]);
            expect(result).toEqual([]);
        });
    });

    describe("one pending image, no workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [], []);
            expect(result).toEqual([]);
        });
    });

    describe("no pending images and three balanced workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker2",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker3",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }, {
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }, {
                worker_id: "worker3",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "swinir",
                }],
            }]);
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and three balanced workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker2",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker3",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }, {
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }, {
                worker_id: "worker3",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "swinir",
                }],
            }]);
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and one 3-gpu balanced worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 3,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_inpainting",
                }, {
                    gpu_num: 2,
                    model: "swinir",
                }],
            }]);
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and one matching worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }]);
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and one non-matching worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }]);
            expect(result).toEqual([{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }]);
        });
    });

    // if only 2 workers, they are allocated as needed. Once 3 workers is hit,
    // the system will try to keep one of each model going and allocate the remainder
    // as needed.
    describe("one pending image, one matching worker, one non-matching worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker2",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }, {
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }]);
            expect(result).toEqual([{
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }]);
        });
    });

    describe("one pending image, one available non-matching worker", () => {
        // create a balanced 3gpu worker, and one gpu with the wrong model
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 3,
                last_ping: moment().valueOf(),
                status: "idle",
            }, {
                id: "worker2",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_inpainting",
                }, {
                    gpu_num: 2,
                    model: "swinir",
                }],
            }, {
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }]);
            expect(result).toEqual([{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 2,
                    model: "swinir",
                }],
            }]);
        });
    });

    // same as last test, but 3gpu worker isn't idle
    describe("one pending image, one available non-matching worker, one busy 3gpu worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 3,
                last_ping: moment().valueOf(),
                status: "active",
            }, {
                id: "worker2",
                num_gpus: 1,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_inpainting",
                }, {
                    gpu_num: 2,
                    model: "swinir",
                }],
            }, {
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_inpainting",
                }],
            }]);
            expect(result).toEqual([{
                worker_id: "worker2",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }],
            }]);
        });
    });

    describe("one pending image and unbalanced 3gpu worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution([{
                model: "stable_diffusion_text2im",
                score: 1,
            }], [{
                id: "worker1",
                num_gpus: 3,
                last_ping: moment().valueOf(),
                status: "idle",
            }], [{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "stable_diffusion_text2im",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_inpainting",
                }, {
                    gpu_num: 2,
                    model: "stable_diffusion_text2im",
                }],
            }]);
            expect(result).toEqual([{
                worker_id: "worker1",
                gpu_configs: [{
                    gpu_num: 0,
                    model: "swinir",
                }, {
                    gpu_num: 1,
                    model: "stable_diffusion_inpainting",
                }, {
                    gpu_num: 2,
                    model: "stable_diffusion_text2im",
                }],
            }]);
        });
    })
})
