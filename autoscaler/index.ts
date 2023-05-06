import Autoscaler from "./autoscaler";
import HerokuHelper from "./HerokuHelper";
import MetricsHelper from "./MetricsHelper";

const newRelicLicenseKey = process.env.NEW_RELIC_USER_KEY;
const newRelicAccountId = process.env.NEW_RELIC_ACCOUNT_ID;
const herokuApiKey = process.env.HEROKU_API_KEY;

if (!newRelicLicenseKey) {
    throw new Error("NEW_RELIC_USER_KEY is not set");
}
if (!newRelicAccountId) {
    throw new Error("NEW_RELIC_ACCOUNT_ID is not set");
}
if (!herokuApiKey) {
    throw new Error("HEROKU_API_KEY is not set");
}

const metricsHelper = new MetricsHelper(newRelicLicenseKey, newRelicAccountId);
const herokuHelper = new HerokuHelper(herokuApiKey, "aibrush");

const autoscaler = new Autoscaler(metricsHelper, herokuHelper, {
    minCpu: 50,
    maxCpu: 75,
    minMem: 50,
    maxMem: 75,
});

async function main() {
    setInterval(async () => {
        await autoscaler.performAutoscaling();
    }, 1000 * 60);
}

main();
