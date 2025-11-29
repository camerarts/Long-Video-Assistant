import { GoogleGenAI, Type } from "@google/genai";

// Helper to get the client instance safely at runtime
const getClient = () => {
  // Check if process.env exists (safe access) and get the key
  const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration (API_KEY).");
  }
  
  return new GoogleGenAI({ apiKey });
};

export const generateText = async (prompt: string, modelName: string = 'gemini-2.5-flash'): Promise<string> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || '';
  } catch (error: any) {
    console.error("Text generation error:", error);
    // Re-throw with a user-friendly message if possible
    throw new Error(error.message || "Failed to generate text");
  }
};

export const generateJSON = async <T>(prompt: string, schema?: any): Promise<T> => {
  try {
    const ai = getClient();
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
  } catch (error: any) {
    console.error("JSON generation error:", error);
    throw new Error(error.message || "Failed to generate structured data");
  }
};

export const generateImage = async (prompt: string): Promise<string> => {
  try {
    const ai = getClient();
    // Using gemini-2.5-flash-image for generation as requested/standard
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
  } catch (error: any) {
    console.error("Image generation error:", error);
    throw new Error(error.message || "Failed to generate image");
  }
};
