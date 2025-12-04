
import React, { useState, useEffect, useRef } from 'react';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Sparkles, Loader2, Copy, Eraser, Type, Image as ImageIcon, ALargeSmall, Save, Clock, Cloud, CloudCheck } from 'lucide-react';
import { PromptTemplate } from '../types';

interface AiTitlesResult {
    titles: string[];
    coverVisual: string;
    coverText: string;
}

const TOOL_ID = 'ai_titles';

const AiTitles: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState<AiTitlesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplate | null>(null);
  
  // Status State
  const [lastAutoSave, setLastAutoSave] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  
  // Refs to track initial load and avoid saving on mount
  const isLoadedRef = useRef(false);

  useEffect(() => {
    loadPrompt();
    initData();
  }, []);

  // Auto-save Effect (Local + Cloud)
  useEffect(() => {
    if (!isLoadedRef.current) return;
    
    const saveData = async () => {
        setSyncStatus('saving');
        const now = Date.now();
        const dataToSave = { input: userInput, result, updatedAt: now };

        try {
            // 1. Local Save
            await storage.saveToolData(TOOL_ID, dataToSave);
            setLastAutoSave(new Date(now).toLocaleTimeString());
            setSyncStatus('saved');

            // 2. Cloud Save (Async)
            await storage.uploadToolData(TOOL_ID, dataToSave);
            setSyncStatus('synced');
        } catch (e) {
            console.error("Auto-save error:", e);
            setSyncStatus('error');
        }
    };

    const timer = setTimeout(() => {
        saveData();
    }, 1000); // 1s debounce

    return () => clearTimeout(timer);
  }, [userInput, result]);

  const loadPrompt = async () => {
    const prompts = await storage.getPrompts();
    if (prompts.AI_TITLES_GENERATOR) {
      setPromptTemplate(prompts.AI_TITLES_GENERATOR);
    }
  };

  const initData = async () => {
      // 1. Load Local First
      const saved = await storage.getToolData<{input: string, result: AiTitlesResult, updatedAt?: number}>(TOOL_ID);
      
      let currentData = saved;

      // 2. Check Remote (Sync on Load)
      try {
          const remote = await storage.fetchRemoteToolData<{input: string, result: AiTitlesResult, updatedAt?: number}>(TOOL_ID);
          if (remote && (!saved || (remote.updatedAt || 0) > (saved.updatedAt || 0))) {
              console.log("Found newer data on server, syncing...");
              currentData = remote;
              // Update local cache
              await storage.saveToolData(TOOL_ID, remote);
          }
      } catch (e) {
          console.warn("Failed to check remote data", e);
      }

      if (currentData) {
          setUserInput(currentData.input || '');
          setResult(currentData.result || null);
          if (currentData.updatedAt) {
              setLastAutoSave(new Date(currentData.updatedAt).toLocaleTimeString());
              setSyncStatus('synced');
          }
      }
      isLoadedRef.current = true;
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) return;
    if (!promptTemplate) {
        alert("未找到标题生成提示词配置，请检查设置。");
        return;
    }

    setLoading(true);
    setSyncStatus('saving');

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
          },
          required: ["titles", "coverVisual", "coverText"]
      });
      
      setResult(json);
      
      // Immediate save logic will be handled by useEffect, but we can force update timestamp
      const now = Date.now();
      setLastAutoSave(new Date(now).toLocaleTimeString());
      // The state update triggers the useEffect which handles cloud sync

    } catch (error: any) {
      alert(`生成失败: ${error.message}`);
      console.error(error);
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTitles = () => {
    if (!result?.titles) return;
    navigator.clipboard.writeText(result.titles.join('\n'));
    alert("已复制标题列表");
  };

  const handleClear = async () => {
    if(!window.confirm("确定要清空所有内容吗？")) return;
    setUserInput('');
    setResult(null);
    setLastAutoSave('');
    setSyncStatus(null);
    await storage.saveToolData(TOOL_ID, { input: '', result: null, updatedAt: Date.now() });
    await storage.uploadToolData(TOOL_ID, { input: '', result: null, updatedAt: Date.now() });
  };

  // Content Edit Handlers
  const handleTitleChange = (index: number, newVal: string) => {
    if (!result) return;
    const newTitles = [...result.titles];
    newTitles[index] = newVal;
    setResult({ ...result, titles: newTitles });
  };

  const handleCoverVisualChange = (val: string) => {
    if (!result) return;
    setResult({ ...result, coverVisual: val });
  };

  const handleCoverTextChange = (val: string) => {
    if (!result) return;
    setResult({ ...result, coverText: val });
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
        <div className="flex flex-col items-end justify-end">
            {lastAutoSave && (
                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md border animate-in fade-in transition-colors ${
                    syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    syncStatus === 'saving' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                    syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                    'bg-slate-50 text-slate-400 border-slate-100'
                }`}>
                    {syncStatus === 'synced' ? <CloudCheck className="w-3 h-3" /> : 
                     syncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                     <Cloud className="w-3 h-3" />}
                    
                    {syncStatus === 'synced' ? `已同步云端: ${lastAutoSave}` :
                     syncStatus === 'saving' ? '正在同步...' :
                     `自动保存: ${lastAutoSave}`}
                </div>
            )}
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
                                    <input 
                                        type="text"
                                        value={title}
                                        onChange={(e) => handleTitleChange(idx, e.target.value)}
                                        className="flex-1 text-slate-800 font-medium text-sm leading-snug bg-transparent border-none focus:ring-0 outline-none w-full"
                                    />
                                    <button 
                                        className="ml-auto opacity-0 group-hover:opacity-100 text-slate-300 hover:text-violet-600 transition-all p-1"
                                        onClick={() => {
                                            navigator.clipboard.writeText(title);
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
                    <div className="flex-1 overflow-hidden relative">
                         {result ? (
                             <textarea
                                value={result.coverVisual}
                                onChange={(e) => handleCoverVisualChange(e.target.value)}
                                className="w-full h-full p-3 text-xs text-slate-600 leading-relaxed resize-none border-none outline-none focus:bg-slate-50/50"
                            />
                         ) : (
                             <div className="p-3 text-slate-300 italic text-xs">等待生成...</div>
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
                    <div className="flex-1 overflow-hidden relative">
                         {result ? (
                             <textarea
                                value={result.coverText}
                                onChange={(e) => handleCoverTextChange(e.target.value)}
                                className="w-full h-full p-3 text-sm text-slate-800 font-bold leading-relaxed resize-none border-none outline-none focus:bg-slate-50/50"
                            />
                         ) : (
                             <div className="p-3 text-slate-300 italic text-xs">等待生成...</div>
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
