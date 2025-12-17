
import { GoogleGenAI } from "@google/genai";

// Helper to get the client instance safely at runtime
const getClient = (customApiKey?: string) => {
  // strict adherence to guidelines: API key must be from process.env.API_KEY or custom override
  const apiKey = customApiKey || process.env.API_KEY;
  
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    console.error("API Key check failed. Value is:", apiKey);
    throw new Error("API Key is missing. Please check your environment configuration in Cloudflare Pages (Settings > Environment variables).");
  }
  
  return new GoogleGenAI({ apiKey });
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry logic with exponential backoff
const retryWithBackoff = async <T>(operation: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    const msg = error.message || error.toString();
    // Check for retryable errors: 503 (Overloaded/Service Unavailable), 429 (Quota), 500 (Internal), or specific text
    const isRetryable = 
        msg.includes('503') || 
        msg.includes('429') || 
        msg.includes('500') || 
        msg.includes('overloaded') || 
        msg.includes('quota');
    
    if (isRetryable) {
      console.warn(`API Error (${msg}). Retrying in ${baseDelay}ms... (${retries} attempts left)`);
      await delay(baseDelay);
      return retryWithBackoff(operation, retries - 1, baseDelay * 2);
    }
    
    throw error;
  }
};

// Centralized error handler
const handleApiError = (error: any, defaultMsg: string): never => {
  console.error(defaultMsg, error);
  const msg = error.message || error.toString();
  
  // Check for Rate Limiting / Quota issues
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
      throw new Error("API 调用频率过高 (429)。系统已尝试重试但仍受限，请稍休息 1 分钟等待配额恢复。");
  }

  // Check for Bad Request (400) - often invalid parameters
  if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
      throw new Error("请求参数无效 (400)。可能是该模型不支持当前的配置（如宽高比或分辨率），或者提示词包含非法内容。");
  }

  // Check for Not Found (404) - Model not found or no access
  if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      throw new Error("模型未找到或无权访问 (404)。请检查您的 API Key 是否支持该模型，或该区域未开放。");
  }
  
  // Check for Overloaded (503)
  if (msg.includes('503') || msg.includes('overloaded')) {
      throw new Error("模型服务暂时过载 (503)。系统已多次重试但服务器仍繁忙，请稍后再试。");
  }
  
  // Check for Safety Filters (if not caught earlier)
  if (msg.includes('SAFETY') || msg.includes('blocked')) {
      throw new Error("生成内容被 AI 安全策略拦截。请尝试修改提示词或主题。");
  }

  // Return the original message if it's already a clean Error object, otherwise default
  throw new Error(msg || defaultMsg);
};

export const generateText = async (prompt: string, modelName: string = 'gemini-2.5-flash', customApiKey?: string): Promise<string> => {
  try {
    return await retryWithBackoff(async () => {
        const ai = getClient(customApiKey);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        return response.text || '';
    });
  } catch (error: any) {
    handleApiError(error, "Failed to generate text");
  }
  return ''; // Should be unreachable
};

export const generateJSON = async <T>(prompt: string, schema?: any, customApiKey?: string, modelName: string = 'gemini-2.5-flash'): Promise<T> => {
  try {
    return await retryWithBackoff(async () => {
        const ai = getClient(customApiKey);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });
        
        let text = response.text || '{}';
        
        // Clean Markdown formatting if present (common issue with AI responses)
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        
        return JSON.parse(text) as T;
    });
  } catch (error: any) {
    handleApiError(error, "Failed to generate structured data");
  }
  return {} as T; // Should be unreachable
};

export const generateImage = async (prompt: string, customApiKey?: string, modelName: string = 'gemini-2.5-flash-image'): Promise<string> => {
  try {
    return await retryWithBackoff(async () => {
        // Pass customApiKey if provided, otherwise uses default from env
        const ai = getClient(customApiKey);
        
        const config: any = {
          imageConfig: {
            aspectRatio: "16:9"
          }
        };

        // Special handling for Pro model: requires imageSize
        if (modelName === 'gemini-3-pro-image-preview') {
           config.imageConfig.imageSize = '1K';
        }

        // Using provided modelName or default
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [{ text: prompt }]
          },
          config: config
        });

        const candidate = response.candidates?.[0];
        
        // Check for safety blocking or other finish reasons explicitly
        if (candidate?.finishReason === 'SAFETY') {
            throw new Error("图片生成被安全策略拦截 (Safety Filter)。请修改提示词。");
        }
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`生成意外停止: ${candidate.finishReason}`);
        }

        // Extract image
        for (const part of candidate?.content?.parts || []) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
        throw new Error("API 未返回图片数据 (Response empty)");
    });
  } catch (error: any) {
    handleApiError(error, "Failed to generate image");
  }
  return ''; // Should be unreachable
};

