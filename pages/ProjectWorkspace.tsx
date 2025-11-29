
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, StoryboardFrame, ProjectStatus, PromptTemplate, TitleItem, CoverOption } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { 
  Save, 
  Loader2, 
  FileText, 
  Image as ImageIcon, 
  Type, 
  ListEnd,
  Wand2,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Play,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  MoreHorizontal,
  ZoomIn,
  Check,
  Copy,
  ClipboardCheck,
  MousePointer2,
  Sparkles,
  ArrowLeft,
  ClipboardPaste,
  Images,
  Lock,
  Hand,
  Search,
  AlertCircle
} from 'lucide-react';

// --- Canvas & Layout Types ---

interface NodePosition {
  x: number;
  y: number;
}

interface WorkflowNodeConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  position: NodePosition;
  description: string;
  color: string; // Tailwind color class suffix
}

// Layout Configuration for the Canvas
const NODE_WIDTH = 260;
const NODE_HEIGHT = 110;

const NODES_CONFIG: WorkflowNodeConfig[] = [
  { id: 'input', label: '项目输入', icon: Settings2, position: { x: 50, y: 300 }, description: '主题与核心观点', color: 'slate' },
  { id: 'script', label: '视频文案', icon: FileText, position: { x: 400, y: 300 }, description: 'Gemini 脚本生成', color: 'violet' },
  // Parallel Branches
  { id: 'titles', label: '视频标题', icon: Type, position: { x: 800, y: 100 }, description: '10个爆款标题', color: 'blue' },
  { id: 'summary', label: '视频简介', icon: ListEnd, position: { x: 800, y: 250 }, description: 'SEO 摘要与标签', color: 'emerald' },
  { id: 'sb_text', label: '分镜设计', icon: ImageIcon, position: { x: 800, y: 400 }, description: '画面拆解与绘图', color: 'fuchsia' },
  { id: 'image_gen', label: '去生成图片', icon: Images, position: { x: 1200, y: 400 }, description: '批量生成分镜图', color: 'pink' },
  { id: 'cover', label: '封面文字', icon: Type, position: { x: 800, y: 550 }, description: '封面视觉与文案策划', color: 'rose' },
];

const CONNECTIONS = [
  { from: 'input', to: 'script' },
  { from: 'script', to: 'titles' },
  { from: 'script', to: 'summary' },
  { from: 'script', to: 'sb_text' },
  { from: 'sb_text', to: 'image_gen' },
  { from: 'script', to: 'cover' },
];

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // UI State
  const [showSettings, setShowSettings] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Initial Setup Modal State
  const [showInitModal, setShowInitModal] = useState(false);
  const [initFormData, setInitFormData] = useState({ topic: '', corePoint: '' });
  
  // Canvas State
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>(() => {
    const pos: Record<string, NodePosition> = {};
    NODES_CONFIG.forEach(n => pos[n.id] = n.position);
    return pos;
  });
  
  // Canvas Panning, Dragging & Zoom State
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // Processing State
  const [saving, setSaving] = useState(false);
  const [generatingNodes, setGeneratingNodes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load project and prompts
  useEffect(() => {
    const init = async () => {
        if (id) {
            try {
              const p = await storage.getProject(id);
              if (p) {
                  setProject(p);
                  if (!p.inputs.topic) {
                      setShowInitModal(true);
                      setInitFormData({ topic: '', corePoint: '' });
                  } else {
                      setShowInitModal(false);
                  }
              } else {
                  navigate('/');
              }
            } catch (e) {
              console.error("Failed to load project", e);
              setError("加载项目失败，请返回列表重试");
            }
        }
        try {
          const loadedPrompts = await storage.getPrompts();
          setPrompts(loadedPrompts);
        } catch (e) {
          console.error("Failed to load prompts", e);
        }
    };
    init();
  }, [id, navigate]);

  // Keyboard Listeners for Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        // Prevent default scrolling unless typing in an input
        if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
            e.preventDefault();
            setIsSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const saveWork = async (updatedProject: ProjectData) => {
    setSaving(true);
    // Optimistic Update
    setProject(updatedProject);
    if (updatedProject.inputs.topic) {
        setShowInitModal(false);
    }
    
    // API Call
    await storage.saveProject(updatedProject);
    setSaving(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!project) return;
    setProject({
        ...project,
        inputs: {
            ...project.inputs,
            [e.target.name]: e.target.value
        }
    });
  };

  const handleInitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    
    if (!initFormData.topic.trim()) return;

    const content = initFormData.topic; 

    const updatedProject = {
        ...project,
        title: content.length > 20 ? content.substring(0, 20) + '...' : content, 
        inputs: {
            ...project.inputs,
            topic: content,
            corePoint: content 
        }
    };
    saveWork(updatedProject);
  };

  const handleInitPaste = async () => {
    if (!navigator.clipboard) {
      alert("浏览器不支持自动粘贴，请手动使用 Ctrl+V");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInitFormData(prev => ({ ...prev, topic: text }));
      }
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  const interpolatePrompt = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  // --- Dependency Check ---
  const isNodeDisabled = (nodeId: string) => {
    if (!project) return true;
    
    const scriptDependents = ['titles', 'summary', 'sb_text', 'cover'];
    if (scriptDependents.includes(nodeId)) {
        return !project.script || project.script.trim() === '';
    }

    if (nodeId === 'image_gen') {
        return !project.storyboard || project.storyboard.length === 0;
    }

    return false;
  };

  // --- Generation Logic (Concurrent) ---
  const setNodeLoading = (nodeId: string, isLoading: boolean) => {
    setGeneratingNodes(prev => {
        const next = new Set(prev);
        if (isLoading) {
            next.add(nodeId);
        } else {
            next.delete(nodeId);
        }
        return next;
    });
  };

  const handleGenerateScript = async () => {
    if (!project) return;
    
    if (!prompts.SCRIPT) {
        setError("提示词模版未加载，请刷新页面。");
        return;
    }

    setNodeLoading('script', true);
    setError(null);
    try {
      const promptText = interpolatePrompt(prompts.SCRIPT.template, { ...project.inputs });
      const script = await gemini.generateText(promptText);
      
      const updated = { ...project, script, status: ProjectStatus.IN_PROGRESS };
      await saveWork(updated);
    } catch (e: any) {
      console.error("Generate Script Error:", e);
      setError(`生成脚本失败: ${e.message || '未知错误'}`);
    } finally {
      setNodeLoading('script', false);
    }
  };

  const handleGenerateStoryboardText = async () => {
    if (!project || !project.script) return;
    
    if (!prompts.STORYBOARD_TEXT) {
        setError("提示词模版错误。");
        return;
    }

    setNodeLoading('sb_text', true);
    setError(null);
    try {
      const promptText = interpolatePrompt(prompts.STORYBOARD_TEXT.template, { script: project.script });
      const framesData = await gemini.generateJSON<{description: string}[]>(promptText, {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { description: { type: "STRING" } }
        }
      });
      
      const newFrames: StoryboardFrame[] = framesData.map((f, i) => ({
        id: crypto.randomUUID(),
        sceneNumber: i + 1,
        description: f.description,
        imagePrompt: interpolatePrompt(prompts.IMAGE_GEN?.template || '', { description: f.description })
      }));

      const updated = { ...project, storyboard: newFrames };
      await saveWork(updated);
    } catch (e: any) {
      console.error("Generate Storyboard Error:", e);
      setError(`生成分镜失败: ${e.message}`);
    } finally {
      setNodeLoading('sb_text', false);
    }
  };

  const handleGenerateTitles = async () => {
    if (!project || !project.script) return;
    
    if (!prompts.TITLES) {
        setError("提示词模版错误。");
        return;
    }

    setNodeLoading('titles', true);
    setError(null);
    try {
      const promptText = interpolatePrompt(prompts.TITLES.template, { 
          ...project.inputs,
          script: project.script 
      });
      
      // Use generateJSON to get structured output
      const titles = await gemini.generateJSON<TitleItem[]>(promptText, {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING" },
                type: { type: "STRING" }
            }
        }
      });
      
      const updated = { ...project, titles: titles };
      await saveWork(updated);
    } catch (e: any) {
      setError(`生成标题失败: ${e.message}`);
    } finally {
      setNodeLoading('titles', false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!project || !project.script) return;
    
    if (!prompts.SUMMARY) {
      setError("提示词模版错误。");
      return;
    }

    setNodeLoading('summary', true);
    setError(null);
    try {
      const promptText = interpolatePrompt(prompts.SUMMARY.template, { script: project.script });
      const summary = await gemini.generateText(promptText);
      
      const updated = { ...project, summary };
      await saveWork(updated);
    } catch (e: any) {
      setError(`生成总结失败: ${e.message}`);
    } finally {
      setNodeLoading('summary', false);
    }
  };

  const handleGenerateCover = async () => {
    if (!project || !project.script) return;
    
    if (!prompts.COVER_GEN) {
      setError("提示词模版错误。");
      return;
    }

    setNodeLoading('cover', true);
    setError(null);
    try {
      const promptText = interpolatePrompt(prompts.COVER_GEN.template, { 
          ...project.inputs,
          script: project.script
      });
      
      // Use generateJSON for structured cover options
      const coverOptions = await gemini.generateJSON<CoverOption[]>(promptText, {
          type: "ARRAY",
          items: {
              type: "OBJECT",
              properties: {
                  visual: { type: "STRING" },
                  copy: { type: "STRING" }
              }
          }
      });
      
      const updated = { 
        ...project, 
        coverOptions: coverOptions, 
        status: ProjectStatus.COMPLETED 
      };
      await saveWork(updated);
    } catch (e: any) {
      setError(`生成封面方案失败: ${e.message}`);
    } finally {
      setNodeLoading('cover', false);
    }
  };

  // --- Canvas Interaction ---

  const handleNodeRun = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    
    if (isNodeDisabled(nodeId)) {
        return; // Don't trigger if disabled (UI should also reflect this)
    }

    if (nodeId === 'image_gen') {
        if (project?.id) {
            navigate(`/project/${project.id}/images`);
        }
        return;
    }

    if (generatingNodes.has(nodeId)) return;

    switch (nodeId) {
      case 'script': handleGenerateScript(); break;
      case 'sb_text': handleGenerateStoryboardText(); break;
      case 'titles': handleGenerateTitles(); break;
      case 'summary': handleGenerateSummary(); break;
      case 'cover': handleGenerateCover(); break;
      default: break;
    }
  };

  // Mouse Handlers for Canvas & Nodes
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Middle mouse or Space+Left triggers pan
    if (isSpacePressed || e.button === 1) {
      setIsPanning(true);
    }
  };

  // Handle clicking the background to deselect nodes
  const handleCanvasClick = (e: React.MouseEvent) => {
     if (!isPanning && !draggingId) {
         setSelectedNodeId(null);
     }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isSpacePressed) {
        // Zoom Logic
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel(prev => {
            const next = prev + delta;
            return Math.min(Math.max(next, 0.2), 3); // Limit between 0.2x and 3.0x
        });
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (isSpacePressed) {
       // If space is pressed, we want to PAN, not drag the node.
       // We allow the event to bubble to the container which handles panning.
       return; 
    }
    e.stopPropagation(); // Stop bubbling so we don't pan
    setDraggingId(nodeId);
  };

  // Handle clicking a node to select it
  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation(); // Stop bubbling to canvas click (which deselects)
    const disabled = isNodeDisabled(nodeId);
    if (disabled) {
        alert("请先完成前置步骤（如生成视频文案）后再操作此模块。");
        return;
    }
    if (!draggingId) {
        setSelectedNodeId(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
        setCanvasOffset(prev => ({
            x: prev.x + e.movementX,
            y: prev.y + e.movementY
        }));
    } else if (draggingId) {
        // Divide movement by zoomLevel to keep dragging in sync with cursor
        setNodePositions(prev => ({
            ...prev,
            [draggingId]: {
                x: prev[draggingId].x + (e.movementX / zoomLevel),
                y: prev[draggingId].y + (e.movementY / zoomLevel)
            }
        }));
    }
  };

  const handleMouseUp = () => {
    setDraggingId(null);
    setIsPanning(false);
  };

  // --- Canvas Rendering Helpers ---

  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const cp1x = x1 + (x2 - x1) / 2;
    const cp1y = y1;
    const cp2x = x1 + (x2 - x1) / 2;
    const cp2y = y2;
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  };

  const getBezierPoint = (t: number, x1: number, y1: number, x2: number, y2: number) => {
    // Control points for the same curve as getBezierPath
    const cp1x = x1 + (x2 - x1) / 2;
    const cp1y = y1;
    const cp2x = x1 + (x2 - x1) / 2;
    const cp2y = y2;

    // Cubic Bezier formula: B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
    const oneMinusT = 1 - t;
    const x = Math.pow(oneMinusT, 3) * x1 +
              3 * Math.pow(oneMinusT, 2) * t * cp1x +
              3 * oneMinusT * Math.pow(t, 2) * cp2x +
              Math.pow(t, 3) * x2;

    const y = Math.pow(oneMinusT, 3) * y1 +
              3 * Math.pow(oneMinusT, 2) * t * cp1y +
              3 * oneMinusT * Math.pow(t, 2) * cp2y +
              Math.pow(t, 3) * y2;

    // Tangent calculation for rotation
    // B'(t) = 3(1-t)^2(P1-P0) + 6(1-t)t(P2-P1) + 3t^2(P3-P2)
    const dx = 3 * Math.pow(oneMinusT, 2) * (cp1x - x1) +
               6 * oneMinusT * t * (cp2x - cp1x) +
               3 * Math.pow(t, 2) * (x2 - cp2x);
    const dy = 3 * Math.pow(oneMinusT, 2) * (cp1y - y1) +
               6 * oneMinusT * t * (cp2y - cp1y) +
               3 * Math.pow(t, 2) * (y2 - cp2y);
    
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x, y, angle };
  };

  const getNodeStatus = (nodeId: string) => {
    if (!project) return 'pending';
    switch (nodeId) {
      case 'input': return project.inputs.topic ? 'completed' : 'pending';
      case 'script': return project.script ? 'completed' : 'pending';
      case 'titles': return (project.titles?.length || 0) > 0 ? 'completed' : 'pending';
      case 'summary': return project.summary ? 'completed' : 'pending';
      case 'sb_text': return project.storyboard?.length ? 'completed' : 'pending';
      case 'cover': return (project.coverOptions?.length || 0) > 0 || !!project.coverText ? 'completed' : 'pending';
      case 'image_gen': return project.storyboard?.some(f => !!f.imageUrl) ? 'completed' : 'pending';
      default: return 'pending';
    }
  };

  // --- UI Components ---
  
  const TextResultBox = ({ content, title = "文本库", copyLabel = "复制结果" }: { content: string, title?: string, copyLabel?: string }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-50/50 border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full max-h-[400px]">
            <div className="bg-white/80 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 tracking-wider">
                    <FileText className="w-3.5 h-3.5" /> {title}
                </span>
                <button 
                    onClick={handleCopy}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all font-medium ${
                        copied 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-white hover:text-violet-600 hover:border-violet-200 hover:shadow-sm'
                    }`}
                >
                    {copied ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '已复制' : copyLabel}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-white">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-loose selection:bg-violet-100">
                    {content || <span className="text-slate-300 italic">暂无内容...</span>}
                </pre>
            </div>
        </div>
    );
  };

  // Table Component for Structured Data
  const TableResultBox = ({ 
    headers, 
    data, 
    renderRow 
  }: { 
    headers: string[], 
    data: any[], 
    renderRow: (item: any, index: number) => React.ReactNode 
  }) => {
      if (!data || data.length === 0) {
          return (
             <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                 <p>点击上方按钮生成内容</p>
             </div>
          );
      }

      return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            {headers.map((h, i) => (
                                <th key={i} className="py-3 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {data.map((item, index) => renderRow(item, index))}
                    </tbody>
                </table>
            </div>
        </div>
      );
  };

  if (!project) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-violet-500 w-8 h-8" /></div>;

  return (
    <div className="flex h-full bg-[#F8F9FC] overflow-hidden relative font-sans select-none">
      
      {/* Error Alert Banner */}
      {error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-down w-auto max-w-lg">
          <div className="bg-rose-50 border border-rose-100 text-rose-700 px-6 py-4 rounded-xl shadow-xl flex items-center gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
             <p className="text-sm font-bold">{error}</p>
             <button onClick={() => setError(null)} className="ml-4 p-1 hover:bg-rose-100 rounded-full transition-colors">
                <X className="w-4 h-4" />
             </button>
          </div>
        </div>
      )}

      {/* Initial Project Setup Modal */}
      {showInitModal && (
        <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-3xl shadow-2xl shadow-indigo-500/20 border border-white/50 w-full max-w-xl p-10 transform transition-all scale-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500"></div>
              
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner text-violet-600">
                    <Sparkles className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 mb-2">开启新项目</h1>
                <p className="text-slate-500 font-medium">请告诉我您想制作什么内容的视频？</p>
              </div>

              <form onSubmit={handleInitSubmit} className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2.5">
                    <label className="block text-sm font-bold text-slate-700">视频主题 / 核心观点</label>
                    <button 
                        type="button" 
                        onClick={handleInitPaste}
                        className="text-xs flex items-center gap-1 text-violet-600 hover:text-violet-700 font-bold bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-md transition-colors"
                    >
                        <ClipboardPaste className="w-3 h-3" /> 粘贴内容
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    required
                    value={initFormData.topic}
                    onChange={(e) => setInitFormData({...initFormData, topic: e.target.value})}
                    rows={6}
                    placeholder="例如：2025年人工智能的未来。核心观点是AI将极大提高生产力，但也带来伦理挑战..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-slate-900 text-lg focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 outline-none transition-all placeholder:text-slate-400 font-medium shadow-sm resize-none leading-relaxed"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                    <button 
                        type="button" 
                        onClick={async () => {
                            if (project.id) await storage.deleteProject(project.id);
                            navigate('/');
                        }}
                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        type="submit"
                        disabled={!initFormData.topic.trim()}
                        className="flex-[2] py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        开始创作 <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
              </form>
           </div>
        </div>
      )}

      {/* Left Panel: Settings */}
      <div className={`${showSettings ? 'w-64 translate-x-0 opacity-100' : 'w-0 -translate-x-full opacity-0'} transition-all duration-300 ease-out border-r border-slate-200 bg-white/90 backdrop-blur-xl flex flex-col h-full flex-shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm tracking-wide">
                <Settings2 className="w-4 h-4 text-violet-600" /> 项目概览
            </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-7">
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">项目名称</label>
                <input 
                    name="title"
                    value={project.title}
                    onChange={(e) => setProject({...project, title: e.target.value})}
                    className="w-full text-base border-b border-slate-200 py-2 focus:border-violet-500 outline-none bg-transparent font-semibold text-slate-800 transition-colors" 
                />
            </div>

             <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-4 rounded-xl border border-violet-100 text-xs text-violet-700 leading-relaxed shadow-sm">
                <strong className="block mb-1 font-semibold text-violet-800">操作提示</strong>
                按住 <code>空格键</code>:<br/>
                • 左键拖动平移画布<br/>
                • 滚轮缩放画布
            </div>

            <div className="pt-4 mt-auto">
                <button 
                    onClick={() => saveWork(project)}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl text-sm hover:bg-slate-50 hover:text-violet-700 hover:border-violet-200 transition-all font-medium shadow-sm"
                >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                    保存设置
                </button>
            </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        className={`flex-1 h-full overflow-hidden relative bg-[#F8F9FC] ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-default'}`}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* UI Overlay Buttons */}
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className="absolute left-6 top-6 z-30 p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-violet-600 shadow-sm transition-all hover:scale-105 hover:shadow-md"
        >
            {showSettings ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
        </button>

        <button 
            onClick={() => saveWork(project)}
            className="absolute right-6 top-6 z-30 px-5 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl hover:shadow-lg hover:shadow-slate-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-2 font-medium text-sm backdrop-blur-md"
        >
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            保存进度
        </button>

        {/* Spacebar/Zoom Indicator */}
        {isSpacePressed && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/80 backdrop-blur text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-fade-in-up pointer-events-none">
                <Hand className="w-4 h-4" /> 拖动 / 滚轮缩放
            </div>
        )}

        {/* Zoom Level Indicator */}
        <div className="absolute bottom-6 left-6 z-30 bg-white/80 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 shadow-sm pointer-events-none">
            {Math.round(zoomLevel * 100)}%
        </div>

        {/* Transformable Canvas Layer */}
        <div 
            className="absolute inset-0 w-full h-full origin-top-left will-change-transform"
            style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoomLevel})` }}
        >
             {/* Infinite Grid Background (Moves with canvas) */}
            <div 
                className="absolute -inset-[5000px] opacity-[0.6]" 
                style={{ 
                    backgroundImage: 'radial-gradient(#e0e7ff 1.5px, transparent 1.5px)', 
                    backgroundSize: '24px 24px',
                }}
            ></div>

            {/* Nodes & Edges Container */}
            <div className="w-full h-full relative">
                <svg className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] pointer-events-none z-0 drop-shadow-sm overflow-visible">
                    <defs>
                        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                            <path d="M0,0 L6,3 L0,6 L0,0" fill="#cbd5e1" />
                        </marker>
                    </defs>
                    {CONNECTIONS.map((conn, idx) => {
                        const fromPos = nodePositions[conn.from];
                        const toPos = nodePositions[conn.to];
                        if (!fromPos || !toPos) return null;

                        // Adjust coordinates based on the massive SVG offset
                        const offset = 5000;
                        const startX = fromPos.x + NODE_WIDTH + offset;
                        const startY = fromPos.y + NODE_HEIGHT / 2 + offset;
                        const endX = toPos.x + offset;
                        const endY = toPos.y + NODE_HEIGHT / 2 + offset;
                        
                        const toNodeStatus = getNodeStatus(conn.to);
                        const isCompletedPath = toNodeStatus === 'completed';
                        
                        // Calculate middle point and angle for arrow
                        const midInfo = getBezierPoint(0.5, startX, startY, endX, endY);

                        return (
                            <g key={idx}>
                                <path 
                                    d={getBezierPath(startX, startY, endX, endY)}
                                    fill="none"
                                    stroke={isCompletedPath ? '#10b981' : '#cbd5e1'}
                                    strokeWidth={isCompletedPath ? '3' : '2'}
                                    className="transition-all duration-700 ease-out" 
                                    style={{ strokeOpacity: isCompletedPath ? 0.8 : 0.4 }}
                                />
                                {/* Arrow at midpoint */}
                                <path 
                                    d="M -4,-4 L 4,0 L -4,4" 
                                    fill="none"
                                    stroke={isCompletedPath ? '#10b981' : '#cbd5e1'}
                                    strokeWidth="2"
                                    transform={`translate(${midInfo.x}, ${midInfo.y}) rotate(${midInfo.angle})`}
                                />
                            </g>
                        );
                    })}
                </svg>

                {NODES_CONFIG.map((node) => {
                    const pos = nodePositions[node.id];
                    const status = getNodeStatus(node.id);
                    const isSelected = selectedNodeId === node.id;
                    const isRunning = generatingNodes.has(node.id);
                    const hasAction = node.id !== 'input';
                    const disabled = isNodeDisabled(node.id);
                    
                    const colorMap: Record<string, string> = {
                    violet: 'from-violet-500 to-indigo-500 shadow-violet-500/20',
                    blue: 'from-blue-500 to-cyan-500 shadow-blue-500/20',
                    emerald: 'from-emerald-500 to-teal-500 shadow-emerald-500/20',
                    rose: 'from-rose-500 to-pink-500 shadow-rose-500/20',
                    fuchsia: 'from-fuchsia-500 to-purple-500 shadow-fuchsia-500/20',
                    pink: 'from-pink-500 to-rose-500 shadow-pink-500/20',
                    slate: 'from-slate-700 to-slate-900 shadow-slate-500/20',
                    };

                    const gradientClass = colorMap[node.color] || colorMap.slate;

                    return (
                        <div
                            key={node.id}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onClick={(e) => handleNodeClick(e, node.id)}
                            className={`absolute flex flex-col bg-white rounded-2xl transition-all duration-300 group overflow-hidden select-none
                                ${status === 'completed' 
                                    ? 'border-emerald-500 border-2 shadow-lg shadow-emerald-500/10' 
                                    : isSelected 
                                        ? 'border-violet-500 ring-4 ring-violet-500/10 shadow-xl border' 
                                        : 'border-slate-100 hover:border-violet-200 border shadow-md hover:shadow-xl hover:shadow-indigo-500/5'}
                                ${draggingId === node.id ? 'z-50 shadow-2xl scale-[1.03] ring-0' : 'z-10'}
                                ${disabled ? 'opacity-60 grayscale cursor-not-allowed hover:shadow-none hover:border-slate-100' : ''}
                                ${isSpacePressed ? 'cursor-grab' : disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
                            `}
                            style={{
                                left: pos.x,
                                top: pos.y,
                                width: NODE_WIDTH,
                                height: NODE_HEIGHT,
                                transition: draggingId === node.id ? 'none' : 'box-shadow 0.3s, transform 0.2s, border-color 0.2s'
                            }}
                        >
                            <div className="p-4 flex-1 flex flex-col justify-between relative z-10">
                                <div className="flex items-start justify-between">
                                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradientClass} text-white shadow-lg`}>
                                        <node.icon className="w-5 h-5" />
                                    </div>
                                    
                                    {hasAction && (
                                        <button 
                                            onClick={(e) => handleNodeRun(e, node.id)}
                                            onMouseDown={(e) => e.stopPropagation()} 
                                            disabled={isRunning || disabled}
                                            className={`p-2 rounded-full transition-all shadow-sm flex items-center justify-center border
                                                ${disabled
                                                    ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                    : status === 'completed' 
                                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100 cursor-pointer' 
                                                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-violet-600 hover:text-white hover:border-violet-600 hover:shadow-md cursor-pointer'}
                                            `}
                                            title={disabled ? "请先完成前置任务" : "执行任务"}
                                        >
                                            {isRunning ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                                            ) : disabled ? (
                                                <Lock className="w-4 h-4" />
                                            ) : status === 'completed' ? (
                                                <Check className="w-4 h-4" />
                                            ) : (
                                                node.id === 'image_gen' ? <ArrowRight className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                                
                                <div>
                                    <h3 className={`font-bold text-sm tracking-tight ${status === 'completed' ? 'text-emerald-700' : 'text-slate-800'}`}>{node.label}</h3>
                                    <p className="text-[11px] font-medium text-slate-400 line-clamp-1 mt-0.5">{node.description}</p>
                                </div>
                            </div>

                            {isRunning && (
                                <div className="h-1 w-full bg-violet-100 absolute bottom-0 left-0">
                                    <div className="h-full bg-violet-600 animate-progress-indeterminate shadow-[0_0_10px_rgba(124,58,237,0.5)]"></div>
                                </div>
                            )}
                            
                            {!isRunning && !disabled && (
                                <div className="h-1 w-full bg-slate-50/50">
                                    <div className={`h-full transition-all duration-700 ease-in-out ${status === 'completed' ? 'bg-emerald-400 w-full' : 'bg-transparent w-0'}`} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

      </div>

      {/* Detail Drawer (Right Side Overlay) */}
      <div className={`absolute top-0 right-0 bottom-0 w-full md:w-[640px] bg-white/95 backdrop-blur-xl shadow-2xl z-40 transform transition-transform duration-300 ease-in-out border-l border-slate-200 flex flex-col ${selectedNodeId ? 'translate-x-0' : 'translate-x-full'}`}>
         {selectedNodeId && (
             <>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${NODES_CONFIG.find(n => n.id === selectedNodeId)?.color === 'violet' ? 'from-violet-500 to-indigo-500' : 'from-slate-700 to-slate-900'} text-white shadow-md`}>
                            {React.createElement(NODES_CONFIG.find(n => n.id === selectedNodeId)?.icon || Settings2, { className: "w-5 h-5" })}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{NODES_CONFIG.find(n => n.id === selectedNodeId)?.label}</h2>
                            <p className="text-xs font-medium text-slate-400">详细编辑器</p>
                        </div>
                    </div>
                    <button onClick={() => setSelectedNodeId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-[#F8F9FC]">
                    
                    {/* INPUT NODE - EDITABLE */}
                    {selectedNodeId === 'input' && (
                        <div className="space-y-8">
                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                 <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                                        <Sparkles className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">核心创作意图</h3>
                                        <p className="text-xs text-slate-500">AI 将根据此信息构建整个视频</p>
                                    </div>
                                 </div>

                                 <div className="space-y-6">
                                    <div>
                                      <label className="block text-sm font-bold text-slate-700 mb-2">视频主题</label>
                                      <input
                                        name="topic"
                                        value={project.inputs.topic}
                                        onChange={handleInputChange}
                                        placeholder="例如：2025年人工智能发展趋势"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-sm font-bold text-slate-700 mb-2">核心观点 / 角度</label>
                                      <textarea
                                        name="corePoint"
                                        value={project.inputs.corePoint}
                                        onChange={handleInputChange}
                                        rows={5}
                                        placeholder="主要的论点、受众痛点或独特的叙事角度..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all resize-none placeholder:text-slate-400 font-medium"
                                      />
                                    </div>
                                 </div>
                             </div>

                             <div className="flex justify-end">
                                 <button onClick={() => {saveWork(project); setSelectedNodeId(null);}} className="bg-slate-900 text-white px-8 py-3 rounded-xl hover:bg-slate-800 font-bold shadow-lg shadow-slate-900/20 transition-all hover:-translate-y-0.5">
                                    确认并保存
                                 </button>
                             </div>
                        </div>
                    )}

                    {/* SCRIPT EDITOR */}
                    {selectedNodeId === 'script' && (
                        <div className="space-y-5 h-full flex flex-col">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">生成内容</span>
                                <button onClick={handleGenerateScript} disabled={generatingNodes.has('script')} className="text-xs px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all flex items-center gap-2 font-semibold">
                                    {generatingNodes.has('script') ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Wand2 className="w-3.5 h-3.5"/>}
                                    {project.script ? '重新生成' : '智能生成'}
                                </button>
                            </div>
                            <textarea
                                value={project.script || ''}
                                onChange={(e) => setProject({ ...project, script: e.target.value })}
                                className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-6 text-slate-700 leading-8 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-200 resize-none font-sans text-base shadow-sm selection:bg-violet-100"
                                placeholder="点击上方按钮生成脚本..."
                            />
                        </div>
                    )}

                    {/* STORYBOARD */}
                    {selectedNodeId === 'sb_text' && (
                        <div className="space-y-8">
                            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                <div>
                                    <h4 className="font-bold text-slate-900 text-lg">分镜列表</h4>
                                    <p className="text-xs font-medium text-slate-500 mt-1">{project.storyboard?.length || 0} 个关键场景</p>
                                </div>
                                <div className="flex gap-3">
                                     <button onClick={handleGenerateStoryboardText} disabled={generatingNodes.has('sb_text')} className="px-4 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-white hover:border-slate-300 transition-colors flex items-center gap-1.5">
                                        <ListEnd className="w-3.5 h-3.5"/> 重置文案
                                    </button>
                                </div>
                            </div>

                            {/* Text Library for Storyboard */}
                            <TextResultBox 
                                title="分镜文案汇总" 
                                copyLabel="复制所有文案"
                                content={project.storyboard?.map(f => `场景 ${f.sceneNumber}: ${f.description}`).join('\n\n') || ''} 
                            />
                            
                            <div className="space-y-4">
                                {project.storyboard?.map((frame, idx) => (
                                    <div key={frame.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex">
                                            <div className="p-4 bg-slate-50 border-r border-slate-50 font-mono text-sm text-slate-400 font-bold flex items-center justify-center w-14">
                                                {idx + 1}
                                            </div>
                                            <div className="p-4 flex-1">
                                                 <textarea 
                                                    className="w-full text-sm text-slate-700 bg-transparent outline-none resize-none h-20 leading-relaxed"
                                                    value={frame.description}
                                                    onChange={(e) => {
                                                        const newSb = [...(project.storyboard || [])];
                                                        newSb[idx].description = e.target.value;
                                                        setProject({...project, storyboard: newSb});
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* IMAGE GEN REDIRECT */}
                    {selectedNodeId === 'image_gen' && (
                        <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-6">
                            <div className="w-20 h-20 bg-pink-50 rounded-full flex items-center justify-center">
                                <Images className="w-10 h-10 text-pink-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">分镜图片生成工坊</h3>
                                <p className="text-slate-500 mt-2 max-w-xs mx-auto">切换到专用视图，批量生成、预览和下载分镜图片。</p>
                            </div>
                            <button 
                                onClick={() => navigate(`/project/${project.id}/images`)}
                                className="px-8 py-3 bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl font-bold shadow-lg shadow-pink-500/30 hover:scale-105 transition-all flex items-center gap-2"
                            >
                                进入图片生成界面 <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* TITLES */}
                    {selectedNodeId === 'titles' && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <button onClick={handleGenerateTitles} disabled={generatingNodes.has('titles')} className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 transition-all text-sm font-bold flex items-center gap-2">
                                    {generatingNodes.has('titles') ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                                    重新生成
                                </button>
                            </div>

                            {/* STRUCTURED TABLE VIEW */}
                            <TableResultBox 
                                headers={["#", "标题文本", "类型/风格"]}
                                data={project.titles || []}
                                renderRow={(item: TitleItem | string, index) => {
                                    const isObj = typeof item === 'object';
                                    const title = isObj ? (item as TitleItem).title : (item as string);
                                    const type = isObj ? (item as TitleItem).type : "默认";
                                    return (
                                        <tr key={index} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="py-3 px-5 text-sm font-bold text-slate-300 w-12 text-center">{index + 1}</td>
                                            <td className="py-3 px-5 text-sm font-medium text-slate-800 relative">
                                                {title}
                                                <button onClick={() => navigator.clipboard.writeText(title)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-blue-500 bg-white border border-blue-100 rounded hover:bg-blue-50 transition-all" title="复制">
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                            <td className="py-3 px-5 text-xs text-slate-500">
                                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">{type}</span>
                                            </td>
                                        </tr>
                                    )
                                }}
                            />
                        </div>
                    )}

                    {/* SUMMARY */}
                    {selectedNodeId === 'summary' && (
                         <div className="space-y-5 h-full flex flex-col">
                            <div className="flex justify-end mb-2">
                                <button onClick={handleGenerateSummary} disabled={generatingNodes.has('summary')} className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 transition-all text-sm font-bold flex items-center gap-2">
                                    {generatingNodes.has('summary') ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                                    生成简介
                                </button>
                            </div>
                            
                            {/* Text Library for Summary */}
                             <TextResultBox 
                                title="简介与标签库" 
                                copyLabel="复制内容"
                                content={project.summary || ''} 
                            />

                            <textarea
                                value={project.summary || ''}
                                onChange={(e) => setProject({ ...project, summary: e.target.value })}
                                className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-6 text-slate-700 leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-200 resize-none shadow-sm text-sm"
                                placeholder="视频简介与标签..."
                            />
                        </div>
                    )}

                    {/* COVER TEXT */}
                    {selectedNodeId === 'cover' && (
                        <div className="space-y-6">
                             <div className="flex justify-end">
                                <button onClick={handleGenerateCover} disabled={generatingNodes.has('cover')} className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-xl shadow-lg shadow-rose-500/30 hover:-translate-y-0.5 transition-all text-sm font-bold flex items-center gap-2">
                                    {generatingNodes.has('cover') ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                                    生成封面文案
                                </button>
                            </div>

                             {/* STRUCTURED TABLE VIEW */}
                             {project.coverOptions && project.coverOptions.length > 0 ? (
                                <TableResultBox 
                                    headers={["方案", "画面描述 (Visual)", "大字文案 (Copy)"]}
                                    data={project.coverOptions}
                                    renderRow={(item: CoverOption, index) => (
                                        <tr key={index} className="hover:bg-rose-50/30 transition-colors group">
                                            <td className="py-4 px-5 text-sm font-bold text-slate-300 w-16 text-center">#{index + 1}</td>
                                            <td className="py-4 px-5 text-sm text-slate-700 leading-relaxed w-[60%] align-top">
                                                {item.visual}
                                            </td>
                                            <td className="py-4 px-5 align-top">
                                                <div className="relative">
                                                    <div className="bg-rose-50 text-rose-700 font-extrabold text-xl p-3 rounded-lg border border-rose-100 shadow-sm text-center transform -rotate-2 group-hover:rotate-0 transition-transform duration-300">
                                                        {item.copy}
                                                    </div>
                                                    <button onClick={() => navigator.clipboard.writeText(item.copy)} className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 bg-white border border-slate-200 p-1.5 rounded-full shadow-sm hover:text-rose-600 transition-all" title="复制文案">
                                                        <Copy className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                />
                             ) : (
                                 /* Legacy Text View Fallback */
                                 <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">编辑结果 (文本模式)</label>
                                    <textarea 
                                        value={project.coverText || ''} 
                                        onChange={(e) => setProject({...project, coverText: e.target.value})}
                                        className="w-full h-64 bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-800 resize-none outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-200"
                                        placeholder="生成的封面方案将显示在这里..."
                                    />
                                 </div>
                             )}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-slate-100 bg-white">
                     <button 
                        onClick={() => saveWork(project)}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors font-bold flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                        保存更改
                    </button>
                </div>
             </>
         )}
      </div>

    </div>
  );
};

export default ProjectWorkspace;
