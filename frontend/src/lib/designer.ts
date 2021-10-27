// export functions to get and set designer current image id
// using local storage

export function getDesignerCurrentImageId(): string | null {
    return localStorage.getItem('designerCurrentImageId');
}

export function setDesignerCurrentImageId(id: string | null): void {
    if (id) {
        localStorage.setItem('designerCurrentImageId', id);
    } else {
        localStorage.removeItem('designerCurrentImageId');
    }
}
