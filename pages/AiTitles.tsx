
import React, { useState, useEffect } from 'react';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Sparkles, Loader2, Copy, Eraser, Type, Image as ImageIcon, ALargeSmall } from 'lucide-react';
import { PromptTemplate } from '../types';

interface AiTitlesResult {
    titles: string[];
    coverVisual: string;
    coverText: string;
}

const AiTitles: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState<AiTitlesResult | null>(null);
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
    setResult(null);

    try {
      // Use the new system variable TITLE_DIRECTION
      let prompt = promptTemplate.template.replace('{{TITLE_DIRECTION}}', userInput);
      // Fallback for older templates that might still use {{topic}}
      prompt = prompt.replace('{{topic}}', userInput);
      
      const json = await gemini.generateJSON<AiTitlesResult>(prompt, {
          type: "OBJECT",
          properties: {
              titles: { type: "ARRAY", items: { type: "STRING" } },
              coverVisual: { type: "STRING" },
              coverText: { type: "STRING" }
          }
      });
      setResult(json);
    } catch (error: any) {
      alert(`生成失败: ${error.message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTitles = () => {
    if (!result?.titles) return;
    navigator.clipboard.writeText(result.titles.join('\n'));
    alert("已复制标题列表");
  };

  const handleClear = () => {
    setUserInput('');
    setResult(null);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-24 md:pb-0 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 mb-0.5 md:mb-2 tracking-tight flex items-center gap-2 md:gap-3">
            <Type className="w-6 h-6 md:w-8 md:h-8 text-violet-600" />
            AI 标题生成
          </h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">输入标题方向，AI 帮你从多个角度构思爆款标题与封面方案。</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Input Panel - Left 1/4 */}
        <div className="w-full md:w-1/4 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="py-2 px-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">标题方向</span>
                <button onClick={handleClear} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors" title="清空">
                    <Eraser className="w-4 h-4" />
                </button>
            </div>
            <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="例如：\n1. 2024年人工智能行业发展趋势\n2. 适合新手的理财技巧\n3. 悬念感强的开箱视频..."
                className="flex-1 w-full p-4 text-slate-700 placeholder:text-slate-300 resize-none outline-none focus:bg-slate-50/50 transition-colors text-sm leading-relaxed"
            />
            <div className="p-4 border-t border-slate-100 bg-white flex-shrink-0">
                <button
                    onClick={handleGenerate}
                    disabled={loading || !userInput.trim()}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none text-sm"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    开始生成
                </button>
            </div>
        </div>

        {/* Output Panel - Right 3/4 */}
        <div className="w-full md:w-3/4 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            {/* Top Section: Titles (75%) */}
            <div className="flex-[3] flex flex-col min-h-0 border-b border-slate-200">
                <div className="py-2 px-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5" /> 标题结果
                    </span>
                    <button 
                        onClick={handleCopyTitles} 
                        disabled={!result?.titles?.length} 
                        className="text-slate-400 hover:text-violet-600 p-1 rounded-md hover:bg-violet-50 transition-colors disabled:opacity-30" 
                        title="复制所有标题"
                    >
                        <Copy className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-[#FAFAFA]">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                            <span className="text-sm font-medium animate-pulse">AI 正在构思标题与封面...</span>
                        </div>
                    ) : result?.titles ? (
                        <div className="space-y-2">
                            {result.titles.map((title, idx) => (
                                <div key={idx} className="py-2 px-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:shadow-md transition-shadow flex gap-2 items-center group">
                                    <span className="text-[10px] font-bold text-slate-300 w-5 text-center shrink-0">{idx + 1}</span>
                                    <p className="text-slate-800 font-medium text-sm leading-snug flex-1">{title}</p>
                                    <button 
                                        className="ml-auto opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 transition-all p-1"
                                        onClick={() => {
                                            navigator.clipboard.writeText(title);
                                            alert(`标题 "${title}" 已复制`);
                                        }}
                                        title="复制此标题"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 select-none">
                            <Type className="w-12 h-12 opacity-20" />
                            <span className="text-sm">生成的标题将显示在这里</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Section: Cover Details (25%) */}
            <div className="flex-[1] flex flex-row min-h-0 bg-white">
                {/* Bottom Left: Cover Elements */}
                <div className="w-1/2 border-r border-slate-200 flex flex-col">
                    <div className="py-2 px-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" /> 封面元素
                        </span>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto text-xs text-slate-600 leading-relaxed">
                        {result?.coverVisual ? (
                            result.coverVisual
                        ) : (
                             <span className="text-slate-300 italic">等待生成...</span>
                        )}
                    </div>
                </div>

                {/* Bottom Right: Cover Text */}
                <div className="w-1/2 flex flex-col">
                    <div className="py-2 px-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                         <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <ALargeSmall className="w-3.5 h-3.5" /> 封面文字
                        </span>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto text-sm text-slate-800 font-bold leading-relaxed whitespace-pre-wrap">
                        {result?.coverText ? (
                            result.coverText
                        ) : (
                            <span className="text-slate-300 text-xs italic font-normal">等待生成...</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiTitles;
