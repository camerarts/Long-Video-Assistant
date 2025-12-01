
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
  AlertCircle,
  Zap,
  PanelRightClose,
  PanelRightOpen
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
  
  // Refs for background execution stability
  const projectRef = useRef<ProjectData | null>(null);
  const mountedRef = useRef(true);
  
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

  // One-Click Automation State
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [nodeErrors, setNodeErrors] = useState<Set<string>>(new Set());

  // Component Lifecycle Tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Sync ref with state
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Load project and prompts
  useEffect(() => {
    const init = async () => {
        if (id) {
            try {
              const p = await storage.getProject(id);
              if (p) {
                  if (mountedRef.current) {
                    setProject(p);
                    if (!p.inputs.topic) {
                        setShowInitModal(true);
                        setInitFormData({ topic: '', corePoint: '' });
                    } else {
                        setShowInitModal(false);
                    }
                  }
              } else {
                  if (mountedRef.current) navigate('/');
              }
            } catch (e) {
              console.error("Failed to load project", e);
              if (mountedRef.current) setError("加载项目失败，请返回列表重试");
            }
        }
        try {
          const loadedPrompts = await storage.getPrompts();
          if (mountedRef.current) setPrompts(loadedPrompts);
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
    if (mountedRef.current) setSaving(true);
    // Optimistic Update
    if (mountedRef.current) {
        setProject(updatedProject);
        if (updatedProject.inputs.topic) {
            setShowInitModal(false);
        }
    }
    
    // API Call
    await storage.saveProject(updatedProject);
    if (mountedRef.current) setSaving(false);
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
      if (text && mountedRef.current) {
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

  // --- Generation Logic (Concurrent & Atomic) ---
  
  // Safe state setter for loading
  const setNodeLoading = (nodeId: string, isLoading: boolean) => {
    if (!mountedRef.current) return;
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

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- Individual Generators (Using storage.updateProject for Atomicity) ---

  const handleGenerateScript = async (): Promise<boolean> => {
    // 1. Capture Inputs
    const currentInputs = projectRef.current?.inputs;
    if (!currentInputs) return false;
    
    if (!prompts.SCRIPT) {
        if (mountedRef.current) setError("提示词模版未加载，请刷新页面。");
        return false;
    }

    setNodeLoading('script', true);
    if (mountedRef.current) setError(null);
    
    try {
      // 2. Heavy AI Work
      const promptText = interpolatePrompt(prompts.SCRIPT.template, { 
          ...currentInputs,
          title: projectRef.current?.title || ''
      });
      const script = await gemini.generateText(promptText);
      
      // 3. Atomic Update to Storage (Background Safe)
      const updated = await storage.updateProject(id!, (latest) => ({
          ...latest,
          script,
          status: ProjectStatus.IN_PROGRESS
      }));

      // 4. Update UI if still mounted
      if (mountedRef.current && updated) setProject(updated);
      return true;
    } catch (e: any) {
      console.error("Generate Script Error:", e);
      if (mountedRef.current) setError(`生成脚本失败: ${e.message || '未知错误'}`);
      return false;
    } finally {
      setNodeLoading('script', false);
    }
  };

  const handleGenerateStoryboardText = async (): Promise<boolean> => {
    // 1. Capture Inputs
    const currentScript = projectRef.current?.script;
    if (!currentScript) return false;
    
    if (!prompts.STORYBOARD_TEXT) return false;

    setNodeLoading('sb_text', true);
    if (mountedRef.current) setError(null);
    try {
      // 2. Heavy AI Work
      const promptText = interpolatePrompt(prompts.STORYBOARD_TEXT.template, { 
          script: currentScript,
          title: projectRef.current?.title || ''
      });
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

      // 3. Atomic Update to Storage
      const updated = await storage.updateProject(id!, (latest) => ({
          ...latest,
          storyboard: newFrames
      }));
      
      if (mountedRef.current && updated) setProject(updated);
      return true;
    } catch (e: any) {
      console.error("Generate Storyboard Error:", e);
      if (mountedRef.current) setError(`生成分镜失败: ${e.message}`);
      return false;
    } finally {
      setNodeLoading('sb_text', false);
    }
  };

  const handleGenerateTitles = async (): Promise<boolean> => {
    const currentInputs = projectRef.current?.inputs;
    const currentScript = projectRef.current?.script;
    if (!currentScript || !currentInputs) return false;
    
    if (!prompts.TITLES) return false;

    setNodeLoading('titles', true);
    if (mountedRef.current) setError(null);
    try {
      const promptText = interpolatePrompt(prompts.TITLES.template, { 
          ...currentInputs,
          title: projectRef.current?.title || '',
          script: currentScript 
      });
      
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
      
      // Atomic Update
      const updated = await storage.updateProject(id!, (latest) => ({
          ...latest,
          titles
      }));
      
      if (mountedRef.current && updated) setProject(updated);
      return true;
    } catch (e: any) {
      if (mountedRef.current) setError(`生成标题失败: ${e.message}`);
      return false;
    } finally {
      setNodeLoading('titles', false);
    }
  };

  const handleGenerateSummary = async (): Promise<boolean> => {
    const currentScript = projectRef.current?.script;
    if (!currentScript) return false;
    
    if (!prompts.SUMMARY) return false;

    setNodeLoading('summary', true);
    if (mountedRef.current) setError(null);
    try {
      const promptText = interpolatePrompt(prompts.SUMMARY.template, { 
          script: currentScript,
          title: projectRef.current?.title || ''
      });
      const summary = await gemini.generateText(promptText);
      
      // Atomic Update
      const updated = await storage.updateProject(id!, (latest) => ({
          ...latest,
          summary
      }));
      
      if (mountedRef.current && updated) setProject(updated);
      return true;
    } catch (e: any) {
      if (mountedRef.current) setError(`生成总结失败: ${e.message}`);
      return false;
    } finally {
      setNodeLoading('summary', false);
    }
  };

  const handleGenerateCover = async (): Promise<boolean> => {
    const currentInputs = projectRef.current?.inputs;
    const currentScript = projectRef.current?.script;
    if (!currentScript || !currentInputs) return false;
    
    if (!prompts.COVER_GEN) {
        // Fallback or retry loading prompts if missing
        try {
            const loadedPrompts = await storage.getPrompts();
            setPrompts(loadedPrompts);
            if (!loadedPrompts.COVER_GEN) return false;
        } catch(e) {
            return false;
        }
    }

    setNodeLoading('cover', true);
    if (mountedRef.current) setError(null);
    try {
      // Ensure we use the latest prompts (in case they were just reloaded)
      const template = prompts.COVER_GEN?.template || (await storage.getPrompts()).COVER_GEN?.template;
      
      if (!template) throw new Error("Missing Cover Prompt Template");

      const promptText = interpolatePrompt(template, { 
          ...currentInputs,
          title: projectRef.current?.title || '',
          script: currentScript
      });
      
      const coverOptions = await gemini.generateJSON<CoverOption[]>(promptText, {
          type: "ARRAY",
          items: {
              type: "OBJECT",
              properties: {
                  visual: { type: "STRING" },
                  copy: { type: "STRING" },
                  score: { type: "NUMBER" }
              }
          }
      });
      
      // Atomic Update
      const updated = await storage.updateProject(id!, (latest) => ({
          ...latest,
          coverOptions,
          status: ProjectStatus.COMPLETED
      }));
      
      if (mountedRef.current && updated) setProject(updated);
      return true;
    } catch (e: any) {
      if (mountedRef.current) setError(`生成封面方案失败: ${e.message}`);
      return false;
    } finally {
      setNodeLoading('cover', false);
    }
  };

  // --- One-Click Automation ---
  
  const handleOneClickGenerate = async () => {
    if (!project || !project.script) {
        alert("请先生成视频文案，然后再执行一键生成。");
        return;
    }
    if (isAutoGenerating) return;

    setIsAutoGenerating(true);
    
    // Clear previous errors for these specific nodes
    const targetNodes = ['titles', 'summary', 'sb_text', 'cover'];
    setNodeErrors(prev => {
        const next = new Set(prev);
        targetNodes.forEach(id => next.delete(id));
        return next;
    });

    // Helper to run a specific node task with retry logic
    const executeTaskWithRetry = async (nodeId: string) => {
        // Force loading state on immediately to ensure all 4 show spinners
        setNodeLoading(nodeId, true);

        const runAction = async (): Promise<boolean> => {
            switch(nodeId) {
                case 'titles': return await handleGenerateTitles();
                case 'summary': return await handleGenerateSummary();
                case 'sb_text': return await handleGenerateStoryboardText();
                case 'cover': return await handleGenerateCover();
                default: return false;
            }
        };

        // Attempt 1
        let success = await runAction();

        // Attempt 2 if failed
        if (!success) {
            console.warn(`[OneClick] ${nodeId} failed 1st attempt. Retrying...`);
            // Keep loading indicator active during wait
            setNodeLoading(nodeId, true); 
            await delay(1500); 
            success = await runAction();
        }

        if (!success) {
            console.error(`[OneClick] ${nodeId} failed after retry.`);
            if (mountedRef.current) setNodeErrors(prev => new Set(prev).add(nodeId));
        } else {
             if (mountedRef.current) {
                 setNodeErrors(prev => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                 });
             }
        }
    };

    // Run all concurrently
    await Promise.all(targetNodes.map(nodeId => executeTaskWithRetry(nodeId)));

    if (mountedRef.current) setIsAutoGenerating(false);
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

    // Manual run clears error state for that node
    setNodeErrors(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
    });
    
    // Auto-select node when running
    setSelectedNodeId(nodeId);

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
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                            {headers.map((h, i) => (
                                <th key={i} className="py-4 px-5 text-sm font-extrabold text-slate-700 uppercase tracking-wide whitespace-nowrap">{h}</th>
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
      <div className={`${showSettings ? 'w-80 translate-x-0 opacity-100' : 'w-0 -translate-x-full opacity-0'} transition-all duration-300 ease-out border-r border-slate-200 bg-white/90 backdrop-blur-xl flex flex-col h-full flex-shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm tracking-wide">
                <Settings2 className="w-4 h-4 text-violet-600" /> 项目概览
            </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
            <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">项目名称</label>
                <input 
                    name="title"
                    value={project.title}
                    onChange={(e) => setProject({...project, title: e.target.value})}
                    className="w-full text-base font-bold border-b border-slate-200 py-2 focus:border-violet-500 outline-none bg-transparent text-slate-800 transition-colors placeholder:text-slate-300"
                    placeholder="输入项目名称"
                />
            </div>

             <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">核心观点 / 核心意图</label>
                <textarea
                    name="corePoint"
                    value={project.inputs.corePoint}
                    onChange={handleInputChange}
                    rows={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-violet-500/10 focus:border-violet-500 outline-none transition-all resize-none placeholder:text-slate-400"
                    placeholder="主要的论点、受众痛点或独特的叙事角度..."
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
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3.5 rounded-xl text-sm hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20"
                >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                    保存概览信息
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
            title={showSettings ? "收起侧边栏" : "展开侧边栏"}
        >
            {showSettings ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
        </button>

        {/* Collapsed State Title Header */}
        {!showSettings && (
             <div className="absolute left-20 top-6 z-30 animate-in fade-in slide-in-from-left-4 duration-300 pointer-events-none">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 px-5 py-2.5 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                    <span className="font-bold text-slate-800 text-sm">{project.title}</span>
                </div>
             </div>
        )}

        <div className="absolute right-6 top-6 z-30 flex items-center gap-3">
             <button 
                onClick={handleOneClickGenerate}
                disabled={isAutoGenerating || !project.script}
                className="px-5 py-2.5 bg-white text-violet-600 border border-violet-100 rounded-xl hover:bg-violet-50 hover:border-violet-200 shadow-sm hover:shadow-md transition-all flex items-center gap-2 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="并行执行后续所有任务"
            >
                {isAutoGenerating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4 fill-violet-600" />}
                一键生成
            </button>

            <button 
                onClick={() => saveWork(project)}
                className="px-5 py-2.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl hover:shadow-lg hover:shadow-slate-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-2 font-medium text-sm backdrop-blur-md"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                保存进度
            </button>
        </div>

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
                    const isError = nodeErrors.has(node.id);
                    
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
                    
                    // Style logic: Error (Red) > Completed (Green) > Selected (Violet) > Default
                    let borderClass = 'border-slate-100 hover:border-violet-200 border shadow-md hover:shadow-xl hover:shadow-indigo-500/5';
                    
                    if (isError) {
                        borderClass = 'border-rose-500 border-2 shadow-lg shadow-rose-500/20';
                    } else if (status === 'completed') {
                         borderClass = 'border-emerald-500 border-2 shadow-lg shadow-emerald-500/10';
                    } else if (isSelected) {
                         borderClass = 'border-violet-500 ring-4 ring-violet-500/10 shadow-xl border';
                    }

                    return (
                        <div
                            key={node.id}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onClick={(e) => handleNodeClick(e, node.id)}
                            className={`absolute bg-white rounded-3xl p-5 w-[260px] h-[110px] transition-all duration-200 group flex flex-col justify-between ${borderClass} ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                            style={{ 
                                left: pos.x, 
                                top: pos.y,
                            }}
                        >
                           <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white shadow-sm`}>
                                        {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <node.icon className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-sm leading-tight">{node.label}</h3>
                                        <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{node.description}</p>
                                    </div>
                                </div>
                                
                                {status === 'completed' && <div className="bg-emerald-100 text-emerald-600 p-1 rounded-full"><Check className="w-3 h-3 stroke-[3]" /></div>}
                           </div>

                           {hasAction && !disabled && (
                               <div className="flex justify-end">
                                    <button 
                                        onClick={(e) => handleNodeRun(e, node.id)}
                                        className="text-[10px] font-bold bg-slate-50 hover:bg-violet-50 text-slate-500 hover:text-violet-600 px-3 py-1.5 rounded-lg border border-slate-100 hover:border-violet-200 transition-colors flex items-center gap-1.5"
                                    >
                                        {node.id === 'image_gen' ? '前往工坊' : '立即生成'} 
                                        {node.id !== 'image_gen' && <Wand2 className="w-3 h-3" />}
                                    </button>
                               </div>
                           )}
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      {/* Right Sidebar: Results */}
      <div className={`${selectedNodeId ? 'w-[420px] translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0'} transition-all duration-300 ease-out border-l border-slate-200 bg-white/95 backdrop-blur-xl flex flex-col h-full flex-shrink-0 z-20 shadow-[-4px_0_24px_rgba(0,0,0,0.02)]`}>
          {selectedNodeId && (
              <>
                 <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm tracking-wide">
                        {NODES_CONFIG.find(n => n.id === selectedNodeId)?.label}
                        <span className="text-slate-300">/</span>
                        <span className="text-slate-400 font-normal">生成结果</span>
                    </h2>
                    <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600">
                        <PanelRightClose className="w-5 h-5" />
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {selectedNodeId === 'script' && (
                        <TextResultBox content={project.script || ''} title="完整视频脚本" />
                    )}

                    {selectedNodeId === 'titles' && project.titles && (
                        <TableResultBox 
                            headers={['序号', '推荐标题', '类型']} 
                            data={project.titles}
                            renderRow={(item: TitleItem, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                    <td className="py-4 px-6 text-center text-sm font-bold text-slate-400">{idx + 1}</td>
                                    <td className="py-4 px-6 font-bold text-slate-700 text-sm leading-relaxed">{item.title}</td>
                                    <td className="py-4 px-6">
                                        <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 inline-block whitespace-nowrap">
                                            {item.type}
                                        </span>
                                    </td>
                                </tr>
                            )}
                        />
                    )}

                    {selectedNodeId === 'summary' && (
                        <TextResultBox content={project.summary || ''} title="简介与标签" copyLabel="复制简介" />
                    )}

                    {selectedNodeId === 'sb_text' && (
                        <div className="space-y-4">
                            <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-xl p-4 flex gap-3 items-center">
                                <div className="bg-fuchsia-100 p-2 rounded-lg text-fuchsia-600">
                                    <ImageIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-fuchsia-800 text-sm">分镜文案已生成</h4>
                                    <p className="text-xs text-fuchsia-600/80">共 {project.storyboard?.length || 0} 个场景描述</p>
                                </div>
                                <button 
                                    onClick={() => navigate(`/project/${project.id}/images`)}
                                    className="bg-white text-fuchsia-600 text-xs font-bold px-3 py-2 rounded-lg border border-fuchsia-200 hover:bg-fuchsia-50 transition-colors shadow-sm"
                                >
                                    去生图
                                </button>
                            </div>
                            <TableResultBox 
                                headers={['#', '画面描述']} 
                                data={project.storyboard || []}
                                renderRow={(item: StoryboardFrame, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                        <td className="py-3 px-4 text-center text-xs font-bold text-slate-400 align-top pt-4">{item.sceneNumber}</td>
                                        <td className="py-3 px-4 text-xs text-slate-600 leading-relaxed align-top pt-4 pb-4">
                                            {item.description}
                                        </td>
                                    </tr>
                                )}
                            />
                        </div>
                    )}

                    {selectedNodeId === 'cover' && (
                         <TableResultBox 
                            headers={['封面文案', '得分']} 
                            data={project.coverOptions || []}
                            renderRow={(item: CoverOption, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                    <td className="py-6 px-6 align-top">
                                        <div className="space-y-2">
                                            {item.copy.split('\n').map((line, lIdx) => (
                                                <div key={lIdx} className="text-base font-bold text-slate-800 leading-snug">
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="py-6 px-6 align-top text-center">
                                         <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-extrabold shadow-sm ${
                                            (item.score || 0) >= 90 ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' :
                                            (item.score || 0) >= 80 ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' :
                                            'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                        }`}>
                                            {item.score || '-'}
                                        </span>
                                    </td>
                                </tr>
                            )}
                        />
                    )}
                    
                    {selectedNodeId === 'input' && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase">视频主题</label>
                                <div className="text-sm font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    {project.inputs.topic}
                                </div>
                            </div>
                             <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase">核心观点</label>
                                <div className="text-sm font-medium text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                                    {project.inputs.corePoint}
                                </div>
                            </div>
                        </div>
                    )}

                 </div>
              </>
          )}
      </div>

    </div>
  );
};

export default ProjectWorkspace;
