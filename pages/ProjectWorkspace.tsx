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
  Cloud, CloudCheck, ArrowLeftRight, Settings2, X, Key, Clock, Eraser, ClipboardPaste,
  Bot, ChevronDown, ExternalLink
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

// --- Advanced Parsing Logic for Cover BG ---
const normalizeBgOptions = (options: any[]) => {
    if (!options || options.length === 0) return [];

    // Heuristic: Check if the first item contains mixed/bulk text
    // Matches if we see multiple occurrences of "Left..." or "左画面..."
    const firstItemText = (options[0].leftPrompt || '') + (options[0].visual || '');
    const keywordCount = (firstItemText.match(/左画面|Left Prompt/gi) || []).length;

    // If we have >1 items already, assume it's structured correctly.
    // If keyword count is small (<=1), it's likely a single proper item.
    // Only process if we detect multiple sets in a single item OR if the array has only 1 item but lots of text.
    if (options.length > 1 && keywordCount <= 1) return options;

    // --- Bulk Extraction Mode ---
    // Combine all potential text fields to handle cases where AI dumped everything into one field or spread loosely
    let fullText = options.map(o => `${o.leftPrompt || ''} ${o.visual || ''} ${o.rightPrompt || ''}`).join('\n');

    const normalized: any[] = [];
    
    // Regex Logic:
    // 1. Match "Left..." tag
    // 2. Capture content until "Right..." tag (Group 1)
    // 3. Match "Right..." tag
    // 4. Capture content until next "Left..." tag OR end of string (Group 2)
    const regex = /(?:左画面(?:提示词)?|Left Prompt)[:：]\s*([\s\S]*?)\s*(?:右画面(?:提示词)?|Right Prompt)[:：]\s*([\s\S]*?)(?=(?:左画面(?:提示词)?|Left Prompt)[:：]|$)/gi;

    let match;
    while ((match = regex.exec(fullText)) !== null) {
        normalized.push({
            leftPrompt: match[1].trim(),
            rightPrompt: match[2].trim(),
            score: options[0].score // Preserve score if available
        });
    }

    // If regex found matches, use them. Otherwise fallback to original data.
    return normalized.length > 0 ? normalized : options;
};

// --- Configuration ---

const NODE_WIDTH = 280;
const NODE_HEIGHT = 180;

// Workflow Layout Definition
const NODES_CONFIG = [
  { id: 'input', step: 1, label: '项目输入', panelTitle: '项目基础信息', icon: Layout, color: 'blue', description: '选题与基本信息', x: 50, y: 300 },
  { id: 'script', step: 2, label: '视频脚本', panelTitle: '视频文案脚本编辑器', icon: FileText, color: 'violet', promptKey: 'SCRIPT', description: '生成分章节的详细脚本', model: 'Gemini 2.5 Flash Preview', x: 450, y: 300 },
  // Column 2: Outputs from Script - Vertically Centered around y=300 (Script)
  { id: 'titles', step: 3, label: '爆款标题', panelTitle: '爆款标题方案', icon: Type, color: 'amber', promptKey: 'TITLES', description: '生成高点击率标题', model: 'Gemini 2.5 Flash', x: 850, y: -200 },
  { id: 'sb_text', step: 4, label: '分镜文案', panelTitle: '分镜画面描述', icon: Film, color: 'fuchsia', promptKey: 'STORYBOARD_TEXT', description: '拆解为可视化画面描述', model: 'Gemini 2.5 Flash', x: 850, y: 0 },
  { id: 'summary', step: 5, label: '简介与标签', panelTitle: '视频简介与标签', icon: List, color: 'emerald', promptKey: 'SUMMARY', description: '生成简介和Hashtags', model: 'Gemini 2.5 Flash', x: 850, y: 200 },
  { id: 'cover', step: 6, label: '封面文字策划A-4行字', panelTitle: '封面文字策划A-4行字', icon: Palette, color: 'rose', promptKey: 'COVER_GEN', description: '方案A：信息量丰富型封面文案', model: 'Gemini 2.5 Flash', x: 850, y: 400 },
  { id: 'cover_b', step: 7, label: '封面文字策划B-2行字', panelTitle: '封面文字策划B-2行字', icon: Palette, color: 'orange', promptKey: 'COVER_GEN_B', description: '方案B：极简冲击型封面文案', model: 'Gemini 2.5 Flash', x: 850, y: 600 },
  { id: 'cover_bg', step: 8, label: '封面背景图', panelTitle: '封面背景画面描述', icon: Images, color: 'cyan', promptKey: 'COVER_BG_IMAGE', description: '生成无文字的封面背景图描述', model: 'Gemini 2.5 Flash', x: 850, y: 800 },
];

const CONNECTIONS = [
  { from: 'input', to: 'script' },
  { from: 'script', to: 'sb_text' },
  { from: 'script', to: 'titles' },
  { from: 'script', to: 'summary' },
  { from: 'script', to: 'cover' },
  { from: 'script', to: 'cover_b' },
  { from: 'script', to: 'cover_bg' },
];

// Helper to format timestamp
const formatTimestamp = (ts?: number) => {
    if (!ts) return null;
    const date = new Date(ts);
    // Format: MM-DD HH:mm
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${m}-${d} ${h}:${min}`;
};

// --- Main Component ---

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null); 
  const [generatingNodes, setGeneratingNodes] = useState<Set<string>>(new Set());
  const [failedNodes, setFailedNodes] = useState<Set<string>>(new Set());
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  const [isOneClickRunning, setIsOneClickRunning] = useState(false);
  
  // API Configuration
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customKey, setCustomKey] = useState('');

  // Model Selection
  const [textModel, setTextModel] = useState<string>('gemini-2.5-flash-preview-09-2025');
  const [showModelMenu, setShowModelMenu] = useState(false);

  // Canvas State - Adjusted initial view to see top nodes
  const [transform, setTransform] = useState({ x: 50, y: 300, scale: 0.85 });
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
      isBusyRef.current = loading || generatingNodes.size > 0 || isDragging || selectedNodeId !== null || showConfigModal;
  }, [loading, generatingNodes, isDragging, selectedNodeId, showConfigModal]);

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
              // Instead of heavy downloadAllData, just sync this specific project
              const remoteP = await storage.syncProject(id);
              if (remoteP && mountedRef.current) {
                  // Only update if remote is newer
                  if (!project || remoteP.updatedAt > project.updatedAt) {
                      setProject(remoteP);
                  }
                  setSyncStatus('synced');
                  setLastSyncTime(new Date().toLocaleTimeString());
              } else {
                  if (mountedRef.current) setSyncStatus('synced');
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
  }, [id, project]);

  useEffect(() => {
    mountedRef.current = true;
    const init = async () => {
        if (id) {
            // 1. Local Load (Instant)
            const p = await storage.getProject(id);
            if (p) {
                if (mountedRef.current) {
                    setProject(p);
                    setLoading(false); // Unblock UI immediately
                }
            } else {
                // If local project not found, try fetching once from cloud before giving up
            }

            // 2. Cloud Sync (Background Pull - Single Project)
            if (mountedRef.current) setSyncStatus('saving');
            try {
                // Use lightweight syncProject instead of heavy downloadAllData
                const freshP = await storage.syncProject(id);
                if (freshP && mountedRef.current) {
                    // Update if we didn't have local data OR remote is newer
                    if (!p || freshP.updatedAt > p.updatedAt) {
                        setProject(freshP);
                    }
                    setSyncStatus('synced');
                    setLastSyncTime(new Date().toLocaleTimeString());
                } else if (!p) {
                    // No local, no remote -> 404
                    if (mountedRef.current) navigate('/');
                    return;
                }
            } catch (e) {
                console.warn("Auto-sync failed", e);
                if (mountedRef.current) setSyncStatus('error');
            }
        }
        
        const loadedPrompts = await storage.getPrompts();
        if (mountedRef.current) setPrompts(loadedPrompts);
        
        const storedKey = localStorage.getItem('lva_custom_api_key');
        if (storedKey && mountedRef.current) setCustomKey(storedKey);

        const storedModel = localStorage.getItem('lva_text_model');
        if (storedModel && mountedRef.current) setTextModel(storedModel);

        // Ensure loading is off if we haven't turned it off yet (e.g., waiting for remote only)
        if (mountedRef.current) setLoading(false);
    };
    init();
    return () => { mountedRef.current = false; };
  }, [id, navigate]);

  const saveSettings = () => {
      localStorage.setItem('lva_custom_api_key', customKey);
      setShowConfigModal(false);
  };

  const handleModelSelect = (model: string) => {
      setTextModel(model);
      localStorage.setItem('lva_text_model', model);
      setShowModelMenu(false);
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
      
      // Close model menu if open
      if (showModelMenu) setShowModelMenu(false);

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

  const handleSwapContent = async () => {
        if (!project || !project.storyboard) return;
        if (!window.confirm("确定要对调【原文】和【画面描述】的内容吗？")) return;
        
        const updatedStoryboard = project.storyboard.map(f => ({
            ...f,
            originalText: f.description,
            description: f.originalText || ''
        }));
        
        await saveProjectUpdate(p => ({ ...p, storyboard: updatedStoryboard }));
  };

  const handleReset = async (nodeId: string) => {
      if (project?.status === ProjectStatus.ARCHIVED) return;
      if (!window.confirm("确定要重置此模块吗？\n这将清空当前已生成的内容，状态将恢复为未开始。")) return;

      // Remove from failed/generating states
      setFailedNodes(prev => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
      });
      setGeneratingNodes(prev => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
      });

      await saveProjectUpdate(p => {
          const updates: any = {};
          const timestamps = { ...p.moduleTimestamps };
          delete timestamps[nodeId];

          switch(nodeId) {
              case 'titles': updates.titles = []; break;
              case 'sb_text': updates.storyboard = []; break;
              case 'summary': updates.summary = ''; break;
              case 'cover': updates.coverOptions = []; break;
              case 'cover_b': updates.coverOptionsB = []; break;
              case 'cover_bg': 
                  updates.coverBgImageDescription = ''; 
                  updates.coverBgOptions = [];
                  break;
          }
          
          return { ...p, ...updates, moduleTimestamps: timestamps };
      });
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
      const now = Date.now();

      // Use the selected model from state
      const modelToUse = textModel;

      if (nodeId === 'script') {
          const text = await gemini.generateText(prompt, modelToUse, customKey); 
          await saveProjectUpdate(p => ({ 
              ...p, 
              script: text, 
              status: p.status === ProjectStatus.DRAFT ? ProjectStatus.IN_PROGRESS : p.status,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
      } 
      else if (nodeId === 'summary') {
          const text = await gemini.generateText(prompt, modelToUse, customKey);
          await saveProjectUpdate(p => ({ 
              ...p, 
              summary: text,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
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
          }, customKey, modelToUse);
          await saveProjectUpdate(p => ({ 
              ...p, 
              titles: data,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
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
          }, customKey, modelToUse);
          await saveProjectUpdate(p => ({ 
              ...p, 
              coverOptions: data,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
      }
      else if (nodeId === 'cover_b') {
          const data = await gemini.generateJSON<CoverOption[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      visual: {type: "STRING"},
                      copy: {type: "STRING"},
                      score: {type: "NUMBER"}
                  }
              }
          }, customKey, modelToUse);
          await saveProjectUpdate(p => ({ 
              ...p, 
              coverOptionsB: data,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
      }
      else if (nodeId === 'cover_bg') {
          // Changed to generate JSON array with left/right prompts
          const data = await gemini.generateJSON<any[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      leftPrompt: {type: "STRING"},
                      rightPrompt: {type: "STRING"},
                      score: {type: "NUMBER"}
                  }
              }
          }, customKey, modelToUse);
          await saveProjectUpdate(p => ({ 
              ...p, 
              coverBgOptions: data,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
      }
      else if (nodeId === 'sb_text') {
          const data = await gemini.generateJSON<{original: string, description: string}[]>(prompt, {
              type: "ARRAY", items: {
                  type: "OBJECT", properties: {
                      original: {type: "STRING"},
                      description: {type: "STRING"}
                  }
              }
          }, customKey, modelToUse);
          
          // Map extracted JSON to StoryboardFrame structure
          const frames: StoryboardFrame[] = data.map((item, idx) => ({
              id: crypto.randomUUID(),
              sceneNumber: idx + 1,
              originalText: item.original,
              description: item.description,
              imagePrompt: item.description // Fix: Auto-fill imagePrompt with description
          }));
          await saveProjectUpdate(p => ({ 
              ...p, 
              storyboard: frames,
              moduleTimestamps: { ...p.moduleTimestamps, [nodeId]: now }
          }));
      }
  };

  const handleGenerate = async (nodeId: string) => {
    if (!project) return;
    if (generatingNodes.has(nodeId)) return;
    
    // Check dependencies
    if (['sb_text', 'titles', 'summary', 'cover', 'cover_b', 'cover_bg'].includes(nodeId) && !project.script) {
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

      // Identify missing targets
      const potentialTargets = ['titles', 'sb_text', 'summary', 'cover', 'cover_b', 'cover_bg'];
      const targets = potentialTargets.filter(id => {
          // Check if data exists for this node
          switch(id) {
              case 'titles': return !project.titles || project.titles.length === 0;
              case 'sb_text': return !project.storyboard || project.storyboard.length === 0;
              case 'summary': return !project.summary;
              case 'cover': return !project.coverOptions || project.coverOptions.length === 0;
              case 'cover_b': return !project.coverOptionsB || project.coverOptionsB.length === 0;
              case 'cover_bg': return (!project.coverBgOptions || project.coverBgOptions.length === 0) && !project.coverBgImageDescription;
              default: return false;
          }
      });

      if (targets.length === 0) {
          alert("检测到所有模块均已完成，无需再次生成。\n如需重新生成特定模块，请点击该模块上的“重新生成”按钮。");
          return;
      }
      
      setIsOneClickRunning(true);

      // Mark selected as generating
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
      try {
        await Promise.all(targets.map(id => processWithRetry(id)));
      } finally {
        if (mountedRef.current) setIsOneClickRunning(false);
      }
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
                 {/* Model Selector Button */}
                 <div className="relative">
                     <button
                        onClick={() => setShowModelMenu(!showModelMenu)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm h-10 border bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50`}
                        title="选择推理模型"
                     >
                        <Bot className="w-4 h-4 text-violet-600" />
                        <span className="hidden lg:inline">{textModel.includes('flash') ? 'Gemini Flash' : (textModel.includes('thinking') ? 'Flash Thinking' : 'Gemini Pro')}</span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                     </button>
                     
                     {showModelMenu && (
                         <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowModelMenu(false)} />
                            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 space-y-1">
                                    <button 
                                        onClick={() => handleModelSelect('gemini-2.5-flash-preview-09-2025')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between ${textModel === 'gemini-2.5-flash-preview-09-2025' ? 'bg-violet-50 text-violet-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                    >
                                        <span>Gemini 2.5 Flash</span>
                                        {textModel === 'gemini-2.5-flash-preview-09-2025' && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                    <button 
                                        onClick={() => handleModelSelect('gemini-2.5-flash-thinking-preview-0121')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between ${textModel === 'gemini-2.5-flash-thinking-preview-0121' ? 'bg-violet-50 text-violet-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                    >
                                        <span>Gemini 2.5 Thinking</span>
                                        {textModel === 'gemini-2.5-flash-thinking-preview-0121' && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                    <button 
                                        onClick={() => handleModelSelect('gemini-3-pro-preview')}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between ${textModel === 'gemini-3-pro-preview' ? 'bg-violet-50 text-violet-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                    >
                                        <span>Gemini 3.0 Pro</span>
                                        {textModel === 'gemini-3-pro-preview' && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                <div className="bg-slate-50 px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100">
                                    提示：Thinking/Pro 模型需要更长的生成时间。
                                </div>
                            </div>
                         </>
                     )}
                 </div>

                 {/* API Config Button */}
                 <button
                    onClick={() => setShowConfigModal(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm h-10 border ${customKey ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'}`}
                    title="配置自定义 API Key"
                 >
                    <Settings2 className="w-4 h-4" />
                    <span className="hidden lg:inline">API 配置</span>
                 </button>

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
                        title={!project.script ? "请先生成视频脚本" : "智能检测并生成剩余未完成的模块 (3-8号)"}
                    >
                        {isOneClickRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
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
                     const isResetable = ['titles', 'sb_text', 'summary', 'cover', 'cover_b', 'cover_bg'].includes(node.id);
                     
                     // Determine status of data
                     let hasData = false;
                     if (node.id === 'input') hasData = !!project.inputs.topic;
                     if (node.id === 'script') hasData = !!project.script;
                     if (node.id === 'sb_text') hasData = !!project.storyboard && project.storyboard.length > 0;
                     if (node.id === 'titles') hasData = !!project.titles && project.titles.length > 0;
                     if (node.id === 'summary') hasData = !!project.summary;
                     if (node.id === 'cover') hasData = !!project.coverOptions && project.coverOptions.length > 0;
                     if (node.id === 'cover_b') hasData = !!project.coverOptionsB && project.coverOptionsB.length > 0;
                     // cover_bg now supports structured options OR legacy string
                     if (node.id === 'cover_bg') hasData = (!!project.coverBgOptions && project.coverBgOptions.length > 0) || !!project.coverBgImageDescription;

                     // Get last timestamp
                     const lastTime = project.moduleTimestamps?.[node.id];

                     // Visual Feedback Logic for Titles, Storyboard, Summary, Cover
                     let bgClass = 'bg-white';
                     if (['titles', 'sb_text', 'summary', 'cover', 'cover_b', 'cover_bg'].includes(node.id)) {
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
                                {/* Timestamp Display */}
                                {lastTime && (
                                    <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
                                        <span className="text-[9px] font-mono text-slate-400 bg-white/50 backdrop-blur px-1.5 py-0.5 rounded border border-slate-100/50 shadow-sm flex items-center gap-1">
                                            <Clock className="w-2.5 h-2.5" />
                                            {formatTimestamp(lastTime)}
                                        </span>
                                    </div>
                                )}

                                {/* Header: Icon & Status */}
                                <div className="flex items-start justify-between mb-2 mt-1">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-${node.color}-100 text-${node.color}-600 flex items-center justify-center shadow-sm relative group-hover:scale-110 transition-transform`}>
                                            <node.icon className="w-5 h-5" />
                                            <div className="absolute -top-2 -left-2 w-5 h-5 bg-slate-800 text-white rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm">
                                                {node.step}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isResetable && hasData && !isArchived && (
                                             <button
                                                onClick={(e) => { e.stopPropagation(); handleReset(node.id); }}
                                                className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
                                                title="重置 (清空)"
                                            >
                                                <Eraser className="w-3.5 h-3.5" />
                                            </button>
                                        )}
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
                                </div>
                                
                                {/* Text Content */}
                                <div className="pr-2 mb-8">
                                    <h3 className="text-base font-bold text-slate-800 mb-1">{node.label}</h3>
                                    <p className="text-[10px] text-slate-400 font-medium leading-snug line-clamp-2">{node.description}</p>
                                    
                                    {/* ADD MODEL DISPLAY HERE */}
                                    {(node as any).model && (
                                        <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-[9px] font-mono text-slate-400">
                                            <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                                            {(node as any).model}
                                        </div>
                                    )}
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
                                <div className={`w-8 h-8 rounded-lg bg-${node?.color}-100 text-${node?.color}-600 flex items-center justify-center relative`}>
                                    {node?.icon && <node.icon className="w-4 h-4" />}
                                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-slate-800 text-white rounded-full flex items-center justify-center text-[9px] font-bold border border-white">
                                        {node?.step}
                                    </div>
                                </div>
                                <h3 className="font-bold text-slate-800 text-base">{node?.panelTitle}</h3>
                                {node?.id === 'script' && (
                                    <a 
                                        href="https://app.heygen.com/home" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (project?.script) {
                                                navigator.clipboard.writeText(project.script);
                                            }
                                            window.open("https://app.heygen.com/home", "_blank");
                                        }}
                                        className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-600 hover:bg-violet-100 hover:text-violet-700 border border-violet-200 rounded-lg text-xs font-bold transition-colors"
                                        title="复制脚本并打开 HeyGen"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        HeyGen
                                    </a>
                                )}
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
                        onSave={(val) => saveProjectUpdate(p => ({ 
                            ...p, 
                            script: val, 
                            status: p.status === ProjectStatus.DRAFT ? ProjectStatus.IN_PROGRESS : p.status,
                            moduleTimestamps: { ...p.moduleTimestamps, script: Date.now() }
                        }))}
                        showStats={true}
                        readOnly={isArchived}
                    />
                 )}

                 {selectedNodeId === 'summary' && (
                    <TextResultBox 
                        content={project.summary || ''} 
                        title="简介与标签" 
                        onSave={(val) => saveProjectUpdate(p => ({ 
                            ...p, 
                            summary: val,
                            moduleTimestamps: { ...p.moduleTimestamps, summary: Date.now() }
                        }))}
                        readOnly={isArchived}
                    />
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

                 {(selectedNodeId === 'cover' || selectedNodeId === 'cover_b') && (
                     <div className="space-y-6">
                        {/* Determine which data to show based on node ID */}
                        {(() => {
                            const data = selectedNodeId === 'cover' ? project.coverOptions : project.coverOptionsB;
                            
                            return data && data.length > 0 ? (
                                <div className="space-y-4">
                                    {data.map((opt, i) => (
                                        <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-center mb-4 border-b border-slate-50 pb-3">
                                                <span className={`${selectedNodeId === 'cover' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-orange-50 text-orange-600 border-orange-100'} text-xs font-bold px-2.5 py-1 rounded-lg border`}>方案 {i+1}</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">推荐指数</span>
                                                    <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-orange-600 italic tracking-tighter">
                                                        {formatScore(opt.score)}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            {/* Visual Section - Label removed */}
                                            <div className="mb-4">
                                                <p className="text-xs text-slate-600 leading-relaxed">{opt.visual}</p>
                                            </div>

                                            {/* Copy Section */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">封面文字</p>
                                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 relative group">
                                                    <div className="text-sm font-bold text-slate-800 leading-relaxed text-center font-serif">
                                                        {/* Split by Chinese/English semicolon, newline, or pipe */}
                                                        {(opt.copy || '').split(/[:;；\n|]+/).filter(Boolean).map((line, lIdx) => (
                                                            <div key={lIdx} className="py-0.5">{line.trim()}</div>
                                                        ))}
                                                    </div>
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <RowCopyButton text={(opt.copy || '').replace(/[:;；|]+/g, '\n')} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                 <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                                    <p>暂无方案，点击生成按钮开始策划。</p>
                                </div>
                            );
                        })()}
                     </div>
                 )}

                 {selectedNodeId === 'cover_bg' && (
                     <div className="h-full flex flex-col">
                        {/* Calculate normalized data on the fly before rendering table */}
                        {(() => {
                            const rawData = project.coverBgOptions || (project.coverBgImageDescription ? [{ leftPrompt: project.coverBgImageDescription, rightPrompt: '', score: 0 }] : []);
                            const tableData = normalizeBgOptions(rawData);

                            return (
                                <TableResultBox 
                                    headers={['序号', '左画面提示词', '右画面提示词', '操作']}
                                    data={tableData}
                                    renderRow={(item: any, i: number) => {
                                        // Clean potential leftover label if regex missed edge case
                                        const cleanLeft = item.leftPrompt?.replace(/^(?:左画面(?:提示词)?|Left Prompt)[:：]\s*/i, '') || '';
                                        const cleanRight = item.rightPrompt?.replace(/^(?:右画面(?:提示词)?|Right Prompt)[:：]\s*/i, '') || '';

                                        return (
                                            <tr key={i} className="hover:bg-slate-50 group">
                                                <td className="py-3 px-4 text-center text-xs font-bold text-slate-400 w-[5%] align-top pt-4">{i + 1}</td>
                                                <td className="py-3 px-2 w-[40%] align-top">
                                                    <div className="text-[10px] text-slate-600 leading-relaxed font-mono bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap">
                                                        <span className="font-bold text-slate-400 block mb-1 text-[9px] uppercase tracking-wider">Left</span>
                                                        {cleanLeft || '-'}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2 w-[40%] align-top">
                                                    <div className="text-[10px] text-slate-600 leading-relaxed font-mono bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap">
                                                        <span className="font-bold text-slate-400 block mb-1 text-[9px] uppercase tracking-wider">Right</span>
                                                        {cleanRight || '-'}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right w-[15%] align-top pt-4">
                                                    <div className="flex flex-col gap-2 items-end">
                                                        <div className="flex items-center gap-2" title="复制左画面提示词">
                                                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Left</span>
                                                            <RowCopyButton text={cleanLeft} />
                                                        </div>
                                                        <div className="flex items-center gap-2" title="复制右画面提示词">
                                                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Right</span>
                                                            <RowCopyButton text={cleanRight} />
                                                        </div>
                                                        <a 
                                                            href="https://gemini.google.com/" 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="mt-1 flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-bold transition-colors"
                                                            title="前往 Gemini 官网进行生图"
                                                        >
                                                            <ExternalLink className="w-3 h-3" /> 去生图
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }}
                                />
                            );
                        })()}
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
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSwapContent}
                                    className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all flex items-center gap-2 text-xs shadow-sm"
                                    title="对调原文和画面描述"
                                >
                                    <ArrowLeftRight className="w-3.5 h-3.5" /> 调换
                                </button>
                                <button
                                    onClick={() => navigate(`/project/${project.id}/images`)}
                                    className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20 text-xs"
                                >
                                    前往工坊 <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
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

export default ProjectWorkspace;
