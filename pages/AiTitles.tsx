import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Sparkles, Loader2, Copy, Eraser, Type, Image as ImageIcon, ALargeSmall, Save, Clock, Cloud, CloudCheck, CheckCircle2, Circle, Wand2, Maximize2, X, Download, Rocket } from 'lucide-react';
import { PromptTemplate, ProjectData, ProjectStatus } from '../types';

interface AiTitleItem {
    title: string;
    score: number;
}

interface AiTitlesResult {
    titles: AiTitleItem[];
    coverVisual: string;
    coverText: string;
}

// Extended interface for saved state
interface AiTitlesState {
    input: string;
    result: AiTitlesResult | null;
    selectedTitleIndex: number | null;
    generatedCover: string | null;
    updatedAt?: number;
}

const TOOL_ID = 'ai_titles';

const AiTitles: React.FC = () => {
  const navigate = useNavigate();
  const [userInput, setUserInput] = useState('');
  const [result, setResult] = useState<AiTitlesResult | null>(null);
  
  // New State for Selection and Image
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null); // For fullscreen preview

  const [loading, setLoading] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplate | null>(null);
  
  // Status State
  const [lastAutoSave, setLastAutoSave] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  
  // Refs to track initial load and avoid saving on mount
  const isLoadedRef = useRef(false);

  // Activity Tracking Refs
  const lastActivityRef = useRef(Date.now());
  const isBusyRef = useRef(false);

  // Update busy ref based on state
  useEffect(() => {
      isBusyRef.current = loading || generatingImage;
  }, [loading, generatingImage]);

  // Activity Listeners
  useEffect(() => {
    const updateActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('mousemove', updateActivity);
    return () => {
        window.removeEventListener('click', updateActivity);
        window.removeEventListener('keydown', updateActivity);
        window.removeEventListener('mousemove', updateActivity);
    };
  }, []);

  // Smart Auto-Sync Loop
  useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout>;

      const performSync = async () => {
          // Note: AiTitles tool data is usually just one item.
          // DownloadAllData pulls tools too.
          
          const isUserActive = (Date.now() - lastActivityRef.current) < 30000;
          
          if (isBusyRef.current || isUserActive) {
              console.log("Auto-sync delayed: User active or system busy");
              timeoutId = setTimeout(performSync, 2 * 60 * 1000); // Retry in 2 mins
              return;
          }

          setSyncStatus('saving');
          try {
              await storage.downloadAllData();
              
              // Refresh View
              const saved = await storage.getToolData<AiTitlesState>(TOOL_ID);
              if (saved && (!saved.updatedAt || !isLoadedRef.current || (saved.updatedAt > (Date.now() - 300000)))) { 
                 // Simple logic: If server data is newer or just synced, refresh
                 // But since we are editing in real-time, we should be careful not to overwrite user input if they typed recently.
                 // The isUserActive check protects us mostly.
                 if (saved) {
                      // Only update if not currently typing (protected by isUserActive)
                      // ... logic to merge or overwrite ...
                      // For now, let's just assume if we are idle, we accept server state if it's there.
                      // Actually, for a single-user tool like this, download might be less critical than upload.
                      // But to keep consistent:
                      setUserInput(saved.input || '');
                      setResult(saved.result || null);
                      setSelectedTitleIndex(saved.selectedTitleIndex !== undefined ? saved.selectedTitleIndex : null);
                      setGeneratedCover(saved.generatedCover || null);
                 }
              }

              setSyncStatus('synced');
              setLastAutoSave(new Date().toLocaleTimeString());
          } catch (e) {
              console.warn("Auto-sync failed", e);
              setSyncStatus('error');
          }

          // Schedule next run (5 mins)
          timeoutId = setTimeout(performSync, 5 * 60 * 1000);
      };

      // Initial Delay
      timeoutId = setTimeout(performSync, 5 * 60 * 1000);

      return () => clearTimeout(timeoutId);
  }, []);

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
        const dataToSave: AiTitlesState = { 
            input: userInput, 
            result, 
            selectedTitleIndex,
            generatedCover,
            updatedAt: now 
        };

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
  }, [userInput, result, selectedTitleIndex, generatedCover]);

  const loadPrompt = async () => {
    const prompts = await storage.getPrompts();
    if (prompts.AI_TITLES_GENERATOR) {
      setPromptTemplate(prompts.AI_TITLES_GENERATOR);
    }
  };

  const initData = async () => {
      // 1. Load Local First
      const saved = await storage.getToolData<AiTitlesState>(TOOL_ID);
      
      let currentData = saved;

      // 2. Check Remote (Sync on Load)
      try {
          const remote = await storage.fetchRemoteToolData<AiTitlesState>(TOOL_ID);
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
          // BACKWARD COMPATIBILITY CHECK
          // If titles is an array of strings (old version), map it to objects
          if (currentData.result && currentData.result.titles && typeof currentData.result.titles[0] === 'string') {
               const oldTitles = currentData.result.titles as any as string[];
               setResult({
                   ...currentData.result,
                   titles: oldTitles.map(t => ({ title: t, score: 0 }))
               });
          } else {
               setResult(currentData.result || null);
          }
          
          setSelectedTitleIndex(currentData.selectedTitleIndex !== undefined ? currentData.selectedTitleIndex : null);
          setGeneratedCover(currentData.generatedCover || null);

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
      prompt = prompt.replace('{{topic}}', userInput);
      
      const json = await gemini.generateJSON<AiTitlesResult>(prompt, {
          type: "OBJECT",
          properties: {
              titles: { 
                  type: "ARRAY", 
                  items: { 
                      type: "OBJECT",
                      properties: {
                          title: { type: "STRING" },
                          score: { type: "NUMBER" }
                      },
                      required: ["title", "score"]
                  } 
              },
              coverVisual: { type: "STRING" },
              coverText: { type: "STRING" }
          },
          required: ["titles", "coverVisual", "coverText"]
      });
      
      // Sort titles by score descending
      if (json.titles) {
          json.titles.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      setResult(json);
      // Reset selection and image on new text generation
      setSelectedTitleIndex(null);
      // setGeneratedCover(null); 
      
      const now = Date.now();
      setLastAutoSave(new Date(now).toLocaleTimeString());

    } catch (error: any) {
      alert(`生成失败: ${error.message}`);
      console.error(error);
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
      if (!result || selectedTitleIndex === null) {
          alert("请先选择一个标题");
          return;
      }
      
      setGeneratingImage(true);
      setSyncStatus('saving');

      try {
          const selectedTitle = result.titles[selectedTitleIndex].title;
          // Updated prompt to strictly request no text
          const prompt = `Youtube Video Thumbnail. High quality, cinematic lighting, 8k resolution. 
          Visual Description: ${result.coverVisual}. 
          IMPORTANT: The image must be completely text-free. Do not include any text, words, letters, or logos in the image.
          Mood/Context based on title: "${selectedTitle}".`;

          const base64 = await gemini.generateImage(prompt);
          setGeneratedCover(base64);

      } catch (e: any) {
          alert(`图片生成失败: ${e.message}`);
      } finally {
          setGeneratingImage(false);
      }
  };

  const handleDownloadCover = () => {
      if (!generatedCover || !result || selectedTitleIndex === null) return;
      
      const title = result.titles[selectedTitleIndex].title;
      // Create a temporary link to download
      const link = document.createElement("a");
      link.href = generatedCover;
      link.download = `${title}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleCopyTitles = () => {
    if (!result?.titles) return;
    navigator.clipboard.writeText(result.titles.map(t => t.title).join('\n'));
    alert("已复制标题列表");
  };

  const handleClear = async () => {
    if(!window.confirm("确定要清空所有内容吗？")) return;
    setUserInput('');
    setResult(null);
    setSelectedTitleIndex(null);
    setGeneratedCover(null);
    setLastAutoSave('');
    setSyncStatus(null);
    const emptyState: AiTitlesState = { input: '', result: null, selectedTitleIndex: null, generatedCover: null, updatedAt: Date.now() };
    await storage.saveToolData(TOOL_ID, emptyState);
    await storage.uploadToolData(TOOL_ID, emptyState);
  };

  // Content Edit Handlers
  const handleTitleChange = (index: number, newVal: string) => {
    if (!result) return;
    const newTitles = [...result.titles];
    newTitles[index] = { ...newTitles[index], title: newVal };
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

  const handleApproveTitle = async (title: string) => {
      const newId = crypto.randomUUID();
      const newProject: ProjectData = {
          id: newId,
          title: title,
          status: ProjectStatus.DRAFT,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          inputs: {
              topic: title,
              tone: '信息丰富且引人入胜',
              language: '中文'
          }
      };
      await storage.saveProject(newProject);
      navigate(`/project/${newId}`);
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
        <div className="flex flex-col items-end justify-end gap-2">
            <div className="flex items-center gap-3">
                 <button
                    onClick={handleGenerateImage}
                    disabled={generatingImage || !result || selectedTitleIndex === null}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                    {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    生成封面图片
                </button>
            </div>
            
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

        {/* Output Panel - Right 3/4 - Scrollable Container */}
        <div className="w-full md:w-3/4 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="flex-1 overflow-y-auto bg-[#FAFAFA]">
                
                {/* Section 1: Titles List */}
                <div className="bg-white border-b border-slate-200">
                    <div className="py-2 px-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
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
                    <div className="p-4">
                        {loading ? (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                                <span className="text-sm font-medium animate-pulse">AI 正在构思标题与封面...</span>
                            </div>
                        ) : result?.titles ? (
                            <div className="space-y-2">
                                {result.titles.map((item, idx) => (
                                    <div key={idx} className={`py-2 px-3 border rounded-lg shadow-sm hover:shadow-md transition-all flex gap-3 items-center group ${selectedTitleIndex === idx ? 'bg-violet-50 border-violet-200' : 'bg-white border-slate-100 hover:border-violet-100'}`}>
                                        
                                        {/* Radio Selection */}
                                        <button 
                                            onClick={() => setSelectedTitleIndex(idx)}
                                            className="shrink-0 text-slate-300 hover:text-violet-500 transition-colors"
                                        >
                                            {selectedTitleIndex === idx ? (
                                                <CheckCircle2 className="w-5 h-5 text-violet-600 fill-violet-100" />
                                            ) : (
                                                <Circle className="w-5 h-5" />
                                            )}
                                        </button>

                                        <span className="text-[10px] font-bold text-slate-300 w-4 text-center shrink-0">{idx + 1}</span>
                                        
                                        {/* Score Badge */}
                                        <div className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                            (item.score || 0) >= 90 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            (item.score || 0) >= 80 ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            'bg-slate-50 text-slate-500 border-slate-100'
                                        }`}>
                                            {item.score || 0}分
                                        </div>

                                        <input 
                                            type="text"
                                            value={item.title}
                                            onChange={(e) => handleTitleChange(idx, e.target.value)}
                                            className="flex-1 text-slate-800 font-medium text-sm leading-snug bg-transparent border-none focus:ring-0 outline-none w-full"
                                        />
                                        
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                            <button 
                                                onClick={() => handleApproveTitle(item.title)}
                                                className="px-2 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-bold rounded-md shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-1 whitespace-nowrap"
                                                title="采纳此标题并创建新项目"
                                            >
                                                <Rocket className="w-3 h-3" /> 采纳
                                            </button>
                                            <button 
                                                className="text-slate-300 hover:text-violet-600 transition-all p-1"
                                                onClick={() => navigator.clipboard.writeText(item.title)}
                                                title="复制此标题"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-300 gap-2 select-none">
                                <Type className="w-12 h-12 opacity-20" />
                                <span className="text-sm">生成的标题将显示在这里</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 2: Cover Details Split View */}
                <div className="flex flex-row bg-white min-h-[160px] border-b border-slate-200">
                    <div className="w-1/2 border-r border-slate-200 flex flex-col">
                        <div className="py-2 px-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5" /> 封面元素
                            </span>
                        </div>
                        <div className="flex-1">
                             {result ? (
                                 <textarea
                                    value={result.coverVisual}
                                    onChange={(e) => handleCoverVisualChange(e.target.value)}
                                    className="w-full h-full p-3 text-xs text-slate-600 leading-relaxed resize-none border-none outline-none focus:bg-slate-50/50"
                                    placeholder="封面视觉描述..."
                                />
                             ) : (
                                 <div className="p-3 text-slate-300 italic text-xs">等待生成...</div>
                             )}
                        </div>
                    </div>
                    <div className="w-1/2 flex flex-col">
                        <div className="py-2 px-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                             <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <ALargeSmall className="w-3.5 h-3.5" /> 封面文字
                            </span>
                        </div>
                        <div className="flex-1">
                             {result ? (
                                 <textarea
                                    value={result.coverText}
                                    onChange={(e) => handleCoverTextChange(e.target.value)}
                                    className="w-full h-full p-3 text-sm text-slate-800 font-bold leading-relaxed resize-none border-none outline-none focus:bg-slate-50/50"
                                    placeholder="封面大字文案..."
                                />
                             ) : (
                                 <div className="p-3 text-slate-300 italic text-xs">等待生成...</div>
                             )}
                        </div>
                    </div>
                </div>

                {/* Section 3: Image Preview */}
                <div className="bg-white">
                    <div className="py-2 px-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Wand2 className="w-3.5 h-3.5" /> 封面预览 (16:9)
                        </span>
                        {generatedCover && (
                             <button
                                onClick={() => setPreviewImage(generatedCover)}
                                className="text-slate-400 hover:text-violet-600 p-1 rounded transition-colors"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="p-4">
                         <div className="aspect-video w-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm relative group">
                            {generatedCover ? (
                                <>
                                    <img 
                                        src={generatedCover} 
                                        alt="Generated Cover" 
                                        className="w-full h-full object-cover"
                                    />
                                    {/* Download Button */}
                                    <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={handleDownloadCover}
                                            className="bg-white/90 hover:bg-white text-slate-700 hover:text-violet-600 px-3 py-1.5 rounded-lg font-bold text-xs shadow-lg backdrop-blur flex items-center gap-1.5 border border-white/50"
                                        >
                                            <Download className="w-3.5 h-3.5" /> 下载封面
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-3">
                                    {generatingImage ? (
                                        <>
                                            <Loader2 className="w-10 h-10 animate-spin text-fuchsia-500" />
                                            <span className="text-sm font-medium animate-pulse text-fuchsia-500">正在绘制封面...</span>
                                        </>
                                    ) : (
                                        <>
                                            <ImageIcon className="w-12 h-12 opacity-20" />
                                            <span className="text-sm">选中标题并点击右上角“生成封面图片”</span>
                                        </>
                                    )}
                                </div>
                            )}
                         </div>
                    </div>
                </div>

            </div>
        </div>
      </div>

      {/* Fullscreen Preview */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-[90vw] max-h-[90vh]">
                <img src={previewImage} alt="Full Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
                <button 
                    onClick={() => setPreviewImage(null)}
                    className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-8 h-8" />
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default AiTitles;
