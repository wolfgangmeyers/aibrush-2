import { Image } from "../client/api";

export interface Workspace {
    images: Image[];
}

export function loadWorkspace(): Workspace {
    const workspace = localStorage.getItem('workspace');
    if (workspace) {
        return JSON.parse(workspace);
    }
    return {
        images: [],
    };
}

export function saveWorkspace(workspace: Workspace) {
    localStorage.setItem('workspace', JSON.stringify(workspace));
}
