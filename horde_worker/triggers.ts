import axios from "axios";

const fetchHordeData = async () => {
    const { data } = await axios.get(
        "https://raw.githubusercontent.com/db0/AI-Horde-image-model-reference/main/stable_diffusion.json"
    );
    return data;
};

let _triggers: { [key: string]: string[] } = null;

fetchHordeData().then((data) => {
    _triggers = {};
    Object.keys(data).forEach((key) => {
        const modelInfo = data[key];
        if (modelInfo.trigger) {
            _triggers[key] = modelInfo.trigger;
        }
    });
});

export function addTrigger(prompt: string, model: string): string {
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