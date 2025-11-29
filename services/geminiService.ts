import { GoogleGenAI, Type } from "@google/genai";

// Ensure API Key is available
const apiKey = process.env.API_KEY || '';
if (!apiKey) {
  console.warn("API_KEY is not set in process.env");
}

const ai = new GoogleGenAI({ apiKey });

export const generateText = async (prompt: string, modelName: string = 'gemini-2.5-flash'): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || '';
  } catch (error) {
    console.error("Text generation error:", error);
    throw error;
  }
};

export const generateJSON = async <T>(prompt: string, schema?: any): Promise<T> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });
    const text = response.text || '{}';
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("JSON generation error:", error);
    throw error;
  }
};

export const generateImage = async (prompt: string): Promise<string> => {
  try {
    // Using gemini-2.5-flash-image for generation as requested/standard
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      // Note: gemini-2.5-flash-image doesn't strictly support aspectRatio config in the same way as Imagen
      // via the generateContent API config object in all SDK versions yet, but we prompt for it.
      // However, if we were using Imagen (imagen-3.0-generate-001), we would use generateImages.
      // For this implementation, we stick to the text-to-image capability of the flash model.
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned");
  } catch (error) {
    console.error("Image generation error:", error);
    throw error;
  }
};