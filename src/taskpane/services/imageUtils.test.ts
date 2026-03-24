/**
 * Unit tests for image validation and resize utilities.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateImageFile, resizeImageToBase64 } from "./imageUtils";

describe("validateImageFile", () => {
  it("returns null for a valid PNG file under 6MB", () => {
    const file = new File(["x"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 1024 * 1024 }); // 1MB
    expect(validateImageFile(file)).toBeNull();
  });

  it("returns null for a valid JPEG file under 6MB", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 }); // 2MB
    expect(validateImageFile(file)).toBeNull();
  });

  it("returns error for a GIF file", () => {
    const file = new File(["x"], "animation.gif", { type: "image/gif" });
    Object.defineProperty(file, "size", { value: 1024 });
    expect(validateImageFile(file)).toBe("Only PNG and JPG images are supported.");
  });

  it("returns error for a file over 6MB", () => {
    const file = new File(["x"], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 7 * 1024 * 1024 }); // 7MB
    expect(validateImageFile(file)).toBe("Image must be under 6MB.");
  });
});

describe("resizeImageToBase64", () => {
  let mockCanvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toDataURL: ReturnType<typeof vi.fn> };
  let mockCtx: { drawImage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockCtx = { drawImage: vi.fn() };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,abc123rawdata"),
    };

    // Stub document.createElement to return our mock canvas
    const mockDocument = {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") return mockCanvas as unknown as HTMLCanvasElement;
        return {} as HTMLElement;
      }),
    };
    vi.stubGlobal("document", mockDocument);
  });

  it("returns a string that does NOT start with 'data:'", async () => {
    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null as ((ev: ProgressEvent<FileReader>) => void) | null,
      onerror: null as (() => void) | null,
      result: "data:image/png;base64,inputdata",
    };
    vi.stubGlobal("FileReader", function () { return mockFileReader; });

    // Mock Image
    const mockImage = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
      width: 400,
      height: 300,
    };
    vi.stubGlobal("Image", function () { return mockImage; });

    const file = new File(["x"], "photo.png", { type: "image/png" });

    const promise = resizeImageToBase64(file);

    // Trigger FileReader onload
    mockFileReader.onload?.({} as ProgressEvent<FileReader>);
    // Trigger Image onload
    mockImage.onload?.();

    const result = await promise;
    expect(result).not.toMatch(/^data:/);
    expect(result).toBe("abc123rawdata");
  });

  it("resizes an 1600x1200 image to 800x600", async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null as ((ev: ProgressEvent<FileReader>) => void) | null,
      onerror: null as (() => void) | null,
      result: "data:image/png;base64,inputdata",
    };
    vi.stubGlobal("FileReader", function () { return mockFileReader; });

    const mockImage = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
      width: 1600,
      height: 1200,
    };
    vi.stubGlobal("Image", function () { return mockImage; });

    const file = new File(["x"], "photo.png", { type: "image/png" });

    const promise = resizeImageToBase64(file);
    mockFileReader.onload?.({} as ProgressEvent<FileReader>);
    mockImage.onload?.();
    await promise;

    // Canvas should be sized to 800x600 (scale = 800/1600 = 0.5)
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);
  });
});
