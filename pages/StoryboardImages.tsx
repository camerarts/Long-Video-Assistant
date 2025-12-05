

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, Maximize2, CloudUpload, FileSpreadsheet, Palette, RotateCcw, CheckCircle2, AlertCircle, Settings2, Key, Zap, Clock } from 'lucide-react';
import JSZip from 'jszip';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // State for Image Generation
  const [generating, setGenerating] = useState(false);
  const [currentGenIds, setCurrentGenIds] = useState<Set<string>>(new Set());
  
  // State for Style Selection (Configuration Template Key)
  const [style_mode, setStyleMode] = useState<string>('IMAGE_GEN_A');

  // State for API Configuration (Key + Model + Turbo)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [imageModel, setImageModel] = useState<string>('gemini-2.5-flash-image');
  const [isTurboMode, setIsTurboMode] = useState(false);

  // State for Batch Progress (Internal)
  const [batchProgress, setBatchProgress] = useState({ planned: 0, completed: 0, failed: 0 });
  
  // State for Cloud Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });

  // State for Downloads and UI
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'warning'>('success');
  
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const init = async () => {
        if (id) {
            const p = await storage.getProject(id);
            if (p) {
                if (mountedRef.current) setProject(p);
            } else {
                if (mountedRef.current) navigate('/');
            }
        }
        const loadedPrompts = await storage.getPrompts();
        if (mountedRef.current) setPrompts(loadedPrompts);

        // Load Custom Key & Model & Turbo
        const savedKey = localStorage.getItem('lva_custom_gemini_key');
        if (savedKey && mountedRef.current) setCustomKey(savedKey);
        
        const savedModel = localStorage.getItem('lva_image_model');
        if (savedModel && mountedRef.current) setImageModel(savedModel);

        const savedTurbo = localStorage.getItem('lva_image_turbo');
        if (savedTurbo && mountedRef.current) setIsTurboMode(savedTurbo === 'true');
    };
    init();
  }, [id, navigate]);

  const handleSaveConfig = (keyVal: string, modelVal: string, turboVal: boolean) => {
    setCustomKey(keyVal);
    setImageModel(modelVal);
    setIsTurboMode(turboVal);
    
    localStorage.setItem('lva_custom_gemini_key', keyVal);
    localStorage.setItem('lva_image_model', modelVal);
    localStorage.setItem('lva_image_turbo', String(turboVal));
    
    setShowConfigModal(false);
    setMessageType('success');
    setMessage("API 配置已保存");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleClearConfig = () => {
    setCustomKey('');
    setImageModel('gemini-2.5-flash-image'); // Reset to default
    setIsTurboMode(false);
    
    localStorage.removeItem('lva_custom_gemini_key');
    localStorage.removeItem('lva_image_model');
    localStorage.removeItem('lva_image_turbo');
    
    setShowConfigModal(false);
    setMessageType('success');
    setMessage("已恢复默认设置");
    setTimeout(() => setMessage(null), 3000);
  };

  const handlePromptChange = async (frameId: string, newPrompt: string) => {
    if (!project || !project.storyboard) return;
    const updatedSb = project.storyboard.map(f => 
        f.id === frameId ? { ...f, imagePrompt: newPrompt } : f
    );
    // Optimistic UI
    const optimistic = { ...project, storyboard: updatedSb };
    setProject(optimistic); 
    
    // Background Atomic Save
    await storage.updateProject(id!, (latest) => ({
        ...latest,
        storyboard: latest.storyboard?.map(f => 
            f.id === frameId ? { ...f, imagePrompt: newPrompt } : f
        )
    }));
  };

  const interpolatePrompt = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const handleReimportPrompts = async () => {
    if (!project || !project.storyboard) return;
    
    // Get the name of current configuration for the alert
    const configName = prompts[style_mode]?.name || style_mode;

    if (!window.confirm(`确定要重新导入提示词吗？\n\n这将使用【${configName}】的最新模板覆盖当前所有图片的提示词内容。`)) {
        return;
    }

    // Fetch latest prompts to ensure we use current settings
    const currentPrompts = await storage.getPrompts();
    const template = currentPrompts[style_mode]?.template || '{{description}}';
    
    // Update storage
    const updatedProject = await storage.updateProject(id!, (latest) => {
        const newSb = latest.storyboard?.map(f => ({
            ...f,
            imagePrompt: interpolatePrompt(template, { description: f.description })
        }));
        return { ...latest, storyboard: newSb };
    });
    
    if (updatedProject && mountedRef.current) {
        setProject(updatedProject);
        // Also update local prompts state just in case
        setPrompts(currentPrompts);

        setMessageType('success');
        setMessage("提示词已重新导入成功！");
        setTimeout(() => setMessage(null), 3000);
    }
  };

  const generateSingleImage = async (frame: StoryboardFrame): Promise<string | null> => {
      // If the frame already has a specific user-edited prompt, use it.
      // Otherwise, interpolate using the CURRENTLY selected configuration template.
      let finalPrompt = frame.imagePrompt;
    
      if (!finalPrompt) {
          const template = prompts[style_mode]?.template || '{{description}}';
          finalPrompt = interpolatePrompt(template, { description: frame.description });
          // Save the interpolated prompt so the user can see what was used
          handlePromptChange(frame.id, finalPrompt);
      }
    
      // Pass custom key and selected model
      return await gemini.generateImage(finalPrompt, customKey || undefined, imageModel);
  };

  const handleBatchGenerate = async (framesToGenerate: StoryboardFrame[]) => {
    if (!project) return;
    
    setGenerating(true);
    setBatchProgress({ planned: framesToGenerate.length, completed: 0, failed: 0 });

    // SETTINGS FOR RATE LIMITING
    const CONCURRENCY_LIMIT = isTurboMode ? 3 : 1;
    // Dynamic delay: can be increased if 429 is hit
    let currentDelay = isTurboMode ? 200 : 3500;

    let index = 0;

    const processNext = async () => {
        if (index >= framesToGenerate.length) return;

        const frame = framesToGenerate[index++];
        
        // Update UI: Mark as loading
        if (mountedRef.current) {
            setCurrentGenIds(prev => new Set(prev).add(frame.id));
        }

        let retries = 0;
        const MAX_RETRIES = 3;
        let success = false;

        while (retries <= MAX_RETRIES && !success) {
            try {
                const base64 = await generateSingleImage(frame);

                if (base64) {
                    // Save locally to IndexedDB
                    const updated = await storage.updateProject(id!, (latest) => {
                        const newSb = latest.storyboard?.map(f => 
                            f.id === frame.id ? { ...f, imageUrl: base64, imageModel: imageModel } : f
                        );
                        return { ...latest, storyboard: newSb };
                    });
                    
                    // Update UI
                    if (mountedRef.current && updated) {
                        setProject(updated);
                        setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                        success = true;
                    }
                } else {
                    throw new Error("Empty response");
                }
            } catch(e: any) {
                const msg = e.message || '';
                // Check for 429 Rate Limit
                if ((msg.includes('429') || msg.includes('Quota')) && retries < MAX_RETRIES) {
                    retries++;
                    console.warn(`Rate limit hit for scene ${frame.sceneNumber}. Retrying (${retries}/${MAX_RETRIES})...`);
                    
                    // Increase global delay to slow down queue
                    currentDelay = Math.max(currentDelay, 10000); // Wait at least 10s between requests now

                    if (mountedRef.current) {
                        setMessageType('warning');
                        setMessage(`触发频率限制 (429)，休息 15 秒后自动重试... (${retries}/${MAX_RETRIES})`);
                    }

                    // Wait 15 seconds before retry
                    await new Promise(r => setTimeout(r, 15000));
                } else {
                    // Fatal Error or Max Retries reached
                    console.error(`Failed to generate image for scene ${frame.sceneNumber}`, e);
                    if (mountedRef.current) {
                        setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
                        setMessageType('error');
                        setMessage(`场景 ${frame.sceneNumber} 失败: ${msg}`);
                        setTimeout(() => setMessage(null), 6000);
                    }
                    break; // Exit retry loop
                }
            }
        }

        // UI: Unmark loading
        if (mountedRef.current) {
            setCurrentGenIds(prev => {
                const next = new Set(prev);
                next.delete(frame.id);
                return next;
            });
        }
    };

    // Queue Manager
    const runQueue = async () => {
        const workerPromises = [];
        for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
            workerPromises.push(
                (async () => {
                    while (index < framesToGenerate.length) {
                        await processNext();
                        // Wait dynamic delay
                        if (index < framesToGenerate.length) {
                             await new Promise(r => setTimeout(r, currentDelay));
                        }
                    }
                })()
            );
        }
        await Promise.all(workerPromises);
    };

    await runQueue();
    if (mountedRef.current) setGenerating(false);
  };

  const handleGenerateAll = () => {
      if (!project || !project.storyboard) return;
      // Filter: Only generate frames that DO NOT have an image yet
      const missingFrames = project.storyboard.filter(f => !f.imageUrl);
      if (missingFrames.length === 0) {
          alert("所有分镜都已生成图片。");
          return;
      }
      handleBatchGenerate(missingFrames);
  };

  const handleRetryFailed = () => {
      if (!project || !project.storyboard) return;
      const failedFrames = project.storyboard.filter(f => !f.imageUrl);
      handleBatchGenerate(failedFrames);
  };

  const handleUploadImages = async () => {
      if (!project || !project.storyboard) return;
      
      const localFrames = project.storyboard.filter(f => f.imageUrl && f.imageUrl.startsWith('data:'));
      if (localFrames.length === 0) {
          alert("没有检测到需要上传的本地图片。");
          return;
      }

      setUploading(true);
      setUploadProgress({ total: localFrames.length, current: 0 });

      for (const frame of localFrames) {
          try {
              if (frame.imageUrl) {
                  // Upload using project ID for folder structure
                  const cloudUrl = await storage.uploadImage(frame.imageUrl, project.id);
                  
                  // Update project atomically
                  const updated = await storage.updateProject(project.id, (latest) => {
                      const newSb = latest.storyboard?.map(f => 
                          f.id === frame.id ? { ...f, imageUrl: cloudUrl } : f
                      );
                      return { ...latest, storyboard: newSb };
                  });

                  if (mountedRef.current && updated) {
                      setProject(updated);
                      setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
                  }
              }
          } catch(e) {
              console.error("Failed to upload image", e);
          }
      }

      setUploading(false);
  };

  const handleDownloadPrompts = () => {
    if (!project || !project.storyboard || project.storyboard.length === 0) {
        alert("暂无分镜数据");
        return;
    }

    let csvContent = "\uFEFF";
    csvContent += "序号,AI绘画提示词\n";

    project.storyboard.forEach((frame) => {
        // Use frame prompt if available, else interpolate using current mode
        const prompt = frame.imagePrompt || interpolatePrompt(prompts[style_mode]?.template || '', { description: frame.description });
        // Escape quotes
        const safePrompt = `"${prompt.replace(/"/g, '""')}"`;
        csvContent += `${frame.sceneNumber},${safePrompt}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${project.title}_prompts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    if (!project || !project.storyboard) return;
    setDownloading(true);
    try {
        const zip = new JSZip();
        const folder = zip.folder(`storyboard-${project.title.substring(0, 10)}`) || zip;
        let count = 0;
        for (const frame of project.storyboard) {
            if (frame.imageUrl) {
                try {
                    const resp = await fetch(frame.imageUrl);
                    const blob = await resp.blob();
                    folder.file(`scene_${frame.sceneNumber}.png`, blob);
                    count++;
                } catch(e) {
                    console.error("Failed to fetch image for zip", e);
                }
            }
        }
        if (count === 0) {
            alert("没有可下载的图片。");
            setDownloading(false);
            return;
        }
        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project.title}-storyboard-images.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (e) {
        alert("打包下载失败");
    } finally {
        setDownloading(false);
    }
  };

  // Helper to show partial key
  const getMaskedKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 10) return '******';
    return `${key.slice(0, 4)}····${key.slice(-4)}`;
  };

  // Calculate Project Stats
  const totalScenes = project?.storyboard?.length || 0;
  // "Generated" means has any image URL (local or cloud)
  const generatedCount = project?.storyboard?.filter(f => !!f.imageUrl).length || 0;
  const unGeneratedCount = totalScenes - generatedCount;
  // "Saved" (Uploaded) means imageUrl starts with /api/ or http, but NOT data:
  const uploadedCount = project?.storyboard?.filter(f => f.imageUrl && !f.imageUrl.startsWith('data:')).length || 0;
  
  // Local images that need uploading
  const localCount = generatedCount - uploadedCount;

  if (!project) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-fuchsia-500 w-8 h-8" /></div>;

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC] relative">
        {message && (
            <div className={`fixed bottom-8 right-8 max-w-[90vw] md:max-w-lg text-white px-6 py-4 rounded-xl shadow-2xl z-50 font-bold flex items-start gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 shadow-rose-900/20 ${messageType === 'error' ? 'bg-rose-600' : (messageType === 'warning' ? 'bg-orange-500' : 'bg-emerald-600')}`}>
                <div className="shrink-0 mt-0.5">
                    {messageType === 'error' ? <AlertCircle className="w-5 h-5" /> : (messageType === 'warning' ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />)}
                </div>
                <div className="break-words text-sm leading-relaxed whitespace-pre-wrap">
                    {message}
                </div>
                <button onClick={() => setMessage(null)} className="shrink-0 text-white/70 hover:text-white ml-2">
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}

        {/* Top Status Bar */}
        <div className="bg-slate-900 text-white shadow-md z-20 border-b border-slate-800">
            <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 text-sm font-medium">共</span>
                    <strong className="text-2xl text-white font-extrabold tracking-tight">{totalScenes}</strong>
                    <span className="text-slate-400 text-sm font-medium">个分镜</span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-700 mx-2"></div>
                <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 text-sm font-medium">已生图</span>
                    <strong className="text-2xl text-emerald-400 font-extrabold tracking-tight">{generatedCount}</strong>
                    <span className="text-slate-400 text-sm font-medium">个</span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-700 mx-2"></div>
                <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 text-sm font-medium">未生图</span>
                    <strong className="text-2xl text-amber-400 font-extrabold tracking-tight">{unGeneratedCount}</strong>
                    <span className="text-slate-400 text-sm font-medium">个</span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-700 mx-2"></div>
                <div className="flex items-baseline gap-2">
                    <span className="text-slate-400 text-sm font-medium">已保存图片(云端)</span>
                    <strong className="text-2xl text-blue-400 font-extrabold tracking-tight">{uploadedCount}</strong>
                    <span className="text-slate-400 text-sm font-medium">个</span>
                </div>

                {batchProgress.failed > 0 && !generating && (
                    <button onClick={handleRetryFailed} className="ml-4 bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 animate-pulse shadow-lg border border-rose-400">
                        <RefreshCw className="w-3.5 h-3.5" /> 失败 {batchProgress.failed} 个 - 重试
                    </button>
                )}
            </div>
            
            {generating && (
                <div className="h-1 w-full bg-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-slate-800"></div>
                     <div className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-300 relative z-10" style={{ width: `${batchProgress.planned > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.planned) * 100 : 0}%` }}></div>
                </div>
            )}
        </div>

        {/* Header */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-4">
                 <button onClick={() => navigate(`/project/${project.id}`)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <ArrowLeft className="w-5 h-5" />
                 </button>
                 <div>
                    <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-fuchsia-600" />
                        分镜图片工坊
                    </h1>
                 </div>
            </div>

            <div className="flex items-center gap-2">

                {/* API Config Button */}
                <button
                    onClick={() => setShowConfigModal(true)}
                    className={`flex items-center gap-1.5 px-2 h-6 border rounded-md font-bold transition-all shadow-sm text-[9px] ${customKey || imageModel !== 'gemini-2.5-flash-image' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="配置 Gemini API Key 和 模型"
                >
                    <Settings2 className="w-3 h-3" />
                    API 配置
                </button>

                <div className="w-px h-4 bg-slate-200 mx-1"></div>

                <button
                    onClick={handleReimportPrompts}
                    className="flex-1 px-2 h-6 bg-white border border-slate-200 text-slate-600 rounded-md font-bold hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm text-[9px] flex items-center justify-center gap-1.5"
                    title="使用当前选择的配置模板，覆盖所有分镜的提示词"
                >
                    <RotateCcw className="w-3 h-3" />
                    重新导入提示词
                </button>
                
                {/* Style Selector / Configuration Selector */}
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 hover:border-slate-300 transition-colors h-6">
                    <Palette className="w-3 h-3 text-slate-400 mr-1.5" />
                    <select 
                        value={style_mode} 
                        onChange={(e) => setStyleMode(e.target.value)}
                        className="text-[10px] font-bold text-slate-700 bg-transparent outline-none cursor-pointer appearance-none pr-3"
                        title="选择提示词配置模板"
                    >
                        <option value="IMAGE_GEN_A">使用配置 A (默认)</option>
                        <option value="IMAGE_GEN_B">使用配置 B (备用)</option>
                    </select>
                </div>

                <button
                    onClick={handleGenerateAll}
                    disabled={generating || unGeneratedCount === 0}
                    className="flex items-center gap-1.5 px-2 h-6 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-md font-bold shadow-md shadow-fuchsia-500/20 hover:shadow-fuchsia-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[9px]"
                >
                    {generating ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3" />}
                    {unGeneratedCount === 0 ? '已全部生成' : '立刻生图'}
                </button>

                <button
                    onClick={handleUploadImages}
                    disabled={uploading || localCount === 0}
                    className="flex items-center gap-1.5 px-2 h-6 bg-blue-600 text-white rounded-md font-bold shadow-md shadow-blue-500/20 hover:bg-blue-500 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[9px]"
                    title={localCount > 0 ? `有 ${localCount} 张图片待上传` : '所有图片已同步'}
                >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : <CloudUpload className="w-3 h-3" />}
                    上传服务器
                </button>

                <button
                    onClick={handleDownloadPrompts}
                    className="flex items-center gap-1.5 px-2 h-6 bg-white border border-slate-200 text-slate-600 rounded-md font-bold hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm text-[9px]"
                >
                    <FileSpreadsheet className="w-3 h-3" />
                    下载提示词
                </button>

                <button
                    onClick={handleDownloadAll}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-2 h-6 bg-white border border-slate-200 text-slate-600 rounded-md font-bold hover:bg-slate-50 hover:text-fuchsia-600 hover:border-fuchsia-200 transition-all shadow-sm text-[9px]"
                >
                    {downloading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3" />}
                    批量下载
                </button>
            </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-8">
            
            {/* Project Title Header */}
            <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 tracking-tight leading-tight">
                    {project.title}
                </h2>
                {project.inputs.topic && project.inputs.topic !== project.title && (
                     <p className="text-slate-500 font-medium mt-1 text-sm">{project.inputs.topic}</p>
                )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-20 text-center">序号</th>
                            <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-[40%]">AI 绘图提示词</th>
                            <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">生成画面 (16:9)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {project.storyboard?.map((frame, index) => (
                            <tr key={frame.id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="py-6 px-6 text-center text-sm font-bold text-slate-400 align-top pt-8">
                                    {frame.sceneNumber}
                                </td>
                                <td className="py-6 px-6 align-top">
                                    <div className="space-y-2">
                                        <textarea
                                            value={frame.imagePrompt || interpolatePrompt(prompts[style_mode]?.template || '', { description: frame.description })}
                                            onChange={(e) => handlePromptChange(frame.id, e.target.value)}
                                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 resize-none outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-300 transition-all font-mono leading-relaxed"
                                            placeholder="输入提示词..."
                                        />
                                    </div>
                                </td>
                                <td className="py-6 px-6 align-top">
                                    {frame.imageUrl && frame.imageModel && (
                                        <div className="mb-2 text-[10px] text-slate-400 font-mono tracking-tight flex items-center gap-1">
                                            <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                                                Model: {frame.imageModel}
                                            </span>
                                        </div>
                                    )}

                                    <div className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm w-full max-w-md group/image">
                                        {frame.imageUrl ? (
                                            <>
                                                <img 
                                                    src={frame.imageUrl} 
                                                    alt={`Scene ${frame.sceneNumber}`} 
                                                    className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform duration-500"
                                                    onClick={() => setSelectedImage(frame.imageUrl!)}
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 pointer-events-none transition-colors" />
                                                <div className="absolute bottom-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity pointer-events-none">
                                                    <div className="bg-black/50 text-white p-1 rounded backdrop-blur">
                                                        <Maximize2 className="w-3 h-3" />
                                                    </div>
                                                </div>
                                                {frame.imageUrl.startsWith('data:') && (
                                                    <div className="absolute bottom-2 left-2 pointer-events-none">
                                                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 shadow-sm">
                                                            未同步
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2">
                                                {currentGenIds.has(frame.id) ? (
                                                    <>
                                                        <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
                                                        <span className="text-xs font-bold text-fuchsia-600 animate-pulse">绘制中...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ImageIcon className="w-10 h-10 opacity-30" />
                                                        <span className="text-xs font-medium opacity-50">待生成</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity z-10">
                                             <button 
                                                onClick={() => {
                                                    const doGen = async () => {
                                                        setCurrentGenIds(prev => new Set(prev).add(frame.id));
                                                        try {
                                                            const base64 = await generateSingleImage(frame);
                                                            if (base64) {
                                                                // Local Save
                                                                 await storage.updateProject(id!, (latest) => {
                                                                    const newSb = latest.storyboard?.map(f => f.id === frame.id ? { ...f, imageUrl: base64, imageModel: imageModel } : f);
                                                                    return { ...latest, storyboard: newSb };
                                                                 });
                                                                 const updated = await storage.getProject(id!);
                                                                 if(updated) setProject(updated);
                                                            }
                                                        } catch(e: any) {
                                                            console.error(e);
                                                            setMessageType('error');
                                                            setMessage(`生成失败: ${e.message}`);
                                                            setTimeout(() => setMessage(null), 6000);
                                                        } finally {
                                                            setCurrentGenIds(prev => {
                                                                const next = new Set(prev);
                                                                next.delete(frame.id);
                                                                return next;
                                                            });
                                                        }
                                                    };
                                                    doGen();
                                                }}
                                                disabled={currentGenIds.has(frame.id)}
                                                className="p-2 bg-white/90 backdrop-blur text-slate-600 hover:text-fuchsia-600 rounded-lg shadow-sm border border-white/50"
                                                title="重新生成这张图"
                                             >
                                                <RefreshCw className={`w-4 h-4 ${currentGenIds.has(frame.id) ? 'animate-spin' : ''}`} />
                                             </button>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                         {(!project.storyboard || project.storyboard.length === 0) && (
                            <tr>
                                <td colSpan={3} className="py-20 text-center text-slate-400">
                                    暂无分镜数据，请先在画布中生成分镜文案。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {selectedImage && (
            <div 
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                onClick={() => setSelectedImage(null)}
            >
                <div className="relative max-w-[90vw] max-h-[90vh]">
                    <img 
                        src={selectedImage} 
                        alt="Full size" 
                        className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
                    />
                    <button 
                        onClick={() => setSelectedImage(null)}
                        className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>
            </div>
        )}

      {/* API Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-indigo-600" />
                        API 配置
                    </h3>
                    <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <p className="text-xs text-slate-500 mb-4 leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-100">
                   提示：如果遇到 429 配额错误，请尝试配置自己的 API Key，或切换到 Pro 模型（通常有独立配额）。配置仅保存在本地。
                </p>

                <div className="space-y-4 mb-6">
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-xs font-bold text-slate-600">Google Gemini API Key</label>
                            {customKey && (
                                <div className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                    <span className="text-slate-400 select-none">预览:</span>
                                    <span className="font-bold text-slate-700">{getMaskedKey(customKey)}</span>
                                </div>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                type="password"
                                value={customKey}
                                onChange={(e) => setCustomKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pl-10 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono transition-all"
                            />
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">生图模型 (Image Model)</label>
                        <select
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer appearance-none"
                        >
                            <option value="gemini-2.5-flash-image">gemini-2.5-flash-image (Default)</option>
                            <option value="gemini-3-pro-image-preview">gemini-3-pro-image-preview (High Quality)</option>
                        </select>
                    </div>

                    {/* Turbo Mode Toggle */}
                    <div className={`p-3 rounded-xl border transition-all ${isTurboMode ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className="relative">
                                <input 
                                    type="checkbox" 
                                    checked={isTurboMode}
                                    onChange={(e) => setIsTurboMode(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </div>
                            <div className="flex-1">
                                <span className={`block text-xs font-bold ${isTurboMode ? 'text-indigo-700' : 'text-slate-600'}`}>
                                    开启极速并发模式 (Turbo)
                                </span>
                                <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">
                                    仅限 Pro 账户。可大幅提升生图速度，但免费 Key 会频繁失败 (429)。
                                </span>
                            </div>
                            <Zap className={`w-4 h-4 ${isTurboMode ? 'text-indigo-500 fill-indigo-100' : 'text-slate-300'}`} />
                        </label>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={handleClearConfig}
                        className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors"
                    >
                        恢复默认
                    </button>
                    <button 
                        onClick={() => handleSaveConfig(customKey, imageModel, isTurboMode)}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition-colors"
                    >
                        保存配置
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default StoryboardImages;
