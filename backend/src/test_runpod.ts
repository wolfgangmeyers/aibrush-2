import { RunpodApi, RUNPOD_TEMPLATE_ID } from "./runpod_client";

const apiKey = process.env.RUNPOD_API_KEY;
const api = new RunpodApi(apiKey);

const main = async () => {
    try {
        const result = await api.getCommunityGpuTypes(
            {
                id: "NVIDIA GeForce RTX 3090",
                // id: "NVIDIA A100 80GB PCIe",
            },
            {
                minDownload: 100,
                minUpload: 10,
                minMemoryInGb: 20,
                gpuCount: 1,
                minVcpuCount: 1,
                secureCloud: false,
                supportPublicIp: false,
            }
        );
        console.log("GPU Types", JSON.stringify(result, null, 2));

        const createResult = await api.createPod({
            cloudType: "COMMUNITY",
            gpuCount: 1,
            volumeInGb: 0,
            containerDiskInGb: 1,
            minVcpuCount: 1,
            minMemoryInGb: 1,
            gpuTypeId: "NVIDIA A100 80GB PCIe",
            name: "AiBrush Worker",
            dockerArgs: "/app/aibrush-2/worker/images_worker.sh",
            // templateId: RUNPOD_TEMPLATE_ID,
            imageName: "wolfgangmeyers/aibrush:latest",
            ports: "",
            env: [
                {
                    key: "WORKER_LOGIN_CODE",
                    value: "96708edf-f845-40f0-a392-22f8c899eed6",
                },
            ],
            volumeMountPath: "",
        });
        console.log(JSON.stringify(createResult, null, 2));


        // const gpuType = result.gpuTypes[0];
        // const stockStatus = gpuType.lowestPrice.stockStatus;
        // if (stockStatus) {
        //     const createResult = await api.createPod({
        //         cloudType: "COMMUNITY",
        //         gpuCount: 1,
        //         volumeInGb: 0,
        //         containerDiskInGb: 1,
        //         minVcpuCount: 1,
        //         minMemoryInGb: 1,
        //         gpuTypeId: gpuType.id,
        //         name: "AiBrush Worker",
        //         dockerArgs: "/app/aibrush-2/worker/images_worker.sh",
        //         templateId: RUNPOD_TEMPLATE_ID,
        //         imageName: "wolfgangmeyers/aibrush:latest",
        //         ports: "",
        //         env: [
        //             {
        //                 key: "WORKER_LOGIN_CODE",
        //                 value: "96708edf-f845-40f0-a392-22f8c899eed6",
        //             },
        //         ],
        //         volumeMountPath: "",
        //     });
        //     console.log(JSON.stringify(createResult, null, 2));
        // } else {
        //     console.log("No inventory");
        // }

        
        // const myPods = await api.getMyPods();
        // console.log(JSON.stringify(myPods, null, 2));
        
        // const pod = myPods.myself.pods[0];
        // console.log("Pod to delete", pod.id);
        // await api.terminatePod({
        //     podId: pod.id,
        // });

        // const myPods2 = await api.getMyPods();
        // console.log("after delete", JSON.stringify(myPods2, null, 2));
    } catch (err) {
        if (err.response) {
            console.error(JSON.stringify(err.response.data.errors));
        } else {
            console.error(err);
        }
    }
};

main();
