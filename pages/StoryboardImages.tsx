import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [currentGenId, setCurrentGenId] = useState<string | null>(null);

  // Template for image prompt
  const prompts = storage.getPrompts();

  useEffect(() => {
    if (id) {
      const p = storage.getProject(id);
      if (p) {
        setProject(p);
      } else {
        navigate('/');
      }
    }
  }, [id, navigate]);

  const saveProject = (updatedProject: ProjectData) => {
    storage.saveProject(updatedProject);
    setProject(updatedProject);
  };

  const handlePromptChange = (frameId: string, newPrompt: string) => {
    if (!project || !project.storyboard) return;
    const updatedSb = project.storyboard.map(f => 
        f.id === frameId ? { ...f, imagePrompt: newPrompt } : f
    );
    saveProject({ ...project, storyboard: updatedSb });
  };

  const interpolatePrompt = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const generateSingleImage = async (frame: StoryboardFrame): Promise<string | null> => {
      try {
        const prompt = frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN.template, { description: frame.description });
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

  const handleGenerateAll = async () => {
    if (!project || !project.storyboard) return;
    setGenerating(true);
    
    const frames = [...project.storyboard];
    
    // Process sequentially to avoid rate limits and allow UI updates
    for (const frame of frames) {
        // If image exists, skip unless we force (for now we assume "Generate Now" means generate missing or all? 
        // User said "Batch generate based on column 2". Let's assume re-generation if user clicks.
        // But for safety and cost, let's only generate if no image, or if we want to add a specific 'regenerate' button per row.
        // The prompt implies "Click button -> immediately batch generate". I'll generate ALL to ensure they match prompts.
        // Actually, to be safe, let's only generate missing ones OR create a flag? 
        // Let's generate ALL for the "Immediately Generate" button as it implies a full action.
        
        setCurrentGenId(frame.id);
        const base64 = await generateSingleImage(frame);
        
        if (base64) {
             setProject(prev => {
                if (!prev || !prev.storyboard) return prev;
                const newSb = prev.storyboard.map(f => 
                    f.id === frame.id ? { ...f, imageUrl: base64 } : f
                );
                const updated = { ...prev, storyboard: newSb };
                storage.saveProject(updated);
                return updated;
             });
        }
    }

    setCurrentGenId(null);
    setGenerating(false);
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
    <div className="flex flex-col h-full bg-[#F8F9FC]">
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
                                            value={frame.imagePrompt || interpolatePrompt(prompts.IMAGE_GEN.template, { description: frame.description })}
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
                                    <div className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm w-full max-w-md">
                                        {frame.imageUrl ? (
                                            <img src={frame.imageUrl} alt={`Scene ${frame.sceneNumber}`} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2">
                                                {currentGenId === frame.id ? (
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
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <button 
                                                onClick={() => {
                                                    // Trigger single generation logic here if needed, 
                                                    // For now reusing the batch logic by just forcing state update or extracting the function.
                                                    // Let's manually trigger a small localized update.
                                                    const doGen = async () => {
                                                        setCurrentGenId(frame.id);
                                                        const base64 = await generateSingleImage(frame);
                                                        if (base64) {
                                                             setProject(prev => {
                                                                if (!prev || !prev.storyboard) return prev;
                                                                const newSb = prev.storyboard.map(f => f.id === frame.id ? { ...f, imageUrl: base64 } : f);
                                                                storage.saveProject({ ...prev, storyboard: newSb });
                                                                return { ...prev, storyboard: newSb };
                                                             });
                                                        }
                                                        setCurrentGenId(null);
                                                    };
                                                    doGen();
                                                }}
                                                disabled={!!currentGenId}
                                                className="p-2 bg-white/90 backdrop-blur text-slate-600 hover:text-fuchsia-600 rounded-lg shadow-sm border border-white/50"
                                                title="重新生成这张图"
                                             >
                                                <RefreshCw className={`w-4 h-4 ${currentGenId === frame.id ? 'animate-spin' : ''}`} />
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
    </div>
  );
};

export default StoryboardImages;