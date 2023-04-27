import axios from "axios";
import moment from "moment";

const fetchHordeData = async () => {
    const { data } = await axios.get(
        "https://raw.githubusercontent.com/db0/AI-Horde-image-model-reference/main/stable_diffusion.json"
    );
    return data;
};

let _triggers: { [key: string]: string[] } = null;
let _lastUpdated: moment.Moment = null;

async function initTriggers() {
    const data = await fetchHordeData();
    _triggers = {};
    Object.keys(data).forEach((key) => {
        const modelInfo = data[key];
        if (modelInfo.trigger) {
            _triggers[key] = modelInfo.trigger;
        }
    });
}

export async function addTrigger(prompt: string, model: string): Promise<string> {
    // check last updated
    if (_lastUpdated === null || moment().diff(_lastUpdated, "minutes") > 60) {
        await initTriggers();
        _lastUpdated = moment();
    }
    if (_triggers[model]) {
        const triggerList = _triggers[model];
        for (let trigger of triggerList) {
            if (
                prompt.toLocaleLowerCase().includes(trigger.toLocaleLowerCase())
            ) {
                return prompt;
            }
        }
        return `${triggerList[0]}, ${prompt}`;
    }
    return prompt;
}