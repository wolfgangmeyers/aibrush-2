// export interface AspectRatio {
//     displayName: string;
//     width: number;
//     height: number;
//     id: number;

//     scale: (size: number) => AspectRatio;
// }

export class AspectRatio implements AspectRatio {
    readonly displayName: string;
    readonly width: number;
    readonly height: number;
    readonly id: number;

    constructor(cfg: any) {
        this.displayName = cfg.displayName;
        this.width = cfg.width;
        this.height = cfg.height;
        this.id = cfg.id;
    }

    scale(size: number): AspectRatio {
        const newWidth = this.width * size;
        const newHeight = this.height * size;

        return new AspectRatio({
            id: this.id,
            displayName: this.displayName,
            // round width and height up to the nearest multiple of 64
            width: Math.ceil(newWidth / 64) * 64,
            height: Math.ceil(newHeight / 64) * 64,
        });
    }
}

export const DEFAULT_ASPECT_RATIO = 5;

export const aspectRatios: AspectRatio[] = [
    {
        displayName: "4:1",
        width: 1024,
        height: 256,
        id: 0,
    },
    {
        displayName: "3:1",
        width: 768,
        height: 256,
        id: 1,
    },
    {
        displayName: "2:1",
        width: 640,
        height: 320,
        id: 2,
    },
    {
        displayName: "3:2",
        width: 576,
        height: 384,
        id: 3,
    },
    {
        displayName: "5:4",
        width: 640,
        height: 512,
        id: 4,
    },
    {
        displayName: "1:1",
        width: 512,
        height: 512,
        id: 5,
    },
    {
        displayName: "4:5",
        width: 512,
        height: 640,
        id: 6,
    },
    {
        displayName: "2:3",
        width: 384,
        height: 576,
        id: 7,
    },
    {
        displayName: "1:2",
        width: 320,
        height: 640,
        id: 8,
    },
    {
        displayName: "1:3",
        width: 256,
        height: 768,
        id: 9,
    },
    {
        displayName: "1:4",
        width: 256,
        height: 1024,
        id: 10,
    }
].map((cfg) => new AspectRatio(cfg));

export function getClosestAspectRatio(width: number, height: number): AspectRatio {
    const aspectRatio = width / height;

    const tests = [...aspectRatios];
    tests.sort((a, b) => {
        const aRatio = a.width / a.height;
        const bRatio = b.width / b.height;
        return (
            Math.abs(aRatio - aspectRatio) -
            Math.abs(bRatio - aspectRatio)
        );
    });
    const bestMatch = tests[0];
    return bestMatch;
}


