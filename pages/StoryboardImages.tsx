

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, Maximize2, CloudUpload, FileSpreadsheet, Palette, RotateCcw, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // State for Image Generation
  const [generating, setGenerating] = useState(false);
  const [currentGenIds, setCurrentGenIds] = useState<Set<string>>(new Set());
  
  // State for Style Selection
  const [style_mode, setStyleMode] = useState<string>('comic');

  // State for Batch Progress (Internal)
  const [batchProgress, setBatchProgress] = useState({ planned: 0, completed: 0, failed: 0 });
  
  // State for Cloud Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });

  // State for Downloads and UI
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
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
    };
    init();
  }, [id, navigate]);

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
    
    if (!window.confirm('确定要重新导入提示词吗？这将使用最新的“图片生成配置”和“分镜描述”覆盖当前所有输入框的内容。')) {
        return;
    }

    // Fetch latest prompts to ensure we use current settings
    const currentPrompts = await storage.getPrompts();
    const template = currentPrompts.IMAGE_GEN?.template || '{{description}}';
    
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

        setMessage("提示词已重新导入成功！");
        setTimeout(() => setMessage(null), 3000);
    }
  };

  const generateSingleImage = async (frame: StoryboardFrame): Promise<string | null> => {
      try {
        let basePrompt = frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: frame.description });
        
        // Add Style Modifier using style_mode variable
        let stylePrefix = "";
        if (style_mode === 'comic') {
            stylePrefix = "线条漫画插画写实风格，半真实，仿真皮肤，OC质感，超清画质32K，黑色线条厚涂。"; 
        } else if (style_mode === 'realism') {
            stylePrefix = "写实照片，纪实摄影，真实皮肤质感。"; 
        }
        
        const finalPrompt = stylePrefix + basePrompt;

        // If prompt was empty in data, save the interpolated one (without style prefix if possible, or we can just leave it dynamic in UI)
        // Ideally we save the base user intention. But for consistency with previous logic:
        if (!frame.imagePrompt) {
            handlePromptChange(frame.id, basePrompt);
        }
        
        return await gemini.generateImage(finalPrompt);
      } catch (e) {
          console.error(`Error generating frame ${frame.id}`, e);
          return null;
      }
  };

  const handleBatchGenerate = async (framesToGenerate: StoryboardFrame[]) => {
    if (!project) return;
    
    setGenerating(true);
    setBatchProgress({ planned: framesToGenerate.length, completed: 0, failed: 0 });

    const CONCURRENCY_LIMIT = 3; // Prevent freezing by limiting parallel requests
    let activeCount = 0;
    let index = 0;
    const results: Promise<void>[] = [];

    const processNext = async () => {
        if (index >= framesToGenerate.length) return;

        const frame = framesToGenerate[index++];
        
        // Update UI: Mark as loading
        if (mountedRef.current) {
            setCurrentGenIds(prev => new Set(prev).add(frame.id));
        }

        try {
            const base64 = await generateSingleImage(frame);

            if (base64) {
                 // Save locally to IndexedDB
                 const updated = await storage.updateProject(id!, (latest) => {
                     const newSb = latest.storyboard?.map(f => 
                        f.id === frame.id ? { ...f, imageUrl: base64 } : f
                     );
                     return { ...latest, storyboard: newSb };
                 });
                 
                 // Update UI with the atomic result to ensure consistency
                 if (mountedRef.current && updated) {
                    setProject(updated);
                    setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                 }
            } else {
                 if (mountedRef.current) {
                    setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
                 }
            }
        } catch(e) {
            console.error("Failed to generate image", e);
            if (mountedRef.current) {
                setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
            }
        } finally {
             // UI: Unmark loading
             if (mountedRef.current) {
                setCurrentGenIds(prev => {
                    const next = new Set(prev);
                    next.delete(frame.id);
                    return next;
                });
             }
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
        const prompt = frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: frame.description });
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
            <div className="fixed bottom-8 right-8 bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-xl z-50 font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 duration-300">
                <CheckCircle2 className="w-5 h-5" />
                {message}
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

                <button
                    onClick={handleReimportPrompts}
                    className="flex items-center gap-1.5 px-2 h-6 bg-white border border-slate-200 text-slate-600 rounded-md font-bold hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm text-[9px]"
                    title="重新根据分镜文案和配置生成提示词"
                >
                    <RotateCcw className="w-3 h-3" />
                    重新导入提示词
                </button>
                
                {/* Style Selector */}
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 hover:border-slate-300 transition-colors h-6">
                    <Palette className="w-3 h-3 text-slate-400 mr-1.5" />
                    <select 
                        value={style_mode} 
                        onChange={(e) => setStyleMode(e.target.value)}
                        className="text-[10px] font-bold text-slate-700 bg-transparent outline-none cursor-pointer appearance-none pr-3"
                        title="选择生图风格"
                    >
                        <option value="comic">漫画写实风格</option>
                        <option value="realism">纪实风格</option>
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
                                            value={frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: frame.description })}
                                            onChange={(e) => handlePromptChange(frame.id, e.target.value)}
                                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 resize-none outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-300 transition-all font-mono leading-relaxed"
                                            placeholder="输入提示词..."
                                        />
                                        <div className="flex justify-end">
                                             <span className="text-[10px] text-slate-400 font-medium bg-white px-2 py-1 rounded border border-slate-100">
                                                场景描述: {frame.description.substring(0, 30)}...
                                             </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-6 px-6 align-top">
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
                                                                    const newSb = latest.storyboard?.map(f => f.id === frame.id ? { ...f, imageUrl: base64 } : f);
                                                                    return { ...latest, storyboard: newSb };
                                                                 });
                                                                 const updated = await storage.getProject(id!);
                                                                 if(updated) setProject(updated);
                                                            }
                                                        } catch(e) {
                                                            console.error(e);
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
    </div>
  );
};

export default StoryboardImages;
