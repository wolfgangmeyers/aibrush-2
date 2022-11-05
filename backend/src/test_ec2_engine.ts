import { Ec2Engine } from "./ec2_engine";

const regions = ["us-west-2"]
const engine = new Ec2Engine(regions);

async function main() {
    // await engine.destroyInstance("us-west-2", "i-013221044a7317808");
    // const result = await engine.listInstancesByRegion();
    // console.log(JSON.stringify(result, null, 2));

    await engine.createInstance("us-west-2", "d621a46d-d583-42e9-ac3b-deb135625034");
}

main();
