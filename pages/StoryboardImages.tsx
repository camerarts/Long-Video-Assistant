import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { 
  ArrowLeft, Image as ImageIcon, Sparkles, Loader2, Trash2, RefreshCw, 
  Download, AlertCircle, Ban, CheckCircle2, Play, Cloud, CloudCheck, StopCircle,
  ExternalLink, ZoomIn, X, Wand2, MoreHorizontal
} from 'lucide-react';

const StoryboardImages: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Generation State
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Config State
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  const [customKey, setCustomKey] = useState('');
  const [styleMode, setStyleMode] = useState<'A' | 'B'>('A');

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
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4 w-full md:w-auto">
              <button onClick={() => navigate(`/project/${id}`)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                  <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-fuchsia-600" />
                      生图工坊
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-normal truncate max-w-[200px]">
                          {project.title}
                      </span>
                  </h1>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-medium">
                      <span>总计: {stats.total}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-emerald-600">已完成: {stats.generated}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-amber-600">待生成: {stats.pending}</span>
                      
                      {syncStatus && (
                         <div className={`ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                             syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600' : 
                             syncStatus === 'saving' ? 'bg-blue-50 text-blue-600' :
                             'bg-rose-50 text-rose-600'
                         }`}>
                             {syncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudCheck className="w-3 h-3" />}
                             {syncStatus === 'synced' ? '已同步' : syncStatus === 'saving' ? '同步中' : '同步失败'}
                         </div>
                      )}
                  </div>
              </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setStyleMode('A')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${styleMode === 'A' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      电影质感
                  </button>
                  <button 
                    onClick={() => setStyleMode('B')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${styleMode === 'B' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      漫画风格
                  </button>
              </div>

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
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-20 text-center">序号</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider min-w-[300px]">画面描述 (Prompt)</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-80 text-center">当前画面</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-32 text-center">操作</th>
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
                                        {/* Scene Number */}
                                        <td className="py-4 px-6 text-center align-top pt-6">
                                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                                                #{frame.sceneNumber}
                                            </div>
                                            {frame.skipGeneration && (
                                                <div className="mt-2 text-[10px] text-rose-500 font-medium bg-rose-50 px-1 py-0.5 rounded border border-rose-100">
                                                    已跳过
                                                </div>
                                            )}
                                        </td>

                                        {/* Prompt Description */}
                                        <td className="py-4 px-6 align-top pt-6">
                                            <div className="space-y-2">
                                                <p className={`text-sm leading-relaxed whitespace-pre-wrap ${frame.skipGeneration ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}>
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
                                            <div className="aspect-video bg-slate-100 rounded-xl border border-slate-200 overflow-hidden relative group/image w-full max-w-[320px] mx-auto shadow-sm">
                                                {hasImage ? (
                                                    <>
                                                        <img 
                                                            src={frame.imageUrl} 
                                                            alt={`Scene ${frame.sceneNumber}`} 
                                                            className="w-full h-full object-cover" 
                                                        />
                                                        {/* Overlay Actions */}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
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
                                        </td>

                                        {/* Row Actions */}
                                        <td className="py-4 px-6 align-middle text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <button 
                                                    onClick={() => handleGenerateImage(frame)}
                                                    disabled={isGenerating || frame.skipGeneration}
                                                    className="p-2 rounded-lg text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                                    title="重新生成"
                                                >
                                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                </button>
                                                <button 
                                                    onClick={() => handleToggleSkip(frame)}
                                                    className={`p-2 rounded-lg transition-all ${
                                                        frame.skipGeneration 
                                                        ? 'text-rose-500 bg-rose-50 hover:bg-rose-100' 
                                                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                    title={frame.skipGeneration ? "恢复生成" : "跳过此镜头"}
                                                >
                                                    <Ban className="w-4 h-4" />
                                                </button>
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
    </div>
  );
};

export default StoryboardImages;
