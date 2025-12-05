
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, Maximize2, CloudUpload, FileSpreadsheet, Palette, RotateCcw, CheckCircle2, AlertCircle, Settings2, Key, Zap, Clock, Copy, Check } from 'lucide-react';
import JSZip from 'jszip';

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
        onClick={handleCopy} 
        className={`p-1.5 rounded-lg border transition-all shadow-sm flex-shrink-0 backdrop-blur-sm relative top-2 right-2 z-20 ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white/80 border-slate-200 text-slate-400 hover:text-fuchsia-600 hover:border-fuchsia-200 hover:bg-fuchsia-50'}`}
        title="复制提示词"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// Helper function to clean descriptions of style keywords
const cleanDescription = (text: string): string => {
    if (!text) return '';
    
    // Keywords to remove (English and Chinese style terms)
    // Be careful not to remove content words.
    const keywords = [
        '8k', '4k', '16:9', 'ar 16:9', '--ar', 'high quality', 'best quality', 'masterpiece', 
        'ultra detailed', 'photorealistic', 'cinematic lighting', 'cinematic', 'resolution', 'style',
        '高清', '画质', '分辨率', '大师级', '构图', '细节', '照片级', '真实', '电影感', '宽画幅', '风格'
    ];

    let cleaned = text;
    keywords.forEach(kw => {
        // Case insensitive replacement
        const regex = new RegExp(`[,，\\s]*${kw}[,，\\s]*`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    
    // Cleanup leading/trailing punctuation or spaces
    cleaned = cleaned.replace(/^[,，\.\s]+|[,，\.\s]+$/g, '');
    
    return cleaned;
};

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
        
        // Load Custom API Key & Settings from LocalStorage
        const storedKey = localStorage.getItem('lva_custom_api_key');
        if (storedKey) setCustomKey(storedKey);
        
        const storedModel = localStorage.getItem('lva_image_model');
        if (storedModel) setImageModel(storedModel);

        const storedTurbo = localStorage.getItem('lva_turbo_mode');
        if (storedTurbo) setIsTurboMode(storedTurbo === 'true');
    };
    init();
  }, [id, navigate]);

  const saveSettings = () => {
      localStorage.setItem('lva_custom_api_key', customKey);
      localStorage.setItem('lva_image_model', imageModel);
      localStorage.setItem('lva_turbo_mode', String(isTurboMode));
      setShowConfigModal(false);
      setMessage("API 配置已保存");
      setMessageType('success');
      setTimeout(() => setMessage(null), 3000);
  };

  const getMaskedKey = (key: string) => {
      if (!key || key.length < 8) return '';
      return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // Helper Interpolation
  const interpolate = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const handleSavePrompt = async (frameId: string, newPrompt: string) => {
    if (!project) return;
    const updatedStoryboard = project.storyboard?.map(f => 
        f.id === frameId ? { ...f, imagePrompt: newPrompt } : f
    );
    const updatedProject = { ...project, storyboard: updatedStoryboard };
    setProject(updatedProject);
    await storage.saveProject(updatedProject);
  };

  const handleReimportPrompts = async () => {
    if (!project || !project.storyboard) return;
    if (!window.confirm(`确定要基于“${style_mode === 'IMAGE_GEN_A' ? '方案A' : '方案B'}”重新生成所有图片的提示词吗？`)) return;

    // Use the selected style template
    const templateKey = style_mode; // IMAGE_GEN_A or IMAGE_GEN_B
    const template = prompts[templateKey]?.template || '';

    const updatedStoryboard = project.storyboard.map(frame => {
        // 1. Clean the original description for PROMPT GENERATION ONLY
        // We do NOT overwrite the 'description' field, preserving the original text.
        const cleanedDesc = cleanDescription(frame.description);
        
        // 2. Construct prompt using the template and cleaned description
        const prompt = interpolate(template, {
            description: cleanedDesc
        });
        
        // Update ONLY imagePrompt
        return { 
            ...frame, 
            imagePrompt: prompt 
        };
    });

    const updatedProject = { ...project, storyboard: updatedStoryboard };
    setProject(updatedProject);
    await storage.saveProject(updatedProject);
    
    setMessage("提示词已重新导入！");
    setMessageType('success');
    setTimeout(() => setMessage(null), 3000);
  };

  // Generate Single Image with Retry & Rate Limit Handling Logic (Internal Helper)
  const generateSingleImage = async (frame: StoryboardFrame, retryCount = 0): Promise<string> => {
    if (!frame.imagePrompt) throw new Error("Prompt is empty");
    
    try {
        return await gemini.generateImage(frame.imagePrompt, customKey, imageModel);
    } catch (error: any) {
        // Handle 429 Rate Limit - Smart Retry
        if (error.message.includes('429') || error.message.includes('频率') || error.message.includes('Quota')) {
            if (retryCount < 3) {
                 // Wait logic is handled by caller or here? 
                 // We'll throw a specific error to let the caller manage the delay loop
                 throw new Error("RATE_LIMIT");
            }
        }
        throw error;
    }
  };

  const handleReloadImage = (frameIndex: number) => {
      // Force reload by appending timestamp to URL
      if (!project || !project.storyboard) return;
      const frame = project.storyboard[frameIndex];
      if (!frame.imageUrl || frame.imageUrl.startsWith('data:')) return;

      // Remove existing timestamp if any
      const baseUrl = frame.imageUrl.split('?')[0];
      const newUrl = `${baseUrl}?t=${Date.now()}`;
      
      const newStoryboard = [...project.storyboard];
      newStoryboard[frameIndex] = { ...frame, imageUrl: newUrl };
      setProject({ ...project, storyboard: newStoryboard });
  };

  const handleRegenerateSingle = async (frame: StoryboardFrame) => {
      if (!project) return;
      setCurrentGenIds(prev => new Set(prev).add(frame.id));
      
      try {
          const base64 = await generateSingleImage(frame);
          
          const updatedStoryboard = project.storyboard?.map(f => 
            f.id === frame.id ? { ...f, imageUrl: base64, imageModel: imageModel } : f
          );
          const updatedProject = { ...project, storyboard: updatedStoryboard };
          setProject(updatedProject);
          await storage.saveProject(updatedProject);
          
      } catch (error: any) {
          alert(`生成失败: ${error.message}`);
      } finally {
          setCurrentGenIds(prev => {
              const next = new Set(prev);
              next.delete(frame.id);
              return next;
          });
      }
  };

  const handleBatchGenerate = async () => {
    if (!project?.storyboard) return;
    
    setGenerating(true);
    setBatchProgress({ planned: project.storyboard.length, completed: 0, failed: 0 });
    
    const framesToGen = [...project.storyboard];
    // We process sequentially or with limited concurrency to avoid Rate Limits (429)
    // Turbo Mode (Pro): Concurrency 3, Delay 500ms
    // Default (Free): Concurrency 1, Delay 3000ms + Smart 429 Retry
    
    const CONCURRENCY_LIMIT = isTurboMode ? 3 : 1; 
    let activeWorkers = 0;
    let index = 0;
    let currentDelay = isTurboMode ? 500 : 3500; // Start with safe delay

    const results = [...framesToGen]; // Clone to update as we go

    const processNext = async () => {
        if (index >= framesToGen.length) return;
        
        const currentIndex = index++;
        const frame = framesToGen[currentIndex];
        setCurrentGenIds(prev => new Set(prev).add(frame.id));

        try {
            // Retry Loop for Rate Limiting
            let retries = 0;
            let success = false;
            let finalImage = '';

            while (!success && retries < 4) {
                try {
                    finalImage = await generateSingleImage(frame);
                    success = true;
                } catch (err: any) {
                    if (err.message === 'RATE_LIMIT') {
                        retries++;
                        const waitTime = 15000 * retries; // 15s, 30s, 45s
                        setMessage(`API 限流中... 暂停 ${waitTime/1000} 秒后重试 (进度: ${currentIndex + 1}/${framesToGen.length})`);
                        setMessageType('warning');
                        // Increase global delay for future requests
                        currentDelay = Math.min(currentDelay + 2000, 10000); 
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    } else {
                        throw err; // Real error
                    }
                }
            }

            if (success) {
                results[currentIndex] = { ...frame, imageUrl: finalImage, imageModel: imageModel };
                setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
            } else {
                 throw new Error("Max retries exceeded");
            }

        } catch (error: any) {
            console.error(error);
            setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
            // We don't stop the whole batch, just mark this one failed
            setMessage(`第 ${frame.sceneNumber} 帧生成失败: ${error.message}`);
            setMessageType('error');
        } finally {
            setCurrentGenIds(prev => {
                const next = new Set(prev);
                next.delete(frame.id);
                return next;
            });
            
            // Save intermediate progress
            const updatedProject = { ...project, storyboard: results };
            setProject(updatedProject);
            await storage.saveProject(updatedProject);

            // Delay before releasing worker slot
            if (index < framesToGen.length) {
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                processNext();
            } else {
                activeWorkers--;
                if (activeWorkers === 0) {
                    setGenerating(false);
                    setMessage("批量生成完成！");
                    setMessageType('success');
                    setTimeout(() => setMessage(null), 3000);
                }
            }
        }
    };

    // Start Workers
    for (let i = 0; i < CONCURRENCY_LIMIT && i < framesToGen.length; i++) {
        activeWorkers++;
        processNext();
    }
  };

  const handleDownloadAll = async () => {
      if (!project?.storyboard) return;
      setDownloading(true);
      
      const zip = new JSZip();
      const folder = zip.folder(`project-${project.title}-images`);
      
      let count = 0;
      for (const frame of project.storyboard) {
          if (frame.imageUrl) {
              const filename = `scene-${String(frame.sceneNumber).padStart(3, '0')}.png`;
              try {
                if (frame.imageUrl.startsWith('data:')) {
                    const data = frame.imageUrl.split(',')[1];
                    folder?.file(filename, data, { base64: true });
                    count++;
                } else {
                    // Fetch from URL
                    const resp = await fetch(frame.imageUrl);
                    const blob = await resp.blob();
                    folder?.file(filename, blob);
                    count++;
                }
              } catch (e) {
                  console.error("Failed to add image to zip", e);
              }
          }
      }

      if (count > 0) {
          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${project.title}-storyboard.zip`;
          link.click();
          URL.revokeObjectURL(url);
      } else {
          alert("没有可下载的图片");
      }
      setDownloading(false);
  };

  const handleUploadImages = async () => {
    if (!project?.storyboard) return;
    setUploading(true);
    
    // Filter base64 images
    const imagesToUpload = project.storyboard.filter(f => f.imageUrl && f.imageUrl.startsWith('data:'));
    setUploadProgress({ total: imagesToUpload.length, current: 0 });

    const newStoryboard = [...project.storyboard];
    
    for (const frame of imagesToUpload) {
        try {
            if (frame.imageUrl) {
                const cloudUrl = await storage.uploadImage(frame.imageUrl, project.id);
                // Update local reference
                const idx = newStoryboard.findIndex(f => f.id === frame.id);
                if (idx !== -1) {
                    newStoryboard[idx] = { ...newStoryboard[idx], imageUrl: cloudUrl };
                }
            }
        } catch (e) {
            console.error("Upload failed for frame", frame.id, e);
        }
        setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }

    const updatedProject = { ...project, storyboard: newStoryboard };
    setProject(updatedProject);
    await storage.saveProject(updatedProject);
    
    setUploading(false);
    setMessage("所有图片已上传至云端存储");
    setMessageType('success');
    setTimeout(() => setMessage(null), 3000);
  };

  if (!project) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-fuchsia-500" /></div>;

  const totalFrames = project.storyboard?.length || 0;
  const generatedCount = project.storyboard?.filter(f => !!f.imageUrl).length || 0;
  const notGeneratedCount = totalFrames - generatedCount;
  // Count images that are URLs (not data URI)
  const uploadedCount = project.storyboard?.filter(f => f.imageUrl && !f.imageUrl.startsWith('data:')).length || 0;
  const hasBase64 = project.storyboard?.some(f => f.imageUrl?.startsWith('data:')) || false;

  return (
    <div className="h-full flex flex-col bg-[#F8F9FC]">
      
      {/* Stats Bar (Top) - Enhanced Visibility */}
      <div className="bg-slate-900 text-white px-8 py-5 flex items-center justify-between text-sm font-medium shadow-xl z-30 relative border-b border-slate-800">
          <div className="flex items-center gap-10 mx-auto">
              <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">共</span>
                  <span className="text-3xl font-black text-white tracking-tight leading-none">{totalFrames}</span>
                  <span className="text-slate-400 font-bold">个分镜</span>
              </div>
              <div className="w-px h-8 bg-slate-700/80"></div>
              <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">已生图</span>
                  <span className="text-3xl font-black text-emerald-400 tracking-tight leading-none">{generatedCount}</span>
                  <span className="text-slate-400 font-bold">个</span>
              </div>
              <div className="w-px h-8 bg-slate-700/80"></div>
              <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">未生图</span>
                  <span className="text-3xl font-black text-amber-400 tracking-tight leading-none">{notGeneratedCount}</span>
                  <span className="text-slate-400 font-bold">个</span>
              </div>
              <div className="w-px h-8 bg-slate-700/80"></div>
              <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">已保存(云端)</span>
                  <span className="text-3xl font-black text-blue-400 tracking-tight leading-none">{uploadedCount}</span>
                  <span className="text-slate-400 font-bold">个</span>
              </div>
          </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4 shadow-sm z-20">
        <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <button onClick={() => navigate(`/project/${id}`)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-fuchsia-600" /> 分镜图片工坊
                    </h1>
                     <p className="text-xs text-slate-500 font-medium">批量生成与管理项目分镜画面</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setShowConfigModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 hover:text-slate-900 transition-colors text-xs font-bold border border-slate-200"
                >
                    <Settings2 className="w-4 h-4" /> 
                    API 配置
                </button>

                 <div className="h-8 w-px bg-slate-200 mx-1"></div>

                 <button 
                    onClick={handleUploadImages}
                    disabled={uploading || !hasBase64}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-all disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-300 text-xs"
                    title="将本地生成的图片上传到云端存储"
                 >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                    {uploading ? `上传中 ${uploadProgress.current}/${uploadProgress.total}` : '上传云端'}
                 </button>

                 <button 
                    onClick={handleDownloadAll}
                    disabled={downloading || generatedCount === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50 text-xs"
                 >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    打包下载
                 </button>
            </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <Palette className="w-4 h-4 text-slate-400" />
                    <select 
                        value={style_mode}
                        onChange={(e) => setStyleMode(e.target.value)}
                        className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                    >
                        <option value="IMAGE_GEN_A">方案 A: 电影质感 (写实)</option>
                        <option value="IMAGE_GEN_B">方案 B: 漫画风格 (手绘)</option>
                    </select>
                </div>
                <button 
                    onClick={handleReimportPrompts}
                    className="text-xs font-bold text-slate-500 hover:text-fuchsia-600 flex items-center gap-1 px-2 py-1 hover:bg-white rounded-lg transition-all"
                    title="根据选定的风格方案，重新生成所有图片的提示词"
                >
                    <RotateCcw className="w-3.5 h-3.5" /> 重新导入提示词
                </button>
            </div>

            <div className="flex items-center gap-4">
                 <button 
                    onClick={handleBatchGenerate}
                    disabled={generating}
                    className="bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2 text-xs"
                 >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generating ? `生成中 (${batchProgress.completed}/${batchProgress.planned})` : '批量生图'}
                 </button>
            </div>
        </div>
      </div>

      {/* Main Content: Table */}
      <div className="flex-1 overflow-auto p-3">
        
        {/* Project Title Header */}
        <div className="mb-6">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 mb-2">
                {project.title}
            </h2>
            <div className="h-1 w-20 bg-fuchsia-500 rounded-full"></div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse border border-slate-200">
                <thead className="bg-slate-50 text-slate-600">
                    <tr>
                        <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-16 text-center border border-slate-200">序号</th>
                        <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-1/4 min-w-[200px] border border-slate-200">原文</th>
                        <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider min-w-[300px] border border-slate-200">AI 绘图提示词</th>
                        <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-80 text-center border border-slate-200">缩略图 / 状态</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {project.storyboard?.map((frame, index) => (
                        <tr key={frame.id} className="group hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-4 text-center text-sm font-bold text-slate-400 border border-slate-200 align-top">
                                {frame.sceneNumber}
                            </td>
                             <td className="py-4 px-4 border border-slate-200 align-top bg-slate-50/30">
                                <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[160px] overflow-y-auto">
                                    {frame.originalText}
                                </div>
                            </td>
                            <td className="py-4 px-4 border border-slate-200 align-top">
                                <div className="relative h-full">
                                    <div className="absolute top-2 right-2 z-10">
                                        <CopyButton text={frame.imagePrompt || ''} />
                                    </div>
                                    <textarea 
                                        className="w-full h-32 md:h-40 p-3 pr-12 text-xs md:text-sm text-slate-700 border border-slate-200 rounded-xl focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-400 outline-none transition-all resize-none leading-relaxed"
                                        value={frame.imagePrompt || ''}
                                        onChange={(e) => handleSavePrompt(frame.id, e.target.value)}
                                        placeholder="在此编辑 AI 提示词..."
                                    />
                                </div>
                            </td>
                            <td className="py-4 px-4 border border-slate-200 align-top">
                                <div className="w-full aspect-video bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden relative group/img">
                                    
                                    {/* Regenerate Button (Top Right) */}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleRegenerateSingle(frame); }}
                                        disabled={currentGenIds.has(frame.id)}
                                        className={`absolute top-2 right-2 p-2 rounded-lg backdrop-blur-md transition-all z-30 shadow-sm ${
                                            frame.imageUrl 
                                            ? 'bg-black/40 text-white hover:bg-fuchsia-600 hover:text-white opacity-0 group-hover/img:opacity-100' 
                                            : 'bg-white text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 border border-slate-200'
                                        }`}
                                        title="重新生成此分镜"
                                    >
                                         <RefreshCw className={`w-4 h-4 ${currentGenIds.has(frame.id) ? 'animate-spin' : ''}`} />
                                    </button>

                                    {/* Reload Button (Top Left) - Only for server images */}
                                    {frame.imageUrl && !frame.imageUrl.startsWith('data:') && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleReloadImage(index); }}
                                            className="absolute top-2 left-2 p-2 bg-black/40 text-white rounded-lg hover:bg-blue-600 transition-all z-30 opacity-0 group-hover/img:opacity-100 backdrop-blur-md shadow-sm"
                                            title="刷新图片缓存"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}

                                    {/* Model Badge - Bottom */}
                                    {frame.imageUrl && frame.imageModel && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 text-[9px] font-mono text-white/90 text-center z-20 pointer-events-none">
                                            {frame.imageModel}
                                        </div>
                                    )}

                                    {frame.imageUrl ? (
                                        <>
                                            <img 
                                                src={frame.imageUrl} 
                                                alt={`Scene ${frame.sceneNumber}`} 
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                            <button 
                                                onClick={() => setSelectedImage(frame.imageUrl!)}
                                                className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100 z-10"
                                            >
                                                <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-4">
                                            {currentGenIds.has(frame.id) ? (
                                                <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500 mx-auto mb-2" />
                                            ) : (
                                                <ImageIcon className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                                            )}
                                            <span className="text-[10px] text-slate-400 block">
                                                {currentGenIds.has(frame.id) ? '正在生成...' : '等待生成'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* Full Screen Image Preview */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
            <div className="relative max-w-[90vw] max-h-[90vh]">
                <img src={selectedImage} alt="Full Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
                <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-8 h-8" />
                </button>
            </div>
        </div>
      )}

      {/* Toast Message */}
      {message && (
        <div className={`fixed bottom-8 right-8 text-white px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 z-[60] font-bold flex items-start gap-3 max-w-lg break-words ${
            messageType === 'error' ? 'bg-rose-600' : 
            messageType === 'warning' ? 'bg-amber-500' : 
            'bg-emerald-500'
        }`}>
          {messageType === 'error' ? <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" /> : 
           messageType === 'warning' ? <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" /> :
           <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />}
          <span className="leading-snug">{message}</span>
        </div>
      )}

      {/* API Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200 relative">
                <button onClick={() => setShowConfigModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 bg-fuchsia-50 text-fuchsia-600 rounded-2xl flex items-center justify-center mb-3">
                        <Settings2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900">API 高级配置</h3>
                    <p className="text-xs text-slate-500 text-center mt-1">仅对当前页面生效，用于优化生图体验</p>
                </div>

                <div className="space-y-6">
                    {/* API Key Input */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                            <span>独立 API Key</span>
                            {customKey && <span className="text-emerald-500">{getMaskedKey(customKey)}</span>}
                        </label>
                        <div className="relative">
                            <input
                                type="password"
                                value={customKey}
                                onChange={(e) => setCustomKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pl-10 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 outline-none transition-all"
                            />
                            <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            {customKey && (
                                <button 
                                    onClick={() => setCustomKey('')}
                                    className="absolute right-3 top-3.5 text-slate-400 hover:text-rose-500 text-xs font-bold"
                                >
                                    清除
                                </button>
                            )}
                        </div>
                         <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            输入您的 Gemini API Key 以使用独立配额。留空则使用系统默认 Key。
                        </p>
                    </div>

                    {/* Model Selection */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            AI 模型选择
                        </label>
                        <select
                            value={imageModel}
                            onChange={(e) => setImageModel(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 outline-none transition-all cursor-pointer"
                        >
                            <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Default)</option>
                            <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (High Quality)</option>
                        </select>
                        <p className="text-[10px] text-amber-600 mt-2 leading-relaxed bg-amber-50 p-2 rounded-lg border border-amber-100">
                             <strong>注意：</strong> Pro 模型需要 Google Cloud 结算账号（Pay-as-you-go），仅开通 Gemini Advanced 个人订阅无法使用 API。如果报错 403/404，请切换回 Flash 模型。
                        </p>
                    </div>

                    {/* Turbo Mode Toggle */}
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div>
                             <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" /> 极速并发模式
                             </h4>
                             <p className="text-[10px] text-slate-500">
                                提高并发数 (3x)，减少等待间隔。
                             </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={isTurboMode}
                                onChange={(e) => setIsTurboMode(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-fuchsia-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fuchsia-600"></div>
                        </label>
                    </div>
                     <p className="text-[10px] text-slate-400">
                        仅建议 Pro 付费 Key 开启。免费 Key 开启极速模式会导致 429 报错。
                    </p>

                    <button
                        onClick={saveSettings}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20"
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
