import Autoscaler from "./autoscaler";
import HerokuHelper from "./HerokuHelper";
import { MetricsClient } from "./metrics";
import MetricsHelper from "./MetricsHelper";

const newRelicUserKey = process.env.NEW_RELIC_USER_KEY;
const newRelicLicenseKey = process.env.NEW_RELIC_LICENSE_KEY;
const newRelicAccountId = process.env.NEW_RELIC_ACCOUNT_ID;
const herokuApiKey = process.env.HEROKU_API_KEY;

if (!newRelicUserKey) {
    throw new Error("NEW_RELIC_USER_KEY is not set");
}
if (!newRelicLicenseKey) {
    throw new Error("NEW_RELIC_LICENSE_KEY is not set");
}
if (!newRelicAccountId) {
    throw new Error("NEW_RELIC_ACCOUNT_ID is not set");
}
if (!herokuApiKey) {
    throw new Error("HEROKU_API_KEY is not set");
}

const metricsHelper = new MetricsHelper(newRelicUserKey, newRelicAccountId);
const herokuHelper = new HerokuHelper(herokuApiKey, "aibrush");
const metricsClient = new MetricsClient(newRelicLicenseKey);

const autoscaler = new Autoscaler(metricsHelper, metricsClient, herokuHelper, {
    minCpu: 50,
    maxCpu: 75,
    minMem: 50,
    maxMem: 75,
});

async function main() {
    setInterval(async () => {
        await autoscaler.performAutoscaling();
    }, 1000 * 60);
    await autoscaler.performAutoscaling();
}

main();
