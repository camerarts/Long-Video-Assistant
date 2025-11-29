import { GoogleGenAI } from "@google/genai";

// Helper to get the client instance safely at runtime
const getClient = () => {
  // strict adherence to guidelines: API key must be from process.env.API_KEY
  // The build tool (Vite) replaces this with the actual string value
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error("API Key check failed. Value is:", apiKey);
    throw new Error("API Key is missing. Please check your environment configuration in Cloudflare Pages.");
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
