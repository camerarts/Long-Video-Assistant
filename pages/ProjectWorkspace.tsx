import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, TitleItem, StoryboardFrame, CoverOption, PromptTemplate, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { 
  ArrowLeft, Layout, FileText, Type, 
  List, PanelRightClose, Sparkles, Loader2, Copy, 
  Check, Images, ArrowRight, Palette, Film, Maximize2, Play,
  ZoomIn, ZoomOut, Move, RefreshCw, Rocket, AlertCircle, Archive,
  Cloud, CloudCheck
} from 'lucide-react';

// --- Sub-Components ---

const RowCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-violet-600 transition-colors" title="复制">
      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

interface TextResultBoxProps {
    content: string;
    title: string;
    onSave?: (val: string) => void;
    placeholder?: string;
    showStats?: boolean;
    readOnly?: boolean;
}

const TextResultBox = ({ content, title, onSave, placeholder, showStats, readOnly }: TextResultBoxProps) => {
  const [value, setValue] = useState(content || '');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) setValue(content || '');
  }, [content, isDirty]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setIsDirty(true);
  };

  const handleSave = () => {
    if (onSave) {
        onSave(value);
        setIsDirty(false);
    }
  };

  const charCount = (value || '').length;
  const chineseCount = (value || '').match(/[\u4e00-\u9fa5]/g)?.length || 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full max-h-[600px]">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h4>
             {showStats && (
                 <div className="flex gap-2">
                     <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500 font-mono flex items-center gap-1" title="总字符数">
                        <span className="font-bold text-slate-700">{charCount}</span> 字符
                     </span>
                     <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500 font-mono flex items-center gap-1" title="中文字符数">
                        <span className="font-bold text-slate-700">{chineseCount}</span> 汉字
                     </span>
                 </div>
             )}
        </div>
        <div className="flex items-center gap-2">
            {!readOnly && onSave && isDirty && (
                 <button onClick={handleSave} className="flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-2 py-1 rounded shadow-sm transition-all animate-pulse">
                    <Check className="w-3 h-3" /> 保存
                 </button>
            )}
            <RowCopyButton text={value} />
        </div>
      </div>
      {onSave && !readOnly ? (
        <textarea 
            className="flex-1 w-full p-4 text-sm text-slate-700 leading-relaxed font-mono outline-none resize-none bg-white focus:bg-slate-50/30 transition-colors"
            value={value}
            onChange={handleChange}
            placeholder={placeholder || "暂无内容..."}
        />
      ) : (
        <div className="p-4 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-mono flex-1">
          {content || <span className="text-slate-400 italic">暂无内容...</span>}
        </div>
      )}
    </div>
  );
};

interface TableResultBoxProps<T> {
    headers: string[];
    data: T[];
    renderRow: (item: T, index: number) => React.ReactNode;
}

const TableResultBox = <T extends any>({ headers, data, renderRow }: TableResultBoxProps<T>) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
          <tr>
            {headers.map((h: string) => (
              <th key={h} className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data && data.length > 0 ? data.map(renderRow) : (
            <tr><td colSpan={headers.length} className="text-center py-8 text-slate-400 text-sm">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Configuration ---

const NODE_WIDTH = 280;
const NODE_HEIGHT = 180;

// Workflow Layout Definition
const NODES_CONFIG = [
  { id: 'input', label: '项目输入', panelTitle: '项目基础信息', icon: Layout, color: 'blue', description: '选题与基本信息', x: 50, y: 300 },
  { id: 'script', label: '视频脚本', panelTitle: '视频文案脚本编辑器', icon: FileText, color: 'violet', promptKey: 'SCRIPT', description: '生成分章节的详细脚本', x: 450, y: 300 },
  // Column 2: Outputs from Script
  { id: 'titles', label: '爆款标题', panelTitle: '爆款标题方案', icon: Type, color: 'amber', promptKey: 'TITLES', description: '生成高点击率标题', x: 850, y: 100 },
  { id: 'sb_text', label: '分镜文案', panelTitle: '分镜画面描述', icon: Film, color: 'fuchsia', promptKey: 'STORYBOARD_TEXT', description: '拆解为可视化画面描述', x: 850, y: 300 },
  { id: 'summary', label: '简介与标签', panelTitle: '视频简介与标签', icon: List, color: 'emerald', promptKey: 'SUMMARY', description: '生成简介和Hashtags', x: 850, y: 500 },
  { id: 'cover', label: '封面策划', panelTitle: '封面视觉与文案策划', icon: Palette, color: 'rose', promptKey: 'COVER_GEN', description: '策划封面视觉与文案', x: 850, y: 700 },
];

const CONNECTIONS = [
  { from: 'input', to: 'script' },
  { from: 'script', to: 'sb_text' },
  { from: 'script', to: 'titles' },
  { from: 'script', to: 'summary' },
  { from: 'script', to: 'cover' },
];

// --- Main Component ---

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null); // Initialized to null for default collapsed state
  // Changed to Set to allow concurrent generation indicators
  const [generatingNodes, setGeneratingNodes] = useState<Set<string>>(new Set());
  const [failedNodes, setFailedNodes] = useState<Set<string>>(new Set());
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // Canvas State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Sync Status State
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState('');

  // To prevent async update on unmounted component
  const mountedRef = useRef(true);

  // Activity Tracking Refs
  const lastActivityRef = useRef(Date.now());
  const isBusyRef = useRef(false);

  // Update busy ref based on state
  useEffect(() => {
      // Busy if loading, generating, dragging canvas, or user has a panel open (likely editing)
      isBusyRef.current = loading || generatingNodes.size > 0 || isDragging || selectedNodeId !== null;
  }, [loading, generatingNodes, isDragging, selectedNodeId]);

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
        if (mountedRef.current) setLoading(false);
    };
    init();
    return () => { mountedRef.current = false; };
  }, [id, navigate]);

  // Canvas Interactions
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.5, transform.scale + delta), 2);
        setTransform(prev => ({ ...prev, scale: newScale }));
    } else {
        setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
      // Close sidebar if open when clicking on background
      if (selectedNodeId) {
          setSelectedNodeId(null);
      }

      // Allow drag on Space+Click OR Middle Click OR Left Click on empty space
      if (e.button === 1 || e.button === 0) { 
          setIsDragging(true);
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
      if (isDragging) {
          const dx = e.clientX - dragStartRef.current.x;
          const dy = e.clientY - dragStartRef.current.y;
          setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handleCanvasMouseUp = () => {
      setIsDragging(false);
  };

  // Touch Handlers for Pad/Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
         if (selectedNodeId) setSelectedNodeId(null);
         setIsDragging(true);
         dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
          const dx = e.touches[0].clientX - dragStartRef.current.x;
          const dy = e.touches[0].clientY - dragStartRef.current.y;
          setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
  };

  const handleTouchEnd = () => {
      setIsDragging(false);
  };

  // Helper for score formatting
  const formatScore = (val: number | undefined) => {
    if (val === undefined || val === null) return '-';
    const num = Number(val);
    // Backward compatibility: If score is on 100 scale (e.g. 85), divide by 10.
    // If it's on 10 scale (e.g. 8.5), keep it.
    if (num > 10) {
        return (num / 10).toFixed(1);
    }
    return num.toFixed(1);
  };

  // Helper for prompt interpolation
  const interpolate = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const saveProjectUpdate = async (updater: (p: ProjectData) => ProjectData) => {
      if (!id) return;
      // 1. Local Update
      const updated = await storage.updateProject(id, updater);
      if (updated && mountedRef.current) {
          setProject(updated);

          // 2. Cloud Sync (Push)
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

  const generateNodeContent = async (nodeId: string) => {
      if (!project) throw new Error("项目数据未加载");

      const config = NODES_CONFIG.find(n => n.id === nodeId);
      if (!config || !config.promptKey) return;
      
      const template = prompts[config.promptKey]?.template || '';
      
      // Prepare context data for interpolation
      // Using current project state. For parallel execution, ensure dependencies (script) are present.
      const contextData: Record<string, string> = {
          topic: project.inputs.topic,
          tone: project.inputs.tone,
          language: project.inputs.language,
          title: project.title, 
          script: project.script || ''
      };

      const prompt = interpolate(template, contextData);

      if (nodeId === 'script') {
          const text = await gemini.generateText(prompt, 'gemini-2.5-flash-preview-09-2025'); 
          await saveProjectUpdate(p => ({ 
              ...p, 
              script: text, 
              status: p.status === ProjectStatus.DRAFT ? ProjectStatus.IN_PROGRESS : p.status 
          }));
      } 
      else if (nodeId === 'summary') {
          const text = await gemini.generateText(prompt);
          await saveProjectUpdate(p => ({ ...p, summary: text }));
      }
      else if (nodeId === 'titles') {
          const data = await gemini.generateJSON<TitleItem[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      title: {type: "STRING"},
                      keywords: {type: "STRING"},
                      score: {type: "NUMBER"}
                  }
              }
          });
          await saveProjectUpdate(p => ({ ...p, titles: data }));
      }
      else if (nodeId === 'cover') {
          const data = await gemini.generateJSON<CoverOption[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      visual: {type: "STRING"},
                      copy: {type: "STRING"},
                      score: {type: "NUMBER"}
                  }
              }
          });
          await saveProjectUpdate(p => ({ ...p, coverOptions: data }));
      }
      else if (nodeId === 'sb_text') {
          const data = await gemini.generateJSON<{original: string, description: string}[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      original: {type: "STRING"},
                      description: {type: "STRING"}
                  }
              }
          });
          // Note: Mapped reversed based on user feedback that extraction content was swapped.
          // original -> description field, description -> originalText field
          const frames: StoryboardFrame[] = data.map((item, idx) => ({
              id: crypto.randomUUID(),
              sceneNumber: idx + 1,
              originalText: item.description,
              description: item.original
          }));
          await saveProjectUpdate(p => ({ ...p, storyboard: frames }));
      }
  };

  const handleGenerate = async (nodeId: string) => {
    if (!project) return;
    if (generatingNodes.has(nodeId)) return;
    
    // Check dependencies
    if (['sb_text', 'titles', 'summary', 'cover'].includes(nodeId) && !project.script) {
        alert("请先生成视频脚本 (Script)，然后再执行此步骤。");
        return;
    }

    setGeneratingNodes(prev => new Set(prev).add(nodeId));
    setFailedNodes(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
    });

    try {
        await generateNodeContent(nodeId);
    } catch (error: any) {
        alert(`生成失败: ${error.message}`);
        console.error(error);
        setFailedNodes(prev => new Set(prev).add(nodeId));
    } finally {
        if (mountedRef.current) {
            setGeneratingNodes(prev => {
                const next = new Set(prev);
                next.delete(nodeId);
                return next;
            });
        }
    }
  };

  const handleOneClickStart = async () => {
      if (!project?.script) {
          alert("【一键启动】需要先生成视频脚本。请先完成脚本生成。");
          return;
      }

      const targets = ['titles', 'sb_text', 'summary', 'cover'];
      
      // Mark all as generating
      setGeneratingNodes(prev => {
          const next = new Set(prev);
          targets.forEach(t => next.add(t));
          return next;
      });

      const processWithRetry = async (id: string) => {
          // Clear any previous failure
          setFailedNodes(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
          });

          try {
              await generateNodeContent(id);
          } catch (error) {
              console.warn(`模块 [${id}] 第一次生成失败，正在重试...`, error);
              // Simple wait before retry
              await new Promise(r => setTimeout(r, 1000));
              try {
                  await generateNodeContent(id);
              } catch (retryError: any) {
                  console.error(`模块 [${id}] 第二次生成失败`, retryError);
                  // Mark as failed
                  setFailedNodes(prev => new Set(prev).add(id));
              }
          } finally {
               if (mountedRef.current) {
                  setGeneratingNodes(prev => {
                      const next = new Set(prev);
                      next.delete(id);
                      return next;
                  });
              }
          }
      };

      // Execute in parallel
      await Promise.all(targets.map(id => processWithRetry(id)));
  };

  // SVG Curve Calculator
  const getCurvePath = (start: {x:number, y:number}, end: {x:number, y:number}) => {
      const sx = start.x + NODE_WIDTH;
      const sy = start.y + NODE_HEIGHT / 2;
      const ex = end.x;
      const ey = end.y + NODE_HEIGHT / 2;
      const c1x = sx + (ex - sx) / 2;
      const c1y = sy;
      const c2x = ex - (ex - sx) / 2;
      const c2y = ey;
      return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
  };

  if (loading || !project) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>;
  }

  const isArchived = project.status === ProjectStatus.ARCHIVED;

  return (
    <div className="flex h-full bg-[#F8F9FC] relative overflow-hidden">
        {/* Top Header Overlay */}
        <div className="absolute top-0 left-0 right-0 z-20 px-8 py-4 pointer-events-none flex justify-between items-start">
             <div className="pointer-events-auto bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-2xl px-6 py-3 flex items-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-lg font-extrabold text-slate-900 truncate max-w-[200px] md:max-w-[600px]" title={project.title}>{project.title}</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isArchived ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {isArchived ? '已归档 (只读)' : project.status}
                        </span>
                        <span className="text-[10px] text-slate-400">更新于 {new Date(project.updatedAt).toLocaleTimeString()}</span>
                    </div>
                </div>
             </div>

             <div className="pointer-events-auto flex gap-3">
                 {/* Sync Status Badge */}
                 <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md border animate-in fade-in transition-colors bg-white/90 backdrop-blur shadow-sm h-10 ${
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

                 {isArchived ? (
                     <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-900/10">
                         <Archive className="w-4 h-4" />
                         <span>项目已归档</span>
                     </div>
                 ) : (
                    <button 
                        onClick={handleOneClickStart}
                        disabled={generatingNodes.size > 0 || !project.script}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                        title={!project.script ? "请先生成视频脚本" : "一键生成标题、分镜、简介与封面 (自动失败重试)"}
                    >
                        {generatingNodes.size > 0 && ['titles', 'sb_text', 'summary', 'cover'].some(id => generatingNodes.has(id)) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                        一键启动
                    </button>
                 )}

                 <div className="flex gap-2">
                    <button onClick={() => setTransform(prev => ({...prev, scale: prev.scale + 0.1}))} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm text-slate-600">
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={() => setTransform(prev => ({...prev, scale: Math.max(0.5, prev.scale - 0.1)}))} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm text-slate-600">
                        <ZoomOut className="w-5 h-5" />
                    </button>
                 </div>
             </div>
        </div>

        {/* Canvas Area */}
        <div 
            ref={canvasRef}
            className={`flex-1 overflow-hidden relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} touch-none`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
             {/* Background Grid */}
            <div 
                className="absolute inset-0 opacity-5 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
                    backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
                    backgroundPosition: `${transform.x}px ${transform.y}px`
                }}
            />

            {/* Transform Container */}
            <div 
                className="absolute origin-top-left transition-transform duration-75 ease-out will-change-transform"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
                {/* Connections Layer */}
                <svg className="overflow-visible absolute top-0 left-0 pointer-events-none" style={{ width: 1, height: 1 }}>
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                        </marker>
                    </defs>
                    {CONNECTIONS.map((conn, idx) => {
                        const fromNode = NODES_CONFIG.find(n => n.id === conn.from);
                        const toNode = NODES_CONFIG.find(n => n.id === conn.to);
                        if (!fromNode || !toNode) return null;
                        return (
                            <path 
                                key={idx}
                                d={getCurvePath(fromNode, toNode)}
                                stroke="#cbd5e1"
                                strokeWidth="2"
                                fill="none"
                                markerEnd="url(#arrowhead)"
                            />
                        );
                    })}
                </svg>

                {/* Nodes Layer */}
                {NODES_CONFIG.map((node) => {
                     const isActive = selectedNodeId === node.id;
                     // Check if this specific node is currently regenerating
                     const isGenerating = generatingNodes.has(node.id);
                     const isFailed = failedNodes.has(node.id);
                     
                     // Determine status of data
                     let hasData = false;
                     if (node.id === 'input') hasData = !!project.inputs.topic;
                     if (node.id === 'script') hasData = !!project.script;
                     if (node.id === 'sb_text') hasData = !!project.storyboard && project.storyboard.length > 0;
                     if (node.id === 'titles') hasData = !!project.titles && project.titles.length > 0;
                     if (node.id === 'summary') hasData = !!project.summary;
                     if (node.id === 'cover') hasData = !!project.coverOptions && project.coverOptions.length > 0;

                     // Visual Feedback Logic for Titles, Storyboard, Summary, Cover
                     let bgClass = 'bg-white';
                     if (['titles', 'sb_text', 'summary', 'cover'].includes(node.id)) {
                        if (hasData) {
                            bgClass = 'bg-emerald-50';
                        } else if (isFailed) {
                            bgClass = 'bg-rose-50';
                        }
                     }

                     return (
                         <div 
                            key={node.id}
                            style={{ 
                                left: node.x, 
                                top: node.y,
                                width: NODE_WIDTH,
                                height: NODE_HEIGHT
                            }}
                            className={`absolute ${bgClass} rounded-2xl p-0 border-2 transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-xl ${
                                isActive 
                                ? `border-${node.color}-500 shadow-xl shadow-${node.color}-500/10 scale-105 z-10` 
                                : 'border-slate-100 shadow-lg shadow-slate-200/50 hover:border-slate-300'
                            }`}
                            onMouseDown={(e) => {
                                e.stopPropagation(); // Prevent canvas drag
                                setSelectedNodeId(node.id);
                            }}
                            onTouchStart={(e) => {
                                e.stopPropagation(); // Prevent canvas drag on touch
                                setSelectedNodeId(node.id);
                            }}
                         >
                             {/* Content Wrapper */}
                             <div className="p-5 h-full relative flex flex-col justify-between">
                                {/* Header: Icon & Status */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className={`w-10 h-10 rounded-xl bg-${node.color}-100 text-${node.color}-600 flex items-center justify-center shadow-sm`}>
                                        <node.icon className="w-5 h-5" />
                                    </div>
                                    {hasData && (
                                        <div className="bg-emerald-100 text-emerald-600 p-1 rounded-full shadow-sm">
                                            <Check className="w-3.5 h-3.5" />
                                        </div>
                                    )}
                                    {!hasData && isFailed && (
                                         <div className="bg-rose-100 text-rose-600 p-1 rounded-full shadow-sm">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                        </div>
                                    )}
                                </div>
                                
                                {/* Text Content */}
                                <div className="pr-2 mb-8">
                                    <h3 className="text-base font-bold text-slate-800 mb-1">{node.label}</h3>
                                    <p className="text-[10px] text-slate-400 font-medium leading-snug line-clamp-2">{node.description}</p>
                                </div>

                                {/* Action Button - Positioned Bottom Right */}
                                {node.id !== 'input' && !isArchived && (
                                     <div className="absolute right-5 bottom-5">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleGenerate(node.id); }}
                                            disabled={isGenerating}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                hasData 
                                                ? 'bg-white border border-slate-200 text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:shadow-md' 
                                                : `bg-${node.color}-50 text-${node.color}-600 hover:bg-${node.color}-100 border border-${node.color}-100 hover:shadow-md`
                                            }`}
                                        >
                                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : (hasData ? <RefreshCw className="w-3 h-3" /> : (isFailed ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />))}
                                            {isGenerating ? '生成中...' : (hasData ? '重新生成' : (isFailed ? '重试生成' : '开始生成'))}
                                        </button>
                                     </div>
                                )}
                                {node.id === 'input' && (
                                     <span className="absolute right-5 bottom-5 text-[10px] font-bold text-slate-400 px-2 py-1 bg-slate-50 rounded-md border border-slate-100">
                                         已就绪
                                     </span>
                                )}
                             </div>
                         </div>
                     );
                 })}
            </div>
        </div>

        {/* Right Panel: Result Details */}
        <div 
            className={`absolute top-0 right-0 bottom-0 bg-white/95 backdrop-blur-xl border-l border-slate-200 shadow-[-4px_0_24px_rgba(0,0,0,0.05)] transform transition-all duration-300 z-30 flex flex-col w-[480px] ${selectedNodeId ? 'translate-x-0' : 'translate-x-full'}`}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Right Panel Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white/50 sticky top-0 z-20 backdrop-blur-md flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedNodeId(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <PanelRightClose className="w-5 h-5 text-slate-600" />
                    </button>
                    {selectedNodeId && (() => {
                        const node = NODES_CONFIG.find(n => n.id === selectedNodeId);
                        return (
                            <div className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                                <div className={`w-8 h-8 rounded-lg bg-${node?.color}-100 text-${node?.color}-600 flex items-center justify-center`}>
                                    {node?.icon && <node.icon className="w-4 h-4" />}
                                </div>
                                <h3 className="font-bold text-slate-800 text-base">{node?.panelTitle}</h3>
                            </div>
                        );
                    })()}
                </div>
                
                <div>
                     {selectedNodeId && !isArchived && (() => {
                         const node = NODES_CONFIG.find(n => n.id === selectedNodeId);
                         return (
                            node?.id !== 'input' && (
                                <button 
                                    onClick={() => handleGenerate(selectedNodeId!)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all bg-${node?.color}-50 text-${node?.color}-600 hover:bg-${node?.color}-100 shadow-sm border border-${node?.color}-100`}
                                >
                                    <Sparkles className="w-3 h-3" /> 重新生成
                                </button>
                            )
                         );
                     })()}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[#F8F9FC] flex flex-col">
                 {/* Dynamic Content Based on Node */}
                 {selectedNodeId === 'input' && (
                     <div className="space-y-4 h-full">
                         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">项目主题</label>
                             <p className="text-base font-bold text-slate-800 pr-8">{project.inputs.topic}</p>
                             <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <RowCopyButton text={project.inputs.topic} />
                             </div>
                         </div>
                     </div>
                 )}

                 {selectedNodeId === 'script' && (
                    <TextResultBox 
                        content={project.script || ''} 
                        title="视频文案脚本" 
                        placeholder="在此输入或粘贴视频脚本内容。输入完成后点击右上角保存，即可作为后续步骤的依据。"
                        onSave={(val) => saveProjectUpdate(p => ({ ...p, script: val, status: p.status === ProjectStatus.DRAFT ? ProjectStatus.IN_PROGRESS : p.status }))}
                        showStats={true}
                        readOnly={isArchived}
                    />
                 )}

                 {selectedNodeId === 'summary' && (
                    <TextResultBox content={project.summary || ''} title="简介与标签" />
                 )}

                 {selectedNodeId === 'titles' && (
                     <TableResultBox 
                        headers={['序号', '爆款標題', '关键词', '得分', '操作']}
                        data={project.titles || []}
                        renderRow={(item: TitleItem, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 group">
                                <td className="py-3 px-2 text-center text-xs font-bold text-slate-400 w-[10%] align-top pt-3">{i + 1}</td>
                                <td className="py-3 px-2 text-sm text-slate-800 font-bold leading-snug w-[60%] align-top pt-3">
                                    {item.title}
                                </td>
                                <td className="py-3 px-2 w-[12%] align-top">
                                    <div className="flex flex-col gap-1.5 pt-0.5">
                                        {(item.keywords || item.type || '').split(/[,，、 ]+/).filter(Boolean).slice(0, 5).map((k, kIdx) => (
                                            <span key={kIdx} className="inline-block text-[10px] leading-none text-slate-500 bg-slate-100 px-1.5 py-1 rounded text-center">
                                                {k.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="py-3 px-2 text-center w-[12%] align-middle">
                                    <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-orange-600 italic tracking-tighter">
                                        {formatScore(item.score)}
                                    </span>
                                </td>
                                <td className="py-3 px-2 text-right w-[6%] align-top pt-3">
                                    <RowCopyButton text={`${item.title} ${item.keywords || item.type || ''}`} />
                                </td>
                            </tr>
                        )}
                     />
                 )}

                 {selectedNodeId === 'cover' && (
                     <div className="space-y-6">
                        {project.coverOptions && project.coverOptions.length > 0 ? (
                            <div className="space-y-4">
                                {project.coverOptions.map((opt, i) => (
                                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-3">
                                            <span className="bg-rose-50 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-100">方案 {i+1}</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">推荐指数</span>
                                                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-orange-600 italic tracking-tighter">
                                                    {formatScore(opt.score)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">画面描述</p>
                                            <p className="text-xs text-slate-600 leading-relaxed">{opt.visual}</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 relative group">
                                            <p className="text-sm font-bold text-slate-800 whitespace-pre-line leading-relaxed text-center font-serif">
                                                {(opt.copy || '').replace(/\|/g, '\n')}
                                            </p>
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <RowCopyButton text={(opt.copy || '').replace(/\|/g, '\n')} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                                <p>暂无封面方案，点击生成按钮开始策划。</p>
                            </div>
                        )}
                     </div>
                 )}

                 {selectedNodeId === 'sb_text' && (
                     <div className="flex flex-col h-full">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between flex-shrink-0 -mx-6 -mt-6 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                                    <Images className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">AI 图片生成</h3>
                                    <p className="text-[10px] text-slate-400">基于当前分镜列表批量生图</p>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate(`/project/${project.id}/images`)}
                                className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20 text-xs"
                            >
                                前往工坊 <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                             <TableResultBox 
                                headers={['#', '原文', '画面描述', '']}
                                data={project.storyboard || []}
                                renderRow={(item: StoryboardFrame, i: number) => (
                                    <tr key={item.id} className="hover:bg-slate-50 group">
                                        <td className="py-4 px-5 text-center text-xs font-bold text-slate-400 align-top">{item.sceneNumber}</td>
                                        <td className="py-4 px-5 align-top max-w-[150px]">
                                            <div className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap line-clamp-5">
                                                {item.originalText}
                                            </div>
                                        </td>
                                        <td className="py-4 px-5 align-top">
                                            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-5">
                                                {item.description}
                                            </div>
                                        </td>
                                        <td className="py-4 px-5 text-right align-top">
                                             <RowCopyButton text={item.description} />
                                        </td>
                                    </tr>
                                )}
                             />
                        </div>
                     </div>
                 )}
            </div>
        </div>
    </div>
  );
};

export default ProjectWorkspace;
