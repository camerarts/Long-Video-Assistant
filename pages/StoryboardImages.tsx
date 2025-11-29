import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, AlertCircle, Maximize2 } from 'lucide-react';
import JSZip from 'jszip';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // State for Image Generation
  const [generating, setGenerating] = useState(false);
  const [currentGenIds, setCurrentGenIds] = useState<Set<string>>(new Set());
  
  // State for Status Bar
  const [progress, setProgress] = useState({ total: 0, planned: 0, success: 0, failed: 0 });
  
  // State for Downloads and UI
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
        if (id) {
            const p = await storage.getProject(id);
            if (p) {
                setProject(p);
                // Initialize progress
                if (p.storyboard) {
                    const total = p.storyboard.length;
                    const success = p.storyboard.filter(f => !!f.imageUrl).length;
                    setProgress({ total, planned: 0, success, failed: 0 });
                }
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
    const updated = { ...project, storyboard: updatedSb };
    setProject(updated); // Optimistic UI
    await storage.saveProject(updated); // Background save
  };

  const interpolatePrompt = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const generateSingleImage = async (frame: StoryboardFrame, isBatch = false): Promise<string | null> => {
      try {
        const prompt = frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: frame.description });
        // Update prompt if it was empty in data
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
    setProgress(prev => ({ ...prev, planned: framesToGenerate.length, failed: 0 }));

    // Track active IDs for UI spinners
    const ids = new Set(framesToGenerate.map(f => f.id));
    setCurrentGenIds(ids);

    // Create a pool of promises
    const promises = framesToGenerate.map(async (frame) => {
        const base64 = await generateSingleImage(frame, true);
        
        // Remove from active set
        setCurrentGenIds(prev => {
            const next = new Set(prev);
            next.delete(frame.id);
            return next;
        });

        if (base64) {
             // Update Success Counter
             setProgress(prev => ({ ...prev, success: prev.success + 1 }));
             
             // Update Project Data Immediately (Optimistic per frame)
             setProject(prev => {
                if (!prev || !prev.storyboard) return prev;
                const newSb = prev.storyboard.map(f => 
                    f.id === frame.id ? { ...f, imageUrl: base64 } : f
                );
                // Note: In a heavy parallel batch, frequently saving to DB/LocalStorage might be heavy.
                // We might debounce the save, but for now we save to ensure data safety.
                const updated = { ...prev, storyboard: newSb };
                storage.saveProject(updated);
                return updated;
             });
        } else {
             // Update Failed Counter
             setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
    });

    await Promise.all(promises);
    setGenerating(false);
    // Reset planned count after batch finishes
    setProgress(prev => ({ ...prev, planned: 0 }));
  };

  const handleGenerateAll = () => {
      if (!project || !project.storyboard) return;
      // Generate ALL frames (overwrite existing?) -> Usually "Generate All" implies running the workflow.
      // Or we can only generate missing ones. Let's assume regenerate ALL or generate missing.
      // Given the requirement "All images start immediately", we target all.
      handleBatchGenerate(project.storyboard);
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

  if (!project) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-fuchsia-500 w-8 h-8" /></div>;

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC] relative">
        {/* Status Bar (Conditional) */}
        <div className="bg-slate-900 text-white px-8 py-2 flex items-center justify-between text-xs font-medium z-20 shadow-md">
            <div className="flex items-center gap-6">
                <span className="text-slate-400">分镜画面: <strong className="text-white">{progress.total}</strong> 个</span>
                {generating && (
                    <span className="text-blue-400 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        计划生成: <strong>{progress.planned}</strong> 个
                    </span>
                )}
                <span className="text-emerald-400">已生成: <strong>{progress.success}</strong> 个</span>
                {progress.failed > 0 && (
                    <span className="text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        失败: <strong>{progress.failed}</strong> 个
                    </span>
                )}
            </div>
            
            {progress.failed > 0 && !generating && (
                <button 
                    onClick={handleRetryFailed}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 animate-pulse"
                >
                    <RefreshCw className="w-3 h-3" /> 失败画面重新生图
                </button>
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
                    disabled={generating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />}
                    立刻生图
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
                                                             setProject(prev => {
                                                                if (!prev || !prev.storyboard) return prev;
                                                                const newSb = prev.storyboard.map(f => f.id === frame.id ? { ...f, imageUrl: base64 } : f);
                                                                const updated = { ...prev, storyboard: newSb };
                                                                storage.saveProject(updated);
                                                                return updated;
                                                             });
                                                             setProgress(prev => ({ ...prev, success: prev.success + 1 }));
                                                        } else {
                                                             setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
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
