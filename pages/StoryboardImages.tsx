import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { ArrowLeft, Download, Loader2, Sparkles, Image as ImageIcon, RefreshCw, X, Maximize2, CloudUpload, FileSpreadsheet, Palette, RotateCcw, CheckCircle2, AlertCircle, Settings2, Key, Zap, Clock, Copy, Check, Cloud, CloudCheck, Video, FileText, BrainCircuit } from 'lucide-react';
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
        className={`absolute top-2 right-2 z-20 p-1.5 rounded-lg border transition-all shadow-sm flex-shrink-0 backdrop-blur-sm ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white/80 border-slate-200 text-slate-400 hover:text-fuchsia-600 hover:border-fuchsia-200 hover:bg-fuchsia-50'}`}
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
    const keywords = [
        '8k', '4k', '16:9', 'ar 16:9', '--ar', 'high quality', 'best quality', 'masterpiece', 
        'ultra detailed', 'photorealistic', 'cinematic lighting', 'cinematic', 'resolution', 'style',
        '高清', '画质', '分辨率', '大师级', '构图', '细节', '照片级', '真实', '电影感', '宽画幅', '风格'
    ];

    let cleaned = text;
    keywords.forEach(kw => {
        const regex = new RegExp(`[,，\\s]*${kw}[,，\\s]*`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    
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
  
  // State for Style Selection
  const [style_mode, setStyleMode] = useState<string>('IMAGE_GEN_A');

  // State for API Configuration
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [imageModel, setImageModel] = useState<string>('gemini-2.5-flash-image');

  // State for Batch Progress
  const [batchProgress, setBatchProgress] = useState({ planned: 0, completed: 0, failed: 0 });
  
  // State for Cloud Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, current: 0 });

  // State for Downloads and UI
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'warning'>('success');
  
  // Sync Status State
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState('');

  // Subtitle State
  const [subtitleContent, setSubtitleContent] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);

  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity Tracking Refs
  const lastActivityRef = useRef(Date.now());
  const isBusyRef = useRef(false);

  // Update busy ref based on state
  useEffect(() => {
      // Busy if generating, uploading, downloading, identifying, or config modal is open
      isBusyRef.current = generating || uploading || downloading || isIdentifying || showConfigModal;
  }, [generating, uploading, downloading, isIdentifying, showConfigModal]);

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
          if (!mountedRef.current || !id) return;

          const isUserActive = (Date.now() - lastActivityRef.current) < 30000;
          
          if (isBusyRef.current || isUserActive) {
              console.log("Auto-sync delayed: User active or system busy");
              timeoutId = setTimeout(performSync, 2 * 60 * 1000); // Retry in 2 mins
              return;
          }

          setSyncStatus('saving');
          try {
              await storage.downloadAllData();
              const freshP = await storage.getProject(id);
              if (freshP && mountedRef.current) {
                  setProject(freshP);
                  setSyncStatus('synced');
                  setLastSyncTime(new Date().toLocaleTimeString());
              }
          } catch (e) {
              console.warn("Auto-sync failed", e);
              if (mountedRef.current) setSyncStatus('error');
          }

          // Schedule next run (5 mins)
          timeoutId = setTimeout(performSync, 5 * 60 * 1000);
      };

      // Initial Delay
      timeoutId = setTimeout(performSync, 5 * 60 * 1000);

      return () => clearTimeout(timeoutId);
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const init = async () => {
        if (id) {
            // 1. Local Load
            const p = await storage.getProject(id);
            if (p) {
                if (mountedRef.current) setProject(p);
            } else {
                if (mountedRef.current) navigate('/');
                return;
            }

            // 2. Cloud Sync (Pull)
            if (mountedRef.current) setSyncStatus('saving');
            try {
                await storage.downloadAllData();
                const freshP = await storage.getProject(id);
                if (freshP && mountedRef.current) {
                    setProject(freshP);
                    setSyncStatus('synced');
                    setLastSyncTime(new Date().toLocaleTimeString());
                }
            } catch (e) {
                console.warn("Auto-sync failed", e);
                if (mountedRef.current) setSyncStatus('error');
            }
        }
        const loadedPrompts = await storage.getPrompts();
        if (mountedRef.current) setPrompts(loadedPrompts);
        
        const storedKey = localStorage.getItem('lva_custom_api_key');
        if (storedKey) setCustomKey(storedKey);
        
        const storedModel = localStorage.getItem('lva_image_model');
        if (storedModel) setImageModel(storedModel);
    };
    init();
  }, [id, navigate]);

  const saveSettings = () => {
      localStorage.setItem('lva_custom_api_key', customKey);
      localStorage.setItem('lva_image_model', imageModel);
      setShowConfigModal(false);
      setMessage("API 配置已保存");
      setMessageType('success');
      setTimeout(() => setMessage(null), 3000);
  };

  const getMaskedKey = (key: string) => {
      if (!key || key.length < 8) return '';
      return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  const saveProjectAndSync = async (updatedProject: ProjectData) => {
      setProject(updatedProject);
      await storage.saveProject(updatedProject);
      
      setSyncStatus('saving');
      try {
          await storage.uploadProjects();
          setSyncStatus('synced');
          setLastSyncTime(new Date().toLocaleTimeString());
      } catch (e) {
          console.error("Auto-sync push failed", e);
          setSyncStatus('error');
      }
  };

  const handleSavePrompt = async (frameId: string, newPrompt: string) => {
    if (!project) return;
    const updatedStoryboard = project.storyboard?.map(f => 
        f.id === frameId ? { ...f, imagePrompt: newPrompt } : f
    );
    const updatedProject = { ...project, storyboard: updatedStoryboard };
    await saveProjectAndSync(updatedProject);
  };

  const handleReimportPrompts = async () => {
    if (!project || !project.storyboard) return;
    if (!window.confirm(`确定要基于“${style_mode === 'IMAGE_GEN_A' ? '方案A' : '方案B'}”重新生成所有图片的提示词吗？`)) return;

    const templateKey = style_mode; 
    const template = prompts[templateKey] ? prompts[templateKey].template : '';

    const updatedStoryboard = project.storyboard.map(frame => {
         // Only clean description for generating prompt, do NOT overwrite original description
         const cleanedDesc = cleanDescription(frame.description);
         const newPrompt = template.replace(/\{\{description\}\}/g, cleanedDesc);
         return {
             ...frame,
             imagePrompt: newPrompt,
         };
    });

    const updatedProject = { ...project, storyboard: updatedStoryboard };
    await saveProjectAndSync(updatedProject);
    
    setMessage("提示词已重新导入成功！");
    setMessageType('success');
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSubtitleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubtitleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const text = await file.text();
          setSubtitleContent(text);
          setMessage("已上传成功！请点击右侧“智能识别”按钮开始分析。");
          setMessageType('success');
          // Reset input to allow re-upload
          if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
          console.error(err);
          setMessage("文件读取失败: " + err.message);
          setMessageType('error');
      }
      setTimeout(() => setMessage(null), 3000);
  };

  const handleSmartIdentify = async () => {
      if (!subtitleContent || !project?.storyboard) return;
      setIsIdentifying(true);
      
      try {
           // Prepare lightweight data for prompt
           const sbItems = project.storyboard.map((f, i) => ({
               index: i,
               text: f.originalText
           }));
  
           const prompt = `
              You are a professional video editor assistant.
              I have a subtitle file content and a list of storyboard sentences (Original Text).
              
              Goal: Find the start and end timestamp from the subtitle file for each storyboard sentence.
              
              Rules:
              1. The storyboard sentences are derived from the subtitles, so they should match closely or exactly.
              2. If a storyboard sentence spans multiple subtitle lines, use the start time of the first line and end time of the last line.
              3. Return the result as a JSON array.
              
              Subtitle File Content:
              ${subtitleContent}
              
              Storyboard Sentences:
              ${JSON.stringify(sbItems)}
              
              Output JSON Schema:
              Array of objects: { index: number, timeRange: string }
              Example timeRange: "00:00:01,200 --> 00:00:04,500"
           `;
  
           const result = await gemini.generateJSON<{index: number, timeRange: string}[]>(prompt, {
               type: "ARRAY",
               items: {
                   type: "OBJECT",
                   properties: {
                       index: { type: "NUMBER" },
                       timeRange: { type: "STRING" }
                   }
               }
           });
           
           if (result && Array.isArray(result)) {
               const updatedStoryboard = [...project.storyboard];
               let matchCount = 0;
               result.forEach(item => {
                   if (updatedStoryboard[item.index] && item.timeRange) {
                       updatedStoryboard[item.index] = {
                           ...updatedStoryboard[item.index],
                           timeRange: item.timeRange
                       };
                       matchCount++;
                   }
               });
               
               await saveProjectAndSync({ ...project, storyboard: updatedStoryboard });
               setMessage(`智能识别完成，已更新 ${matchCount} 条时间轴！`);
               setMessageType('success');
           } else {
               throw new Error("模型未返回有效的数据结构");
           }
      } catch (err: any) {
          console.error(err);
          setMessage("智能识别失败: " + err.message);
          setMessageType('error');
      } finally {
          setIsIdentifying(false);
          setTimeout(() => setMessage(null), 4000);
      }
  };

  const generateSingleImage = async (frame: StoryboardFrame, showToast = true) => {
      if (!frame.imagePrompt) return;
      
      // Mark as generating
      setCurrentGenIds(prev => new Set(prev).add(frame.id));

      try {
          const base64Data = await gemini.generateImage(frame.imagePrompt, customKey, imageModel);
          const cloudUrl = await storage.uploadImage(base64Data, project?.id);

          // Update state
          let updatedProject: ProjectData | null = null;
          setProject(prev => {
              if (!prev) return null;
              updatedProject = {
                  ...prev,
                  storyboard: prev.storyboard?.map(f => 
                    f.id === frame.id ? { ...f, imageUrl: cloudUrl, imageModel: imageModel } : f
                  )
              };
              return updatedProject;
          });

          if (updatedProject) {
              await storage.saveProject(updatedProject);
              // Background Sync
              setSyncStatus('saving');
              storage.uploadProjects().then(() => {
                  if (mountedRef.current) {
                      setSyncStatus('synced');
                      setLastSyncTime(new Date().toLocaleTimeString());
                  }
              }).catch(() => {
                  if (mountedRef.current) setSyncStatus('error');
              });
          }

          if (showToast) {
            setMessage("图片生成成功！");
            setMessageType('success');
            setTimeout(() => setMessage(null), 3000);
          }
      } catch (error: any) {
          console.error(error);
          if (showToast) {
             setMessage(`生成失败: ${error.message}`);
             setMessageType('error');
             setTimeout(() => setMessage(null), 5000);
          }
          throw error;
      } finally {
          // Clear generating state
          setCurrentGenIds(prev => {
              const next = new Set(prev);
              next.delete(frame.id);
              return next;
          });
      }
  };

  const handleBatchGenerate = async () => {
    if (!project || !project.storyboard) return;
    
    // STRICT FILTER: Only frames that do NOT have an imageUrl
    const pendingFrames = project.storyboard.filter(f => !f.imageUrl);

    if (pendingFrames.length === 0) {
        setMessage("所有分镜已包含图片，无需生成。");
        setMessageType('success');
        setTimeout(() => setMessage(null), 3000);
        return;
    }

    // Direct execution, no confirmation dialog
    setGenerating(true);
    setBatchProgress({ planned: pendingFrames.length, completed: 0, failed: 0 });
    
    // High concurrency for standard accounts/Flash model
    const CONCURRENCY_LIMIT = 3; 
    const queue = [...pendingFrames];
    const activePromises: Promise<void>[] = [];

    const processNext = async () => {
        if (queue.length === 0) return;
        const frame = queue.shift();
        if (!frame) return;

        try {
            await generateSingleImage(frame, false);
            setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
        } catch (error) {
            console.error(error);
            setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        } finally {
            await processNext();
        }
    };

    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        activePromises.push(processNext());
    }

    await Promise.all(activePromises);

    setGenerating(false);
    setMessage(`批量生成结束。成功: ${pendingFrames.length - batchProgress.failed}, 失败: ${batchProgress.failed}`);
    setMessageType(batchProgress.failed > 0 ? 'warning' : 'success');
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCloudSync = async () => {
    if (!project || !project.storyboard) return;

    // STRICT FILTER: Only images starting with 'data:' (local base64)
    // Ignore already uploaded URLs (starting with /api/ or http)
    const localImages = project.storyboard.filter(f => f.imageUrl && f.imageUrl.startsWith('data:'));
    
    setSyncStatus('saving');

    if (localImages.length === 0) {
        // Direct execution for metadata sync
        setUploading(true);
        try {
             await storage.uploadProjects();
             setMessage("项目数据同步成功");
             setMessageType('success');
             setSyncStatus('synced');
             setLastSyncTime(new Date().toLocaleTimeString());
        } catch(e: any) {
             setMessage(`同步失败: ${e.message}`);
             setMessageType('error');
             setSyncStatus('error');
        } finally {
             setUploading(false);
             setTimeout(() => setMessage(null), 3000);
        }
        return;
    }

    // Direct execution for image upload
    setUploading(true);
    setUploadProgress({ total: localImages.length, current: 0 });

    try {
        for (const frame of localImages) {
             if (!frame.imageUrl) continue;
             
             // Upload logic
             const cloudUrl = await storage.uploadImage(frame.imageUrl, project.id);
             
             // Update State IMMEDIATELY to reflect progress in Status Bar
             setProject(prev => {
                if (!prev) return null;
                const updatedStoryboard = prev.storyboard?.map(f => 
                    f.id === frame.id ? { ...f, imageUrl: cloudUrl } : f
                );
                return { ...prev, storyboard: updatedStoryboard };
             });

             setUploadProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
        
        // Final Save & Sync
        setProject(currentFinal => {
            if (currentFinal) {
                storage.saveProject(currentFinal).then(() => {
                    return storage.uploadProjects();
                }).then(() => {
                    setSyncStatus('synced');
                    setLastSyncTime(new Date().toLocaleTimeString());
                }).catch(() => setSyncStatus('error'));
            }
            return currentFinal;
        });

        setMessage("图片上传并同步成功！");
        setMessageType('success');
    } catch (e: any) {
        console.error(e);
        setMessage(`上传失败: ${e.message}`);
        setMessageType('error');
        setSyncStatus('error');
    } finally {
        setUploading(false);
        setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDownloadAll = async () => {
    if (!project?.storyboard) return;
    setDownloading(true);
    
    try {
        const zip = new JSZip();
        const folder = zip.folder(`storyboard_${project.title}`);
        
        let count = 0;
        for (const frame of project.storyboard) {
            if (frame.imageUrl) {
                try {
                    const response = await fetch(frame.imageUrl);
                    const blob = await response.blob();
                    const ext = frame.imageUrl.includes('.png') ? 'png' : 'jpg';
                    folder?.file(`scene_${frame.sceneNumber}.${ext}`, blob);
                    count++;
                } catch (e) {
                    console.error("Failed to download image", frame.imageUrl);
                }
            }
        }

        if (count === 0) {
            alert("没有可下载的图片");
            return;
        }

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${project.title}_storyboard.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (e) {
        console.error(e);
        alert("打包下载失败");
    } finally {
        setDownloading(false);
    }
  };

  const handleDownloadPromptsCsv = () => {
      if (!project || !project.storyboard || project.storyboard.length === 0) {
          alert("暂无分镜数据");
          return;
      }

      // Add BOM for Excel UTF-8 compatibility
      let csvContent = "\uFEFF"; 
      csvContent += "序号,原文,AI 绘图提示词\n";

      project.storyboard.forEach(frame => {
          // Escape quotes by doubling them, wrap content in quotes
          const safeOriginal = (frame.originalText || "").replace(/"/g, '""');
          const safePrompt = (frame.imagePrompt || "").replace(/"/g, '""');
          csvContent += `${frame.sceneNumber},"${safeOriginal}","${safePrompt}"\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.title || 'project'}_提示词.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleReloadImage = (frame: StoryboardFrame) => {
      if (!frame.imageUrl || frame.imageUrl.startsWith('data:')) return;
      
      const urlObj = new URL(frame.imageUrl, window.location.origin);
      urlObj.searchParams.set('t', Date.now().toString());
      const newUrl = urlObj.toString();

      setSyncStatus('saving');
      const updatedProject = {
          ...project,
          storyboard: project?.storyboard?.map(f => 
            f.id === frame.id ? { ...f, imageUrl: newUrl } : f
          )
      } as ProjectData;
      
      saveProjectAndSync(updatedProject);
  };

  if (!project) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-fuchsia-500" /></div>;

  // Real-time Stats Calculation based on current project state
  const stats = {
      total: project.storyboard?.length || 0,
      generated: project.storyboard?.filter(f => !!f.imageUrl).length || 0,
      pending: (project.storyboard?.length || 0) - (project.storyboard?.filter(f => !!f.imageUrl).length || 0),
      // Uploaded check: exists AND does not start with data:
      uploaded: project.storyboard?.filter(f => f.imageUrl && !f.imageUrl.startsWith('data:')).length || 0
  };

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC]">
      <input type="file" ref={fileInputRef} hidden accept=".srt,.vtt,.txt" onChange={handleSubtitleFileChange} />
      
      {/* 1. Statistics Bar - Top Level */}
      <div className="bg-slate-900 text-white px-4 py-5 flex items-center gap-6 overflow-x-auto no-scrollbar md:justify-center md:gap-24 shadow-md z-20 flex-nowrap shrink-0">
          <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-xl md:text-3xl font-black text-white">{stats.total}</span>
              <span className="text-[10px] md:text-sm font-bold text-slate-400 uppercase tracking-wider mt-0.5 md:mt-1 whitespace-nowrap">共分镜</span>
          </div>
          <div className="w-px h-6 md:h-10 bg-slate-700/50 flex-shrink-0"></div>
          <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-xl md:text-3xl font-black text-emerald-400">{stats.generated}</span>
              <span className="text-[10px] md:text-sm font-bold text-slate-400 uppercase tracking-wider mt-0.5 md:mt-1 whitespace-nowrap">已生图</span>
          </div>
          <div className="w-px h-6 md:h-10 bg-slate-700/50 flex-shrink-0"></div>
          <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-xl md:text-3xl font-black text-amber-400">{stats.pending}</span>
              <span className="text-[10px] md:text-sm font-bold text-slate-400 uppercase tracking-wider mt-0.5 md:mt-1 whitespace-nowrap">未生图</span>
          </div>
          <div className="w-px h-6 md:h-10 bg-slate-700/50 flex-shrink-0"></div>
          <div className="flex flex-col items-center flex-shrink-0">
              <span className="text-xl md:text-3xl font-black text-blue-400">{stats.uploaded}</span>
              <span className="text-[10px] md:text-sm font-bold text-slate-400 uppercase tracking-wider mt-0.5 md:mt-1 whitespace-nowrap">已保存云端</span>
          </div>
      </div>

      {/* 2. Main Content Container */}
      <div className="flex-1 overflow-hidden flex flex-col p-0 md:p-3">
        
        {/* Header Toolbar */}
        <div className="flex flex-col gap-2 md:gap-4 md:flex-row md:items-center md:justify-between mb-2 md:mb-4 px-2 pt-2 md:pt-0">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate(`/project/${project.id}`)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                        <ImageIcon className="w-6 h-6 text-fuchsia-600" />
                        分镜图片工坊
                    </h1>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {/* Style Selection, Reimport, Batch Generate */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm h-10">
                    <select 
                        value={style_mode}
                        onChange={(e) => setStyleMode(e.target.value)}
                        className="bg-transparent text-xs font-bold text-slate-700 px-3 outline-none border-r border-slate-100 h-full cursor-pointer hover:bg-slate-50 rounded-l-lg max-w-[100px] md:max-w-none"
                        title="选择提示词方案模板"
                    >
                        <option value="IMAGE_GEN_A">方案 A: 电影质感 (写实)</option>
                        <option value="IMAGE_GEN_B">方案 B: 漫画风格</option>
                    </select>
                    <button 
                        onClick={handleReimportPrompts}
                        className="px-3 h-full flex items-center gap-1.5 text-slate-500 hover:text-fuchsia-600 hover:bg-fuchsia-50 transition-colors text-xs font-bold border-r border-slate-100 whitespace-nowrap"
                        title="基于当前选择的方案重新生成提示词"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> 重新导入
                    </button>
                    <button 
                        onClick={handleBatchGenerate}
                        disabled={generating}
                        className="px-4 h-full flex items-center gap-1.5 text-fuchsia-600 hover:bg-fuchsia-50 transition-colors text-xs font-bold rounded-r-lg disabled:opacity-50 whitespace-nowrap"
                        title="仅为尚未有图片的分镜生成图片"
                    >
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-fuchsia-600" />}
                        批量生图
                    </button>
                </div>

                {/* API Config Button */}
                <button
                    onClick={() => setShowConfigModal(true)}
                    className={`h-10 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm border ${customKey ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                >
                    <Settings2 className="w-4 h-4" />
                    <span className="hidden sm:inline">API 配置</span>
                </button>
                
                {/* Cloud Sync Button (Manual) */}
                <button
                    onClick={handleCloudSync}
                    disabled={uploading}
                    className="h-10 px-4 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-emerald-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="将本地图片上传至云端并同步数据"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                    <span className="hidden sm:inline">上传云端</span>
                </button>

                {/* Download Button */}
                <button
                    onClick={handleDownloadPromptsCsv}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white bg-slate-100/50 border border-slate-200/50 hover:border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm h-10"
                    title="下载为CSV表格"
                >
                   <FileSpreadsheet className="w-3.5 h-3.5" /> 下载提示词
                </button>

                 <button
                    onClick={handleDownloadAll}
                    disabled={downloading || stats.generated === 0}
                    className="h-10 px-4 bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 disabled:opacity-50 disabled:shadow-none"
                >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="hidden sm:inline">打包下载</span>
                </button>
                
                {/* Sync Status Badge */}
                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md border animate-in fade-in transition-colors h-10 ${
                    syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    syncStatus === 'saving' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                    syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                    'bg-slate-50 text-slate-400 border-slate-100'
                }`}>
                    {syncStatus === 'synced' ? <CloudCheck className="w-3 h-3" /> : 
                     syncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                     syncStatus === 'error' ? <AlertCircle className="w-3 h-3" /> :
                     <Cloud className="w-3 h-3" />}
                    
                    {syncStatus === 'synced' ? `已同步: ${lastSyncTime}` :
                     syncStatus === 'saving' ? '同步中...' :
                     syncStatus === 'error' ? '同步失败' :
                     '准备就绪'}
                </div>
            </div>
        </div>

        {/* Progress Bar (if generating) */}
        {generating && (
            <div className="mb-4 mx-2 bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 whitespace-nowrap">
                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-600" />
                    正在生成 ({batchProgress.completed}/{batchProgress.planned})...
                </div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all duration-300 rounded-full"
                        style={{ width: `${(batchProgress.completed / batchProgress.planned) * 100}%` }}
                    />
                </div>
                {batchProgress.failed > 0 && (
                    <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded">
                        失败: {batchProgress.failed}
                    </span>
                )}
            </div>
        )}

        {/* Upload Progress Bar (if uploading) */}
        {uploading && (
            <div className="mb-4 mx-2 bg-white rounded-xl border border-emerald-200 p-3 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 whitespace-nowrap">
                    <CloudUpload className="w-4 h-4 animate-bounce" />
                    正在上传 ({uploadProgress.current}/{uploadProgress.total})...
                </div>
                <div className="flex-1 h-2 bg-emerald-50 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                        style={{ width: uploadProgress.total > 0 ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : '0%' }}
                    />
                </div>
            </div>
        )}

        {/* Table Area */}
        <div className="flex-1 bg-white md:rounded-2xl border-t md:border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Project Title Header */}
            <div className="px-3 py-2 md:px-6 md:py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                 <h2 className="text-lg md:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
                    {project.title || '未命名项目'}
                 </h2>
                 <div className="flex items-center gap-2">
                     <div className="flex items-center bg-slate-100/50 border border-slate-200 rounded-xl p-0.5 h-9 shadow-sm">
                         <button 
                            onClick={handleSubtitleUploadClick}
                            className={`px-3 h-full flex items-center gap-1.5 transition-colors text-xs font-bold rounded-l-lg border-r border-slate-200/50 ${subtitleContent ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                            title={subtitleContent ? "字幕已加载，点击可重新上传" : "上传字幕文件 (.srt, .txt)"}
                        >
                            {subtitleContent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            {subtitleContent ? "已上传" : "上传字幕"}
                        </button>
                        <button
                            onClick={handleSmartIdentify}
                            disabled={isIdentifying || !subtitleContent}
                            className="px-3 h-full flex items-center gap-1.5 text-indigo-600 hover:bg-white transition-colors text-xs font-bold rounded-r-lg disabled:opacity-50 disabled:grayscale"
                            title="使用 Gemini AI 自动分析匹配时间轴"
                        >
                            {isIdentifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />}
                            智能识别
                        </button>
                    </div>

                     <a 
                        href="https://app.heygen.com/projects"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-slate-500 hover:text-violet-600 hover:bg-white bg-slate-100/50 border border-slate-200/50 hover:border-violet-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                     >
                        <Video className="w-3.5 h-3.5" /> 打开heygen
                     </a>
                 </div>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="py-2 px-0.5 md:py-3 md:px-2 text-xs font-extrabold uppercase tracking-wider w-8 md:w-12 text-center border-b border-slate-200">序号</th>
                            <th className="py-2 px-0.5 md:py-3 md:px-2 text-xs font-extrabold uppercase tracking-wider w-[15%] md:w-[25%] text-center border-b border-slate-200">原文</th>
                            <th className="py-2 px-0.5 md:py-3 md:px-2 text-xs font-extrabold uppercase tracking-wider w-[20%] md:w-[30%] text-center border-b border-slate-200">AI 绘图提示词</th>
                            <th className="py-2 px-0.5 md:py-3 md:px-2 text-xs font-extrabold uppercase tracking-wider text-center border-b border-slate-200">画面预览</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {project.storyboard?.map((frame, index) => {
                            const isGeneratingThis = currentGenIds.has(frame.id);
                            return (
                                <tr key={frame.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2 px-0.5 md:py-4 md:px-2 text-center text-slate-400 font-bold text-sm align-middle h-px">
                                        {frame.sceneNumber}
                                    </td>
                                    <td className="py-2 px-0.5 md:py-4 md:px-2 align-middle h-px">
                                        <textarea
                                            readOnly
                                            className="w-full bg-slate-50 rounded-lg p-1 md:p-3 border border-slate-100 text-xs text-slate-700 leading-relaxed font-medium resize-none outline-none focus:ring-0 h-full min-h-[100px] md:h-[270px]"
                                            value={frame.originalText || ''}
                                            placeholder="无原文内容"
                                        />
                                    </td>
                                    <td className="py-2 px-0.5 md:py-4 md:px-2 align-middle h-px">
                                        <div className="relative h-full min-h-[100px] md:h-[270px] flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            {/* Top: Image Prompt (75%) */}
                                            <div className="h-[75%] relative border-b border-slate-100">
                                                <textarea
                                                    className="w-full h-full bg-white p-1 md:p-3 pr-6 md:pr-10 text-xs text-slate-600 leading-relaxed focus:bg-slate-50 outline-none resize-none transition-all"
                                                    value={frame.imagePrompt || ''}
                                                    onChange={(e) => handleSavePrompt(frame.id, e.target.value)}
                                                    placeholder="输入提示词..."
                                                />
                                                <CopyButton text={frame.imagePrompt || ''} />
                                            </div>
                                            {/* Bottom: Start/End Time (25%) */}
                                            <div className="h-[25%] bg-slate-50 flex items-center justify-center px-2">
                                                 <div className="w-full text-center flex flex-col items-center justify-center">
                                                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider mb-0.5">起止时间</span>
                                                    <input 
                                                        readOnly
                                                        className="w-full text-center bg-transparent text-[10px] font-mono text-slate-600 font-bold outline-none"
                                                        placeholder="--:--:-- --> --:--:--"
                                                        value={frame.timeRange || ''}
                                                        title="通过上传字幕自动匹配时间"
                                                    />
                                                 </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-2 px-0.5 md:py-4 md:px-2 align-middle text-center w-[60%] md:w-[40%]">
                                        {/* Dynamic Border Container */}
                                        <div className={`relative w-full aspect-video rounded-xl shadow-sm overflow-hidden transition-all duration-300 group/preview mx-auto isolate ${
                                            isGeneratingThis 
                                              ? 'p-[3px] bg-slate-900' // Dark background for neon contrast + padding for border width
                                              : 'border border-slate-200 bg-slate-900'
                                        }`}>
                                            
                                            {/* Neon Spinner Background (Only visible when generating) */}
                                            {isGeneratingThis && (
                                                <div className="absolute inset-[-50%] bg-[conic-gradient(transparent,theme(colors.fuchsia.500),transparent)] animate-[spin_2s_linear_infinite] -z-10" />
                                            )}

                                            {/* Inner Content Container (The Mask) */}
                                            <div className="relative w-full h-full bg-slate-900 rounded-[9px] overflow-hidden z-10">
                                                {frame.imageUrl ? (
                                                    <>
                                                        <div className="absolute inset-0 w-full h-full">
                                                          <img 
                                                              src={frame.imageUrl} 
                                                              alt={`Scene ${frame.sceneNumber}`} 
                                                              className="absolute inset-0 w-full h-full object-contain md:hover:scale-105 transition-transform duration-500"
                                                              onClick={() => setSelectedImage(frame.imageUrl || null)}
                                                          />
                                                        </div>
                                                        {/* Reload Button (Top-Left) - Only for remote images */}
                                                        {!frame.imageUrl.startsWith('data:') && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleReloadImage(frame); }}
                                                                className="absolute top-2 left-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover/preview:opacity-100 transition-opacity backdrop-blur-sm"
                                                                title="强制刷新图片"
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        
                                                        {/* Regenerate Button (Top-Right) - Hidden by default, show on hover */}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); generateSingleImage(frame); }}
                                                            disabled={isGeneratingThis}
                                                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-fuchsia-600 text-white rounded-lg opacity-0 group-hover/preview:opacity-100 transition-all backdrop-blur-sm shadow-sm"
                                                            title="重新生成这张"
                                                        >
                                                            {isGeneratingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                        </button>
                                                        
                                                        {/* Model Label (Bottom) */}
                                                        {frame.imageModel && (
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[2px] py-1 px-2 text-[10px] text-white/80 font-mono text-center">
                                                                {frame.imageModel}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                                                        {isGeneratingThis ? (
                                                            <>
                                                                <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
                                                                <span className="text-xs font-bold text-fuchsia-500 animate-pulse">正在绘制...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ImageIcon className="w-8 h-8 opacity-20" />
                                                                {/* Regenerate Button (Top-Right) - Visible for empty state */}
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); generateSingleImage(frame); }}
                                                                    className="absolute top-2 right-2 p-1.5 bg-white/10 border border-white/20 text-slate-400 hover:text-fuchsia-400 hover:border-fuchsia-400/50 rounded-lg shadow-sm transition-all"
                                                                    title="立即生成"
                                                                >
                                                                    <Zap className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
            <img src={selectedImage} alt="Fullscreen" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
            <button className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
                <X className="w-8 h-8" />
            </button>
        </div>
      )}

      {/* Toast Message */}
      {message && (
        <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 z-[100] flex items-start gap-3 max-w-lg break-words ${
            messageType === 'success' ? 'bg-emerald-500 text-white' : 
            messageType === 'warning' ? 'bg-amber-500 text-white' :
            'bg-rose-500 text-white'
        }`}>
            <div className="mt-0.5 shrink-0">
                {messageType === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="font-bold text-sm leading-snug">{message}</div>
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
                      {/* Model Selection */}
                      <div className="space-y-3">
                          <label className="text-sm font-bold text-slate-700 block">AI 模型选择</label>
                          <div className="grid grid-cols-1 gap-3">
                              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${imageModel === 'gemini-2.5-flash-image' ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-slate-100 hover:border-slate-200'}`}>
                                  <input 
                                    type="radio" 
                                    name="model" 
                                    value="gemini-2.5-flash-image"
                                    checked={imageModel === 'gemini-2.5-flash-image'}
                                    onChange={(e) => setImageModel(e.target.value)}
                                    className="mt-1"
                                  />
                                  <div>
                                      <div className="font-bold text-slate-800 text-sm">Gemini 2.5 Flash Image</div>
                                      <div className="text-xs text-slate-500 mt-1">速度快，免费额度高，适合快速预览。</div>
                                  </div>
                              </label>

                              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${imageModel === 'gemini-3-pro-image-preview' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'}`}>
                                  <input 
                                    type="radio" 
                                    name="model" 
                                    value="gemini-3-pro-image-preview"
                                    checked={imageModel === 'gemini-3-pro-image-preview'}
                                    onChange={(e) => setImageModel(e.target.value)}
                                    className="mt-1"
                                  />
                                  <div>
                                      <div className="font-bold text-slate-800 text-sm">Gemini 3 Pro Image (High Quality)</div>
                                      <div className="text-xs text-slate-500 mt-1">画质更佳，支持文字渲染。需 Google Cloud 结算账号 (Pay-as-you-go)。</div>
                                  </div>
                              </label>
                          </div>
                          <div className="text-[10px] text-slate-400 px-1">
                              注意：Pro 模型不包含在 Gemini Advanced 个人订阅中，需要开通 Google Cloud Vertex AI/AI Studio 并绑定信用卡结算。
                          </div>
                      </div>

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
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                              />
                          </div>
                          <p className="text-xs text-slate-400 mt-2">
                              如果不填，将使用系统默认的环境变量 Key。填入后仅在此页面生效，保存在本地浏览器中。
                          </p>
                      </div>
                  </div>

                  <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                      <button 
                          onClick={() => { setCustomKey(''); setImageModel('gemini-2.5-flash-image'); }}
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
