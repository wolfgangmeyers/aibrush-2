// Simple localStorage-based settings persistence for numeric values

const DEFAULT_STEPS = 20;

export function getSteps(): number {
    const stored = localStorage.getItem("settings-steps");
    if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 150) {
            return parsed;
        }
    }
    return DEFAULT_STEPS;
}

export function setSteps(steps: number): void {
    localStorage.setItem("settings-steps", steps.toString());
}
