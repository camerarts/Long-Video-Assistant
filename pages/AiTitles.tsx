
import React, { useState, useEffect } from 'react';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Sparkles, Loader2, Copy, Eraser, Type } from 'lucide-react';
import { PromptTemplate } from '../types';

const AiTitles: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [generatedResult, setGeneratedResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    loadPrompt();
  }, []);

  const loadPrompt = async () => {
    const prompts = await storage.getPrompts();
    if (prompts.AI_TITLES_GENERATOR) {
      setPromptTemplate(prompts.AI_TITLES_GENERATOR);
    }
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) return;
    if (!promptTemplate) {
        alert("未找到标题生成提示词配置，请检查设置。");
        return;
    }

    setLoading(true);
    try {
      // Use the new system variable TITLE_DIRECTION
      const prompt = promptTemplate.template.replace('{{TITLE_DIRECTION}}', userInput);
      // Fallback for older templates that might still use {{topic}}
      const finalPrompt = prompt.replace('{{topic}}', userInput);
      
      const result = await gemini.generateText(finalPrompt);
      setGeneratedResult(result);
    } catch (error: any) {
      alert(`生成失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult);
    alert("已复制到剪贴板");
  };

  const handleClear = () => {
    setUserInput('');
    setGeneratedResult('');
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-24 md:pb-0 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 mb-0.5 md:mb-2 tracking-tight flex items-center gap-2 md:gap-3">
            <Type className="w-6 h-6 md:w-8 md:h-8 text-violet-600" />
            AI 标题生成
          </h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">输入标题方向，AI 帮你从多个角度构思爆款标题。</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Input Panel - Top (Reduced height) */}
        <div className="flex-none h-64 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">标题方向</span>
                <button onClick={handleClear} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors" title="清空">
                    <Eraser className="w-4 h-4" />
                </button>
            </div>
            <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="例如：\n1. 2024年人工智能行业发展趋势\n2. 适合新手的理财技巧\n3. 悬念感强的开箱视频..."
                className="flex-1 w-full p-6 text-slate-700 placeholder:text-slate-300 resize-none outline-none focus:bg-slate-50/50 transition-colors text-base leading-relaxed"
            />
            <div className="p-3 border-t border-slate-100 bg-white">
                <button
                    onClick={handleGenerate}
                    disabled={loading || !userInput.trim()}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    开始生成
                </button>
            </div>
        </div>

        {/* Output Panel - Bottom (Takes remaining space) */}
        <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI 生成结果</span>
                <button onClick={handleCopy} disabled={!generatedResult} className="text-slate-400 hover:text-violet-600 p-1 rounded-md hover:bg-violet-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400" title="复制全部">
                    <Copy className="w-4 h-4" />
                </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-[#FAFAFA]">
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                        <span className="text-sm font-medium animate-pulse">AI 正在构思标题...</span>
                    </div>
                ) : generatedResult ? (
                    <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap leading-loose font-medium">
                        {generatedResult}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 select-none">
                        <Type className="w-12 h-12 opacity-20" />
                        <span className="text-sm">结果将显示在这里</span>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiTitles;
