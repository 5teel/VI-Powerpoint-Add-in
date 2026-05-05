import { GEMINI_API_KEY } from "../config";

const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}

export async function generateImage(prompt: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(
    `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { imageSize: "1K" },
        },
      }),
      signal,
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini image API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const part: GeminiPart | undefined = data?.candidates?.[0]?.content?.parts?.find(
    (p: GeminiPart) => p.inlineData
  );
  if (!part?.inlineData?.data) {
    throw new Error("Gemini returned no image data");
  }
  return part.inlineData.data;
}
