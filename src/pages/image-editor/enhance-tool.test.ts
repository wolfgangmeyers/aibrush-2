// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnhanceTool } from "./enhance-tool";
import { HordeGenerator } from "../../lib/hordegenerator";
import { LocalImage } from "../../lib/models";

// ImageData is not available in node environment — create a minimal stand-in
class FakeImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
    }
}

function makeImageData(): ImageData {
    return new FakeImageData(64, 64) as unknown as ImageData;
}

function makeRenderer() {
    return {
        getWidth: vi.fn().mockReturnValue(512),
        getHeight: vi.fn().mockReturnValue(512),
        setCursor: vi.fn(),
        isMasked: vi.fn().mockReturnValue(false),
        getSelectionOverlay: vi.fn().mockReturnValue({ x: 0, y: 0, width: 512, height: 512 }),
        setEditImage: vi.fn(),
        setSelectionOverlay: vi.fn(),
        setSelectionOverlayPreview: vi.fn(),
        getEncodedImage: vi.fn().mockReturnValue("data:image/jpeg;base64,abc"),
        getEncodedMask: vi.fn().mockReturnValue(undefined),
        getImageData: vi.fn().mockReturnValue(null),
        commitSelection: vi.fn(),
        deleteMask: vi.fn(),
        createMask: vi.fn(),
        referencImageCount: vi.fn().mockReturnValue(0),
        convertMaskForAlphaApplication: vi.fn().mockReturnValue(null),
    };
}

function makeTool(renderer: ReturnType<typeof makeRenderer>) {
    // Register callbacks to prevent stateHandler/selectionControlsListener crashes
    const tool = new EnhanceTool(renderer as any);
    tool.onChangeState(() => {});
    tool.onShowSelectionControls(() => {});
    tool.onChangeMask(() => {});
    tool.onProgress(() => {});
    tool.onError(() => {});
    return tool;
}

// Force tool into confirm state with pre-loaded imageData without triggering full state machine
function setConfirmState(tool: EnhanceTool, images: ImageData[]) {
    const t = tool as any;
    t._state = "confirm";
    t.imageData = [...images];
}

describe("EnhanceTool", () => {
    let renderer: ReturnType<typeof makeRenderer>;
    let tool: EnhanceTool;

    beforeEach(() => {
        renderer = makeRenderer();
        tool = makeTool(renderer);
        vi.clearAllMocks();
    });

    describe("deleteSelected()", () => {
        it("test 0: returns early when selectedImageDataIndex is -1 (no-op guard)", () => {
            const img1 = makeImageData();
            const img2 = makeImageData();
            setConfirmState(tool, [img1, img2]);
            (tool as any).selectedImageDataIndex = -1;

            tool.deleteSelected();

            expect((tool as any).imageData).toHaveLength(2);
            expect(renderer.setEditImage).not.toHaveBeenCalled();
        });

        it("test 1: deletes middle candidate, shows element originally at index 2", () => {
            const img0 = makeImageData();
            const img1 = makeImageData();
            const img2 = makeImageData();
            setConfirmState(tool, [img0, img1, img2]);
            (tool as any).selectedImageDataIndex = 1;

            tool.deleteSelected();

            const t = tool as any;
            expect(t.imageData).toHaveLength(2);
            expect(t.selectedImageDataIndex).toBe(1);
            // after splice, index 1 is what was originally index 2
            expect(t.imageData[1]).toBe(img2);
            expect(renderer.setEditImage).toHaveBeenCalledWith(img2);
        });

        it("test 2: deletes last candidate (index = length-1), index clamps to length-1", () => {
            const img0 = makeImageData();
            const img1 = makeImageData();
            const img2 = makeImageData();
            setConfirmState(tool, [img0, img1, img2]);
            (tool as any).selectedImageDataIndex = 2;

            tool.deleteSelected();

            const t = tool as any;
            expect(t.imageData).toHaveLength(2);
            expect(t.selectedImageDataIndex).toBe(1);
            expect(t.imageData[1]).toBe(img1);
            expect(renderer.setEditImage).toHaveBeenCalledWith(img1);
        });

        it("test 3a: deletes only candidate with selectSupported=true → state becomes 'select'", () => {
            const img0 = makeImageData();
            setConfirmState(tool, [img0]);
            (tool as any).selectedImageDataIndex = 0;
            vi.spyOn(tool, "selectSupported").mockReturnValue(true);

            tool.deleteSelected();

            expect((tool as any).imageData).toHaveLength(0);
            expect(renderer.setEditImage).toHaveBeenCalledWith(null);
            expect(tool.state).toBe("select");
        });

        it("test 3b: deletes only candidate with selectSupported=false → state becomes 'default'", () => {
            const img0 = makeImageData();
            setConfirmState(tool, [img0]);
            (tool as any).selectedImageDataIndex = 0;
            vi.spyOn(tool, "selectSupported").mockReturnValue(false);

            tool.deleteSelected();

            expect((tool as any).imageData).toHaveLength(0);
            expect(renderer.setEditImage).toHaveBeenCalledWith(null);
            expect(tool.state).toBe("default");
        });
    });

    describe("retry wiring", () => {
        it("test 4: calls updateArgs then submit when retry is triggered", async () => {
            setConfirmState(tool, [makeImageData()]);
            const updateArgsSpy = vi.spyOn(tool, "updateArgs");
            const submitSpy = vi.spyOn(tool, "submit").mockResolvedValue(undefined);

            const generator = {} as HordeGenerator;
            const image = { id: "img-1", params: { prompt: "test" } } as unknown as LocalImage;

            const args = {
                count: 4,
                variationStrength: 0.5,
                steps: 20,
                prompt: "test prompt",
                negativePrompt: "bad quality",
                model: "Epic Diffusion",
                loras: [],
            };
            tool.updateArgs(args);
            await tool.submit(generator, image);

            expect(updateArgsSpy).toHaveBeenCalledWith(args);
            expect(submitSpy).toHaveBeenCalledWith(generator, image);
            // updateArgs must be called before submit
            const updateArgsCallOrder = updateArgsSpy.mock.invocationCallOrder[0];
            const submitCallOrder = submitSpy.mock.invocationCallOrder[0];
            expect(updateArgsCallOrder).toBeLessThan(submitCallOrder);
        });
    });
});
