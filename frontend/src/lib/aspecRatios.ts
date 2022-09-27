export interface AspectRatio {
    displayName: string;
    width: number;
    height: number;
}

export const DEFAULT_ASPECT_RATIO = 5;

export const aspectRatios: AspectRatio[] = [
    {
        displayName: "4:1",
        width: 1024,
        height: 256,
    },
    {
        displayName: "3:1",
        width: 768,
        height: 256,
    },
    {
        displayName: "2:1",
        width: 640,
        height: 320,
    },
    {
        displayName: "3:2",
        width: 576,
        height: 384,
    },
    {
        displayName: "5:4",
        width: 640,
        height: 512,
    },
    {
        displayName: "1:1",
        width: 512,
        height: 512,
    },
    {
        displayName: "4:5",
        width: 512,
        height: 640,
    },
    {
        displayName: "2:3",
        width: 384,
        height: 576,
    },
    {
        displayName: "1:2",
        width: 320,
        height: 640,
    },
    {
        displayName: "1:3",
        width: 256,
        height: 768,
    },
    {
        displayName: "1:4",
        width: 256,
        height: 1024,
    }
];

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
