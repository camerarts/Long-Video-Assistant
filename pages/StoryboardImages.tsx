import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import JSZip from 'jszip';
import { 
  ArrowLeft, Image as ImageIcon, Sparkles, Loader2, Trash2, RefreshCw, 
  Download, AlertCircle, Ban, CheckCircle2, Play, Cloud, CloudCheck, StopCircle,
  ExternalLink, ZoomIn, X, Wand2, Package, Settings2, Key, ClipboardPaste
} from 'lucide-react';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Generation State
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Config State
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  const [customKey, setCustomKey] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  // Default to 'A' (Cinematic), removed UI toggle as requested
  const [styleMode] = useState<'A' | 'B'>('A');

  // UI State
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState('');

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const init = async () => {
      if (id) {
        // 1. Local Load
        const p = await storage.getProject(id);
        if (p && mountedRef.current) setProject(p);
        
        // 2. Cloud Sync (Lightweight)
        setSyncStatus('saving');
        try {
            const remoteP = await storage.syncProject(id);
            if (remoteP && mountedRef.current) {
                if (!p || remoteP.updatedAt > p.updatedAt) {
                    setProject(remoteP);
                }
                setSyncStatus('synced');
                setLastSyncTime(new Date().toLocaleTimeString());
            } else {
                if (mountedRef.current) setSyncStatus('synced');
            }
        } catch (e) {
            console.warn(e);
            if (mountedRef.current) setSyncStatus('error');
        }
      }

      const loadedPrompts = await storage.getPrompts();
      if (mountedRef.current) setPrompts(loadedPrompts);
      
      const k = localStorage.getItem('lva_custom_api_key');
      if (k && mountedRef.current) setCustomKey(k);
      
      if (mountedRef.current) setLoading(false);
    };
    init();
    return () => { 
        mountedRef.current = false; 
        if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [id]);

  const saveSettings = () => {
      localStorage.setItem('lva_custom_api_key', customKey);
      setShowConfigModal(false);
  };

  const getMaskedKey = (key: string) => {
      if (!key || key.length < 8) return '';
      return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  const handlePasteKey = async () => {
      try {
          const text = await navigator.clipboard.readText();
          if (text) setCustomKey(text);
      } catch (err) {
          console.error('Failed to read clipboard', err);
      }
  };

  const saveProjectUpdate = async (updater: (p: ProjectData) => ProjectData) => {
    if (!id) return;
    const updated = await storage.updateProject(id, updater);
    if (updated && mountedRef.current) {
        setProject(updated);
        // Background Cloud Push
        setSyncStatus('saving');
        try {
            await storage.uploadProjects();
            if (mountedRef.current) {
                setSyncStatus('synced');
                setLastSyncTime(new Date().toLocaleTimeString());
            }
        } catch (e) {
            console.error("Auto-save failed", e);
            if (mountedRef.current) setSyncStatus('error');
        }
    }
  };

  const constructPrompt = (description: string) => {
      const templateKey = styleMode === 'A' ? 'IMAGE_GEN_A' : 'IMAGE_GEN_B';
      const template = prompts[templateKey]?.template || '{{description}}';
      return template.replace('{{description}}', description);
  };

  const handleGenerateImage = async (frame: StoryboardFrame) => {
      if (generatingIds.has(frame.id)) return;

      setGeneratingIds(prev => new Set(prev).add(frame.id));
      
      try {
          const prompt = constructPrompt(frame.imagePrompt || frame.description);
          
          // 1. Generate (returns base64)
          const base64 = await gemini.generateImage(prompt, customKey);

          // 2. Upload to R2 (if configured) or keep base64
          let finalUrl = base64;
          try {
              if (project?.id) {
                 finalUrl = await storage.uploadImage(base64, project.id);
              }
          } catch (e) {
              console.warn("R2 upload failed, falling back to base64 storage locally.", e);
          }

          // 3. Update Project
          await saveProjectUpdate(p => ({
              ...p,
              storyboard: p.storyboard?.map(f => 
                  f.id === frame.id ? { ...f, imageUrl: finalUrl, imageModel: 'gemini-2.5-flash-image' } : f
              )
          }));

      } catch (error: any) {
          alert(`生成失败 (Frame ${frame.sceneNumber}): ${error.message}`);
      } finally {
          if (mountedRef.current) {
              setGeneratingIds(prev => {
                  const next = new Set(prev);
                  next.delete(frame.id);
                  return next;
              });
          }
      }
  };

  const handleBatchGenerate = async () => {
      if (!project?.storyboard) return;
      
      const targetFrames = project.storyboard.filter(f => !f.imageUrl && !f.skipGeneration);
      if (targetFrames.length === 0) {
          alert("没有需要生成的画面（已完成或已跳过）。");
          return;
      }

      setIsBatchRunning(true);
      abortControllerRef.current = new AbortController();

      // Mark all as generating
      setGeneratingIds(new Set(targetFrames.map(f => f.id)));

      // Execute sequentially
      for (const frame of targetFrames) {
          if (abortControllerRef.current?.signal.aborted) break;
          await handleGenerateImage(frame);
          await new Promise(r => setTimeout(r, 500));
      }

      if (mountedRef.current) {
          setIsBatchRunning(false);
          setGeneratingIds(new Set());
          abortControllerRef.current = null;
      }
  };

  const handleStopBatch = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsBatchRunning(false);
          setGeneratingIds(new Set()); 
      }
  };

  const handleDeleteImage = async (frame: StoryboardFrame) => {
      if (!window.confirm('确定要删除这张图片吗？')) return;
      
      if (frame.imageUrl && !frame.imageUrl.startsWith('data:')) {
          await storage.deleteImage(frame.imageUrl);
      }

      await saveProjectUpdate(p => ({
          ...p,
          storyboard: p.storyboard?.map(f => 
              f.id === frame.id ? { ...f, imageUrl: undefined } : f
          )
      }));
  };

  const handleToggleSkip = async (frame: StoryboardFrame) => {
      await saveProjectUpdate(p => ({
          ...p,
          storyboard: p.storyboard?.map(f => 
              f.id === frame.id ? { ...f, skipGeneration: !f.skipGeneration } : f
          )
      }));
  };

  const handleDownload = (frame: StoryboardFrame) => {
      if (!frame.imageUrl) return;
      const link = document.createElement("a");
      link.href = frame.imageUrl;
      link.download = `scene_${frame.sceneNumber}_${project?.id.substring(0,4)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
      if (!project?.storyboard) return;
      const framesWithImages = project.storyboard.filter(f => !!f.imageUrl);
      if (framesWithImages.length === 0) {
          alert("没有可下载的图片");
          return;
      }

      setIsZipping(true);
      try {
          const zip = new JSZip();
          // Create a folder inside zip
          const folderName = `${project.title || 'storyboard'}_images`;
          const folder = zip.folder(folderName);

          // Fetch all images
          const promises = framesWithImages.map(async (frame) => {
              if (!frame.imageUrl) return;
              
              const filename = `scene_${String(frame.sceneNumber).padStart(3, '0')}.png`;

              if (frame.imageUrl.startsWith('data:')) {
                  // Base64
                  const base64Data = frame.imageUrl.split(',')[1];
                  folder?.file(filename, base64Data, { base64: true });
              } else {
                  // URL - Fetch blob
                  try {
                    const response = await fetch(frame.imageUrl);
                    const blob = await response.blob();
                    folder?.file(filename, blob);
                  } catch (e) {
                      console.error(`Failed to download frame ${frame.sceneNumber}`, e);
                  }
              }
          });

          await Promise.all(promises);

          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${project.title}_storyboard.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

      } catch (e: any) {
          alert(`打包下载失败: ${e.message}`);
          console.error(e);
      } finally {
          setIsZipping(false);
      }
  };

  if (loading || !project) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" /></div>;
  }

  // Real-time Stats
  const stats = {
      total: project.storyboard?.length || 0,
      generated: project.storyboard?.filter(f => !!f.imageUrl).length || 0,
      // Pending = No Image AND Not Skipped
      pending: project.storyboard?.filter(f => !f.imageUrl && !f.skipGeneration).length || 0,
      uploaded: project.storyboard?.filter(f => f.imageUrl && !f.imageUrl.startsWith('data:')).length || 0
  };

  const progressPercent = stats.total > 0 ? (stats.generated / stats.total) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC]">
      
      {/* Top Black Stats Bar */}
      <div className="bg-slate-900 text-white px-8 py-3 flex items-center justify-center gap-8 md:gap-12 text-xs md:text-sm font-bold tracking-wide shadow-md z-20 flex-shrink-0 border-b border-slate-800">
          <div className="flex items-baseline gap-2 group cursor-default">
             <span className="text-slate-400 uppercase tracking-wider text-[10px]">总计</span>
             <span className="text-white text-lg md:text-xl font-mono">{stats.total}</span>
             <span className="text-slate-600 text-[10px]">张</span>
          </div>
          <div className="w-px h-4 bg-slate-700/50"></div>
          <div className="flex items-baseline gap-2 group cursor-default">
             <span className="text-emerald-400 uppercase tracking-wider text-[10px]">已完成</span>
             <span className="text-white text-lg md:text-xl font-mono">{stats.generated}</span>
             <span className="text-slate-600 text-[10px]">张</span>
          </div>
          <div className="w-px h-4 bg-slate-700/50"></div>
          <div className="flex items-baseline gap-2 group cursor-default">
             <span className="text-amber-400 uppercase tracking-wider text-[10px]">待生成</span>
             <span className="text-white text-lg md:text-xl font-mono">{stats.pending}</span>
             <span className="text-slate-600 text-[10px]">张</span>
          </div>
          <div className="w-px h-4 bg-slate-700/50"></div>
          <div className="flex items-baseline gap-2 group cursor-default">
             <span className="text-blue-400 uppercase tracking-wider text-[10px]">已上传云端</span>
             <span className="text-white text-lg md:text-xl font-mono">{stats.uploaded}</span>
             <span className="text-slate-600 text-[10px]">张</span>
          </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => navigate(`/project/${id}`)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                  <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-fuchsia-600" />
                      分镜图片工坊
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-normal truncate max-w-[200px]">
                          {project.title}
                      </span>
                  </h1>
              </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <button
                onClick={() => setShowConfigModal(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border ${customKey ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                title="配置自定义 API Key"
              >
                <Settings2 className="w-4 h-4" />
                <span className="hidden lg:inline">API</span>
              </button>

              <button
                 onClick={handleDownloadAll}
                 disabled={isZipping || stats.generated === 0}
                 className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-fuchsia-300 hover:bg-fuchsia-50 text-slate-600 hover:text-fuchsia-600 rounded-xl font-bold shadow-sm transition-all disabled:opacity-50 text-xs"
                 title="打包下载所有生成的图片"
              >
                  {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  一键下载
              </button>

              {isBatchRunning ? (
                  <button 
                    onClick={handleStopBatch}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-500/30 transition-all text-xs"
                  >
                      <StopCircle className="w-4 h-4 animate-pulse" /> 停止生成
                  </button>
              ) : (
                  <button 
                    onClick={handleBatchGenerate}
                    disabled={stats.pending === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 text-xs"
                  >
                      <Play className="w-4 h-4 fill-current" /> 批量生成 ({stats.pending})
                  </button>
              )}
          </div>
      </div>
      
      {/* Progress Bar */}
      <div className="h-1 bg-slate-100 w-full flex-shrink-0">
          <div 
            className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#F8F9FC]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-24 text-center">序号</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-[25%]">原文 (Original)</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-[25%]">画面描述 (Prompt)</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-[40%] text-center">当前画面</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(!project.storyboard || project.storyboard.length === 0) ? (
                             <tr>
                                 <td colSpan={4} className="py-12 text-center text-slate-400">
                                     暂无分镜数据
                                 </td>
                             </tr>
                        ) : (
                            project.storyboard.map((frame) => {
                                const isGenerating = generatingIds.has(frame.id);
                                const hasImage = !!frame.imageUrl;
                                
                                return (
                                    <tr key={frame.id} className={`group hover:bg-slate-50/80 transition-colors ${frame.skipGeneration ? 'bg-slate-50/50' : ''}`}>
                                        {/* Scene Number & Skip Button */}
                                        <td className="py-4 px-6 text-center align-top pt-6">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                                                    #{frame.sceneNumber}
                                                </div>
                                                <button 
                                                    onClick={() => handleToggleSkip(frame)}
                                                    className="group transition-all focus:outline-none"
                                                    title={frame.skipGeneration ? "恢复生成" : "跳过此镜头"}
                                                >
                                                    {frame.skipGeneration ? (
                                                        // Checked (Skipped) State - Box with X
                                                        <div className="w-5 h-5 border-2 border-rose-400 bg-rose-50 rounded flex items-center justify-center shadow-sm">
                                                            <X className="w-3.5 h-3.5 text-rose-500" strokeWidth={3} />
                                                        </div>
                                                    ) : (
                                                        // Unchecked (Active) State - Empty Box
                                                        <div className="w-5 h-5 border-2 border-slate-300 rounded bg-white hover:border-fuchsia-400 hover:shadow-sm transition-colors"></div>
                                                    )}
                                                </button>
                                            </div>
                                        </td>

                                        {/* Original Text */}
                                        <td className="py-4 px-6 align-top pt-6">
                                            <p className={`leading-relaxed whitespace-pre-wrap ${frame.skipGeneration ? 'text-slate-400' : 'text-slate-800'}`}>
                                                {frame.originalText ? (
                                                    <>
                                                        <span className={`text-lg font-extrabold ${frame.skipGeneration ? 'text-slate-400' : 'text-slate-900'}`}>{frame.originalText.substring(0, 8)}</span>
                                                        <span className={`text-sm ${frame.skipGeneration ? 'text-slate-400' : 'text-slate-800'}`}>{frame.originalText.substring(8)}</span>
                                                    </>
                                                ) : <span className="text-slate-400 italic text-sm">--</span>}
                                            </p>
                                        </td>

                                        {/* Prompt Description */}
                                        <td className="py-4 px-6 align-top pt-6">
                                            <div className="space-y-2">
                                                <p className={`text-xs leading-relaxed whitespace-pre-wrap font-mono ${frame.skipGeneration ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-600'}`}>
                                                    {frame.description}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    {frame.imageModel ? (
                                                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 font-mono">
                                                            {frame.imageModel.replace('gemini-', '')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-300 rounded border border-slate-100 font-mono">
                                                            Pending
                                                        </span>
                                                    )}
                                                    {hasImage && !frame.imageUrl?.startsWith('data:') && (
                                                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded border border-emerald-100 flex items-center gap-1">
                                                            <CloudCheck className="w-3 h-3" /> 已同步
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Image Area */}
                                        <td className="py-4 px-6 align-top">
                                            <div className="w-full max-w-[400px] mx-auto">
                                                <div className={`aspect-video rounded-xl relative overflow-hidden shadow-sm group/image ${isGenerating ? 'p-[3px]' : 'border border-slate-200 bg-slate-100'}`}>
                                                    
                                                    {/* Rotating Fluorescent Border for Generating State */}
                                                    {isGenerating && (
                                                        <div className="absolute inset-[-50%] bg-[conic-gradient(transparent_0deg,transparent_340deg,#d946ef_360deg)] animate-[spin_2s_linear_infinite]" />
                                                    )}

                                                    <div className={`relative w-full h-full rounded-[9px] overflow-hidden ${isGenerating ? 'bg-slate-50' : ''}`}>
                                                        {hasImage ? (
                                                            <>
                                                                <img 
                                                                    src={frame.imageUrl} 
                                                                    alt={`Scene ${frame.sceneNumber}`} 
                                                                    className="w-full h-full object-cover" 
                                                                />
                                                                
                                                                {/* Floating Regenerate Button - Top Right */}
                                                                <button 
                                                                    onClick={() => handleGenerateImage(frame)}
                                                                    disabled={isGenerating || frame.skipGeneration}
                                                                    className="absolute top-2 right-2 p-2 bg-white/80 hover:bg-white text-slate-600 hover:text-fuchsia-600 rounded-lg backdrop-blur-sm shadow-sm opacity-0 group-hover/image:opacity-100 transition-all z-20"
                                                                    title="重新生成"
                                                                >
                                                                    <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                                                </button>

                                                                {/* Overlay Actions */}
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[1px]">
                                                                    <button 
                                                                        onClick={() => setPreviewImage(frame.imageUrl!)}
                                                                        className="p-2 bg-white/20 hover:bg-white text-white hover:text-slate-900 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
                                                                        title="预览"
                                                                    >
                                                                        <ZoomIn className="w-4 h-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleDownload(frame)}
                                                                        className="p-2 bg-white/20 hover:bg-white text-white hover:text-emerald-600 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
                                                                        title="下载"
                                                                    >
                                                                        <Download className="w-4 h-4" />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleDeleteImage(frame)}
                                                                        className="p-2 bg-white/20 hover:bg-white text-white hover:text-rose-600 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
                                                                        title="删除"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                                                {isGenerating ? (
                                                                    <>
                                                                        <Loader2 className="w-6 h-6 text-fuchsia-500 animate-spin mb-2" />
                                                                        <span className="text-[10px] font-bold text-fuchsia-600 animate-pulse">AI 绘制中...</span>
                                                                    </>
                                                                ) : frame.skipGeneration ? (
                                                                    <>
                                                                        <Ban className="w-6 h-6 text-slate-300 mb-2" />
                                                                        <span className="text-[10px] text-slate-400">已跳过</span>
                                                                    </>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handleGenerateImage(frame)}
                                                                        className="group/btn flex flex-col items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
                                                                    >
                                                                        <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                                                                            <Wand2 className="w-4 h-4 text-fuchsia-500" />
                                                                        </div>
                                                                        <span className="text-[10px] font-bold text-slate-500 group-hover/btn:text-fuchsia-600">点击生成</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
             </div>
          </div>
      </div>

      {/* Preview Modal */}
      {previewImage && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
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

      {/* API Config Modal */}
      {showConfigModal && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                          <Settings2 className="w-6 h-6 text-indigo-600" />
                          API 配置
                      </h3>
                      <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  
                  <div className="p-8 space-y-6">
                      {/* API Key Input */}
                      <div>
                          <label className="text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                              <span>自定义 API Key (可选)</span>
                              {customKey && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-mono">{getMaskedKey(customKey)}</span>}
                          </label>
                          <div className="relative">
                              <Key className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                              <input 
                                  type="password"
                                  value={customKey}
                                  onChange={(e) => setCustomKey(e.target.value)}
                                  placeholder="sk-..."
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-20 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                              />
                              <button 
                                  onClick={handlePasteKey}
                                  className="absolute right-2 top-2 bottom-2 px-3 flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 transition-colors shadow-sm"
                                  title="从剪贴板粘贴"
                              >
                                  <ClipboardPaste className="w-3.5 h-3.5" />
                                  粘贴
                              </button>
                          </div>
                          <p className="text-xs text-slate-400 mt-2">
                              如果不填，将使用系统默认的环境变量 Key。填入后将优先使用此 Key 进行文本生成和数据处理。
                          </p>
                      </div>
                  </div>

                  <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                      <button 
                          onClick={() => setCustomKey('')}
                          className="px-4 py-2 text-slate-500 font-bold text-sm hover:text-rose-600 transition-colors"
                      >
                          恢复默认
                      </button>
                      <button 
                          onClick={saveSettings}
                          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all text-sm"
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
