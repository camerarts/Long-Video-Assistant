

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, AlertCircle, Maximize2, Save as SaveIcon } from 'lucide-react';
import JSZip from 'jszip';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // State for Image Generation
  const [generating, setGenerating] = useState(false);
  const [currentGenIds, setCurrentGenIds] = useState<Set<string>>(new Set());
  
  // State for Batch Progress (Internal)
  const [batchProgress, setBatchProgress] = useState({ planned: 0, completed: 0, failed: 0 });
  
  // State for Downloads and UI
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
        if (id) {
            const p = await storage.getProject(id);
            if (p) {
                setProject(p);
            } else {
                navigate('/');
            }
        }
        const loadedPrompts = await storage.getPrompts();
        setPrompts(loadedPrompts);
    };
    init();
  }, [id, navigate]);

  const saveProject = async (updatedProject: ProjectData) => {
    await storage.saveProject(updatedProject);
    setProject(updatedProject);
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

  const generateSingleImage = async (frame: StoryboardFrame, isBatch = false): Promise<string | null> => {
      try {
        const prompt = frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: frame.description });
        // If prompt was empty, save the interpolated one for reference
        if (!frame.imagePrompt) {
            handlePromptChange(frame.id, prompt);
        }
        return await gemini.generateImage(prompt);
      } catch (e) {
          console.error(`Error generating frame ${frame.id}`, e);
          return null;
      }
  };

  const handleBatchGenerate = async (framesToGenerate: StoryboardFrame[]) => {
    if (!project) return;
    
    setGenerating(true);
    setBatchProgress({ planned: framesToGenerate.length, completed: 0, failed: 0 });

    // Track active IDs for UI spinners
    const ids = new Set(framesToGenerate.map(f => f.id));
    setCurrentGenIds(ids);

    // Create a pool of promises
    const promises = framesToGenerate.map(async (frame) => {
        const base64 = await generateSingleImage(frame, true);
        
        // Remove from active set in UI
        setCurrentGenIds(prev => {
            const next = new Set(prev);
            next.delete(frame.id);
            return next;
        });

        if (base64) {
             // Atomic Update to Storage
             const updated = await storage.updateProject(id!, (latest) => {
                 const newSb = latest.storyboard?.map(f => 
                    f.id === frame.id ? { ...f, imageUrl: base64 } : f
                 );
                 return { ...latest, storyboard: newSb };
             });
             
             // Update UI with the atomic result to ensure consistency
             if (updated) setProject(updated);
             
             setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
        } else {
             setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
    });

    await Promise.all(promises);
    setGenerating(false);
  };

  const handleGenerateAll = () => {
      if (!project || !project.storyboard) return;
      
      // Filter: Only generate frames that DO NOT have an image yet
      const missingFrames = project.storyboard.filter(f => !f.imageUrl);
      
      if (missingFrames.length === 0) {
          alert("所有分镜都已生成图片。如需重新生成特定图片，请点击图片右上角的刷新按钮。");
          return;
      }

      handleBatchGenerate(missingFrames);
  };

  const handleRetryFailed = () => {
      if (!project || !project.storyboard) return;
      // Filter frames that don't have an imageURL
      const failedFrames = project.storyboard.filter(f => !f.imageUrl);
      handleBatchGenerate(failedFrames);
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
                // Remove data:image/png;base64, prefix
                const data = frame.imageUrl.split(',')[1];
                folder.file(`scene_${frame.sceneNumber}.png`, data, { base64: true });
                count++;
            }
        }

        if (count === 0) {
            alert("没有可下载的图片。请先生成图片。");
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
        console.error("Download failed", e);
        alert("打包下载失败");
    } finally {
        setDownloading(false);
    }
  };

  // Calculate Project Stats
  const totalScenes = project?.storyboard?.length || 0;
  const generatedCount = project?.storyboard?.filter(f => !!f.imageUrl).length || 0;
  const unGeneratedCount = totalScenes - generatedCount;
  // In this system, generated images are auto-saved to state/storage immediately, so Saved ~= Generated
  const savedCount = generatedCount;

  if (!project) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-fuchsia-500 w-8 h-8" /></div>;

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC] relative">
        {/* Top Status Bar (Centered, Large Bold Metrics) */}
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
                    <span className="text-slate-400 text-sm font-medium">已保存图片</span>
                    <strong className="text-2xl text-blue-400 font-extrabold tracking-tight">{savedCount}</strong>
                    <span className="text-slate-400 text-sm font-medium">个</span>
                </div>

                {/* Batch Failure Retry */}
                {batchProgress.failed > 0 && !generating && (
                    <button 
                        onClick={handleRetryFailed}
                        className="ml-4 bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 animate-pulse shadow-lg shadow-rose-900/50 border border-rose-400"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> 失败 {batchProgress.failed} 个 - 点击重试
                    </button>
                )}
            </div>
            
            {/* Generating Progress Bar Overlay */}
            {generating && (
                <div className="h-1 w-full bg-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-slate-800"></div>
                     <div 
                        className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-300 relative z-10" 
                        style={{ width: `${batchProgress.planned > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.planned) * 100 : 0}%` }}
                    ></div>
                </div>
            )}
        </div>

        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-4">
                 <button onClick={() => navigate(`/project/${project.id}`)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <ArrowLeft className="w-5 h-5" />
                 </button>
                 <div>
                    <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-fuchsia-600" />
                        分镜图片生成工坊
                    </h1>
                    <p className="text-xs font-medium text-slate-400">批量将文案转化为视觉画面</p>
                 </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={handleGenerateAll}
                    disabled={generating || unGeneratedCount === 0}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />}
                    {unGeneratedCount === 0 ? '已全部生成' : '立刻生图'}
                </button>
                <button
                    onClick={handleDownloadAll}
                    disabled={downloading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:text-fuchsia-600 hover:border-fuchsia-200 transition-all shadow-sm"
                >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4" />}
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
                                        
                                        {/* Row Action: Regenerate */}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity z-10">
                                             <button 
                                                onClick={() => {
                                                    const doGen = async () => {
                                                        setCurrentGenIds(prev => new Set(prev).add(frame.id));
                                                        const base64 = await generateSingleImage(frame);
                                                        if (base64) {
                                                             await storage.updateProject(id!, (latest) => {
                                                                const newSb = latest.storyboard?.map(f => f.id === frame.id ? { ...f, imageUrl: base64 } : f);
                                                                return { ...latest, storyboard: newSb };
                                                             });
                                                             // Trigger reload to update UI
                                                             const updated = await storage.getProject(id!);
                                                             if(updated) setProject(updated);
                                                        }
                                                        setCurrentGenIds(prev => {
                                                            const next = new Set(prev);
                                                            next.delete(frame.id);
                                                            return next;
                                                        });
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

        {/* Lightbox Modal */}
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
