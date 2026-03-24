/**
 * Image validation and resize utilities for the guided slide builder.
 * Validates file type/size and resizes images to max 800px for slide insertion.
 */

const MAX_DIMENSION = 800;
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB

/**
 * Validates an image file for type and size constraints.
 * @returns null if valid, or an error message string if invalid.
 */
export function validateImageFile(file: File): string | null {
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    return "Only PNG and JPG images are supported.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "Image must be under 6MB.";
  }
  return null;
}

/**
 * Reads an image file, resizes it to max 800px on longest side,
 * and returns the raw base64 string (no data URL prefix).
 *
 * Preserves MIME type: PNG inputs produce PNG output, JPEG inputs produce JPEG.
 * JPEG quality is set to 0.85 for reasonable file size.
 *
 * The returned base64 is suitable for Office.js ShapeFill.setImage().
 */
export function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        let newWidth = width;
        let newHeight = height;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          newWidth = Math.round(width * ratio);
          newHeight = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Preserve MIME type through resize pipeline (Pitfall 2)
        const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const quality = mimeType === "image/jpeg" ? 0.85 : undefined;
        const dataUrl = canvas.toDataURL(mimeType, quality);

        // Strip data URL prefix for Office.js (Pitfall 1)
        const rawBase64 = dataUrl.split(",")[1];
        resolve(rawBase64);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
