
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

// --- Helper Components ---

const RowCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
      <button 
          onClick={handleCopy}
          className={`p-2 rounded-lg transition-all border ${
              copied 
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
              : 'bg-white text-slate-400 border-slate-100 hover:text-violet-600 hover:border-violet-200 hover:shadow-sm'
          }`}
          title={copied ? "已复制" : "复制内容"}
      >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
  );
};

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
  // Separated states for the two different save buttons
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewSuccess, setOverviewSuccess] = useState(false);

  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalSuccess, setGlobalSuccess] = useState(false);

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
                  if (mountedRef.current) navigate('/dashboard');
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

  // Left Sidebar: Save only Title and Core Point/Inputs
  const handleSaveOverview = async () => {
      if (!project || !mountedRef.current) return;
      
      setSavingOverview(true);
      setOverviewSuccess(false);

      // Atomic update to ensure we only update metadata and don't overwrite ongoing generation
      await storage.updateProject(project.id, (latest) => ({
          ...latest,
          title: project.title,
          inputs: project.inputs,
          updatedAt: Date.now()
      }));

      if (mountedRef.current) {
          setSavingOverview(false);
          setOverviewSuccess(true);
          setTimeout(() => {
              if (mountedRef.current) setOverviewSuccess(false);
          }, 2000);
      }
  };

  // Top Right: Save All (Global Checkpoint)
  const handleSaveGlobal = async () => {
      if (!project || !mountedRef.current) return;

      setSavingGlobal(true);
      setGlobalSuccess(false);

      // Snapshot save of the current project state
      await storage.updateProject(project.id, (latest) => ({
          ...latest,
          ...project, // Merge current UI state into storage
          updatedAt: Date.now()
      }));

      if (mountedRef.current) {
          setSavingGlobal(false);
          setGlobalSuccess(true);
          setTimeout(() => {
              if (mountedRef.current) setGlobalSuccess(false);
          }, 2000);
      }
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
    
    // Initial save
    setProject(updatedProject);
    storage.saveProject(updatedProject);
    setShowInitModal(false);
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
    
    if (!prompts.TITLES) {
         // Fallback or retry loading prompts if missing
        try {
            const loadedPrompts = await storage.getPrompts();
            setPrompts(loadedPrompts);
            if (!loadedPrompts.TITLES) return false;
        } catch(e) {
            return false;
        }
    }

    setNodeLoading('titles', true);
    if (mountedRef.current) setError(null);
    try {
      // Ensure we use the latest prompts
      const template = prompts.TITLES?.template || (await storage.getPrompts()).TITLES?.template;
      if (!template) throw new Error("Missing Titles Prompt Template");

      const promptText = interpolatePrompt(template, { 
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
                type: { type: "STRING" },
                score: { type: "NUMBER" }
            },
            required: ["title", "score"]
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
              },
              required: ["copy", "score"]
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
    // Middle mouse (1) or Space+Left (0) triggers pan regardless of target (bubbled from nodes)
    if (isSpacePressed || e.button === 1) {
      setIsPanning(true);
      return;
    }
    
    // Pure Left click (0) triggers pan ONLY if clicking empty background
    // We check e.target === e.currentTarget to avoid capturing clicks on UI elements (panels, buttons) 
    // that might bubble up if they don't stop propagation.
    if (e.button === 0 && e.target === e.currentTarget) {
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
                                <th key={i} className={`py-4 px-5 text-sm font-extrabold text-slate-700 uppercase tracking-wide whitespace-nowrap ${h === '操作' ? 'text-right' : ''} ${h === '序号' || h === '得分' ? 'text-center' : ''}`}>{h}</th>
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
                            navigate('/dashboard');
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
      {/* Width reduced from w-80 to w-40 as requested */}
      <div className={`${showSettings ? 'w-40 translate-x-0 opacity-100' : 'w-0 -translate-x-full opacity-0'} transition-all duration-300 ease-out border-r border-slate-200 bg-white/90 backdrop-blur-xl flex flex-col h-full flex-shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-xs tracking-wide">
                <Settings2 className="w-3.5 h-3.5 text-violet-600" /> 项目概览
            </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">项目名称</label>
                <input 
                    name="title"
                    value={project.title}
                    onChange={(e) => setProject({...project, title: e.target.value})}
                    className="w-full text-sm font-bold border-b border-slate-200 py-1 focus:border-violet-500 outline-none bg-transparent text-slate-800 transition-colors placeholder:text-slate-300"
                    placeholder="名称"
                />
            </div>

             <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">核心观点</label>
                <textarea
                    name="corePoint"
                    value={project.inputs.corePoint}
                    onChange={handleInputChange}
                    rows={8}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 leading-relaxed focus:ring-2 focus:ring-violet-500/10 focus:border-violet-500 outline-none transition-all resize-none placeholder:text-slate-400"
                    placeholder="输入核心观点..."
                />
            </div>

             <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-3 rounded-lg border border-violet-100 text-[10px] text-violet-700 leading-relaxed shadow-sm">
                <strong className="block mb-1 font-semibold text-violet-800">操作提示</strong>
                按住 <code>空格键</code>:<br/>
                • 拖动平移<br/>
                • 滚轮缩放
            </div>

            <div className="pt-2 mt-auto">
                <button 
                    onClick={handleSaveOverview}
                    disabled={savingOverview || overviewSuccess}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold shadow-lg transition-all ${
                        overviewSuccess 
                        ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/10 hover:shadow-slate-900/20'
                    }`}
                >
                    {savingOverview ? <Loader2 className="w-3 h-3 animate-spin"/> : overviewSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3"/>}
                    {overviewSuccess ? '已保存' : '保存'}
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
            onMouseDown={(e) => e.stopPropagation()} 
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
                onMouseDown={(e) => e.stopPropagation()}
            >
                {isAutoGenerating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4 fill-violet-600" />}
                一键生成
            </button>

            <button 
                onClick={handleSaveGlobal}
                disabled={savingGlobal || globalSuccess}
                className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 font-medium text-sm backdrop-blur-md ${
                    globalSuccess 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-lg hover:shadow-slate-500/20 hover:-translate-y-0.5'
                }`}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {savingGlobal ? <Loader2 className="w-4 h-4 animate-spin"/> : globalSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4"/>}
                {globalSuccess ? '已保存' : '保存进度'}
            </button>
        </div>

        {/* Spacebar/Zoom Indicator */}
        {isSpacePressed && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/80 backdrop-blur text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-fade-in-up pointer-events-none">
                <Hand className="w-4 h-4" /> 拖动 / 滚轮缩放
            </div>
        )}

        {/* Zoom Level Indicator */}
        <div className="absolute bottom-6 left-6 z-30 bg-white/80 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 shadow-sm tabular-nums">
            {Math.round(zoomLevel * 100)}%
        </div>

        {/* Canvas Content */}
        <div 
            className="w-full h-full transform-gpu"
            style={{
                transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: '0 0'
            }}
        >
            <svg className="absolute top-0 left-0 w-[4000px] h-[4000px] pointer-events-none overflow-visible">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                    </marker>
                </defs>
                {CONNECTIONS.map((conn, idx) => {
                    const fromPos = nodePositions[conn.from];
                    const toPos = nodePositions[conn.to];
                    if (!fromPos || !toPos) return null;

                    // Calculate center points
                    const startX = fromPos.x + NODE_WIDTH;
                    const startY = fromPos.y + NODE_HEIGHT / 2;
                    const endX = toPos.x;
                    const endY = toPos.y + NODE_HEIGHT / 2;

                    return (
                        <path
                            key={idx}
                            d={getBezierPath(startX, startY, endX, endY)}
                            fill="none"
                            stroke="#cbd5e1"
                            strokeWidth="2"
                            markerEnd="url(#arrowhead)"
                        />
                    );
                })}
            </svg>

            {NODES_CONFIG.map((node) => {
                const pos = nodePositions[node.id];
                const isActive = selectedNodeId === node.id;
                const status = getNodeStatus(node.id);
                const disabled = isNodeDisabled(node.id);
                const isError = nodeErrors.has(node.id);
                const isLoading = generatingNodes.has(node.id);

                return (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onClick={(e) => handleNodeClick(e, node.id)}
                        className={`absolute rounded-2xl p-4 w-[260px] h-[110px] shadow-sm border-2 transition-all duration-300 group flex flex-col justify-between ${
                            disabled ? 'opacity-50 grayscale cursor-not-allowed bg-slate-50 border-slate-200' :
                            isError ? 'bg-rose-50 border-rose-400 shadow-rose-200' :
                            isActive 
                            ? `bg-white border-${node.color}-500 shadow-xl shadow-${node.color}-500/20 scale-105 z-10` 
                            : `bg-white border-slate-100 hover:border-${node.color}-300 hover:shadow-md cursor-pointer`
                        }`}
                        style={{
                            left: pos.x,
                            top: pos.y,
                        }}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                    disabled ? 'bg-slate-200 text-slate-400' :
                                    isActive ? `bg-${node.color}-100 text-${node.color}-600` : `bg-slate-50 text-slate-500 group-hover:bg-${node.color}-50 group-hover:text-${node.color}-500`
                                }`}>
                                    <node.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{node.label}</h3>
                                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{node.description}</p>
                                </div>
                            </div>
                            {/* Status Indicator */}
                            {isLoading ? (
                                <Loader2 className={`w-4 h-4 animate-spin text-${node.color}-500`} />
                            ) : isError ? (
                                <AlertCircle className="w-4 h-4 text-rose-500" />
                            ) : status === 'completed' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                                <div className={`w-2 h-2 rounded-full ${disabled ? 'bg-slate-200' : 'bg-slate-200 group-hover:bg-slate-300'}`} />
                            )}
                        </div>

                        {/* Action Bar (Only Visible on Hover/Active) */}
                        <div className={`mt-auto flex justify-end transition-opacity duration-200 ${isActive || isLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                             {node.id === 'image_gen' ? (
                                 <button
                                    onClick={(e) => handleNodeRun(e, node.id)}
                                    disabled={disabled}
                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                                        disabled ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'
                                    }`}
                                 >
                                    进入工坊 <ArrowRight className="w-3 h-3" />
                                 </button>
                             ) : (
                                <button
                                    onClick={(e) => handleNodeRun(e, node.id)}
                                    disabled={disabled || isLoading}
                                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                                        disabled ? 'bg-slate-100 text-slate-400' : 
                                        status === 'completed' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
                                        `bg-${node.color}-50 text-${node.color}-600 hover:bg-${node.color}-100`
                                    }`}
                                >
                                    {isLoading ? '生成中...' : status === 'completed' ? '重新生成' : '开始生成'}
                                    {isLoading ? null : <Play className="w-3 h-3 fill-current" />}
                                </button>
                             )}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Right Panel: Result Details */}
        <div 
            className={`absolute top-0 right-0 bottom-0 w-[420px] bg-white/90 backdrop-blur-xl border-l border-slate-200 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-300 z-20 flex flex-col ${selectedNodeId ? 'translate-x-0' : 'translate-x-full'}`}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white/50">
                <div className="flex items-center gap-2">
                     {selectedNodeId && (() => {
                         const node = NODES_CONFIG.find(n => n.id === selectedNodeId);
                         return (
                            <>
                                <div className={`w-8 h-8 rounded-lg bg-${node?.color}-100 text-${node?.color}-600 flex items-center justify-center`}>
                                    {node?.icon && <node.icon className="w-4 h-4" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-sm">{node?.label}</h3>
                                    <p className="text-[10px] text-slate-400">输出结果预览</p>
                                </div>
                            </>
                         );
                     })()}
                </div>
                <button onClick={() => setSelectedNodeId(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                    <PanelRightClose className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[#F8F9FC]">
                 {/* Dynamic Content Based on Node */}
                 {selectedNodeId === 'input' && (
                     <div className="space-y-4 h-full">
                         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">项目主题</label>
                             <p className="text-sm font-medium text-slate-800">{project.inputs.topic}</p>
                         </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">核心观点</label>
                             <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{project.inputs.corePoint}</p>
                         </div>
                     </div>
                 )}

                 {selectedNodeId === 'script' && (
                    <TextResultBox content={project.script || ''} title="视频文案脚本" />
                 )}

                 {selectedNodeId === 'summary' && (
                    <TextResultBox content={project.summary || ''} title="简介与标签" />
                 )}

                 {selectedNodeId === 'titles' && (
                     <TableResultBox 
                        headers={['序号', '爆款標題', '关键词', '得分', '操作']}
                        data={project.titles || []}
                        renderRow={(item: TitleItem, i) => (
                            <tr key={i} className="hover:bg-slate-50 group">
                                <td className="py-3 px-5 text-center text-xs font-bold text-slate-400">{i + 1}</td>
                                <td className="py-3 px-5 text-sm text-slate-800 font-bold leading-snug">{item.title}</td>
                                <td className="py-3 px-5 text-xs text-slate-500 font-medium whitespace-nowrap">{item.type}</td>
                                <td className="py-3 px-5 text-center">
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${item.score && item.score > 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {item.score ? (Number(item.score) / 10).toFixed(2) : '-'}
                                    </span>
                                </td>
                                <td className="py-3 px-5 text-right">
                                    <RowCopyButton text={item.title} />
                                </td>
                            </tr>
                        )}
                     />
                 )}

                 {selectedNodeId === 'cover' && (
                     <div className="space-y-6">
                        {/* Render Options */}
                        {project.coverOptions && project.coverOptions.length > 0 ? (
                            <div className="space-y-4">
                                {project.coverOptions.map((opt, i) => (
                                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-1 rounded border border-rose-100">方案 {i+1}</span>
                                            <span className="text-xs font-bold text-slate-400">推荐指数: {opt.score}</span>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">画面描述</p>
                                            <p className="text-xs text-slate-600 leading-relaxed">{opt.visual}</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 relative group">
                                            <p className="text-sm font-bold text-slate-800 whitespace-pre-line leading-relaxed text-center font-serif">{opt.copy}</p>
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <RowCopyButton text={opt.copy} />
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
                     <TableResultBox 
                        headers={['序号', '画面描述', '操作']}
                        data={project.storyboard || []}
                        renderRow={(item: StoryboardFrame, i) => (
                            <tr key={item.id} className="hover:bg-slate-50 group">
                                <td className="py-4 px-5 text-center text-xs font-bold text-slate-400">{item.sceneNumber}</td>
                                <td className="py-4 px-5 text-xs text-slate-700 leading-relaxed">{item.description}</td>
                                <td className="py-4 px-5 text-right">
                                     <RowCopyButton text={item.description} />
                                </td>
                            </tr>
                        )}
                     />
                 )}
                 
                 {selectedNodeId === 'image_gen' && (
                     <div className="flex flex-col items-center justify-center h-full text-center p-8">
                         <div className="w-16 h-16 bg-pink-100 text-pink-500 rounded-2xl flex items-center justify-center mb-4">
                             <Images className="w-8 h-8" />
                         </div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">图片生成工坊</h3>
                         <p className="text-slate-500 text-sm mb-6 max-w-xs">
                             分镜脚本已就绪。请前往独立的工作台进行批量图片生成和管理。
                         </p>
                         <button
                            onClick={() => navigate(`/project/${project.id}/images`)}
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                         >
                            前往工坊 <ArrowRight className="w-4 h-4" />
                         </button>
                     </div>
                 )}
            </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectWorkspace;
