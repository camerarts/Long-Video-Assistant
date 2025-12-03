import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, TitleItem, StoryboardFrame, CoverOption, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { 
  ArrowLeft, Layout, FileText, Type, 
  List, PanelRightClose, Sparkles, Loader2, Copy, 
  Check, Images, ArrowRight, Palette, Film, Maximize2, Play
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

const TextResultBox = ({ content, title }: { content: string, title: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full max-h-[600px]">
    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h4>
      <RowCopyButton text={content} />
    </div>
    <div className="p-4 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-mono">
      {content || <span className="text-slate-400 italic">暂无内容...</span>}
    </div>
  </div>
);

interface TableResultBoxProps<T> {
    headers: string[];
    data: T[];
    renderRow: (item: T, index: number) => React.ReactNode;
}

const TableResultBox = <T extends any>({ headers, data, renderRow }: TableResultBoxProps<T>) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            {headers.map((h: string) => (
              <th key={h} className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
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

const NODES_CONFIG = [
  { id: 'input', label: '项目输入', icon: Layout, color: 'blue', description: '选题与核心观点' },
  { id: 'script', label: '视频脚本', icon: FileText, color: 'violet', promptKey: 'SCRIPT', description: '生成分章节的详细脚本' },
  { id: 'sb_text', label: '分镜文案', icon: Film, color: 'fuchsia', promptKey: 'STORYBOARD_TEXT', description: '拆解为可视化画面描述' },
  { id: 'titles', label: '爆款标题', icon: Type, color: 'amber', promptKey: 'TITLES', description: '生成高点击率标题' },
  { id: 'summary', label: '简介与标签', icon: List, color: 'emerald', promptKey: 'SUMMARY', description: '生成简介和Hashtags' },
  { id: 'cover', label: '封面策划', icon: Palette, color: 'rose', promptKey: 'COVER_GEN', description: '策划封面视觉与文案' },
  { id: 'image_gen', label: '图片工坊', icon: Images, color: 'pink', description: '前往生图页面' },
];

// --- Main Component ---

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('input');
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  
  // To prevent async update on unmounted component
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const init = async () => {
        if (id) {
            const p = await storage.getProject(id);
            if (p) {
                if (mountedRef.current) setProject(p);
            } else {
                navigate('/');
            }
        }
        const loadedPrompts = await storage.getPrompts();
        if (mountedRef.current) setPrompts(loadedPrompts);
        if (mountedRef.current) setLoading(false);
    };
    init();
    return () => { mountedRef.current = false; };
  }, [id, navigate]);

  // Helper for prompt interpolation
  const interpolate = (template: string, data: Record<string, string>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  const saveProjectUpdate = async (updater: (p: ProjectData) => ProjectData) => {
      if (!id) return;
      const updated = await storage.updateProject(id, updater);
      if (updated && mountedRef.current) setProject(updated);
  };

  const handleGenerate = async (nodeId: string) => {
    if (!project) return;
    
    // Check dependencies
    if (['sb_text', 'titles', 'summary', 'cover'].includes(nodeId) && !project.script) {
        alert("请先生成视频脚本 (Script)，然后再执行此步骤。");
        return;
    }

    setGeneratingNodeId(nodeId);

    try {
        const config = NODES_CONFIG.find(n => n.id === nodeId);
        if (!config || !config.promptKey) return;
        
        const template = prompts[config.promptKey]?.template || '';
        
        // Prepare context data for interpolation
        const contextData: Record<string, string> = {
            topic: project.inputs.topic,
            corePoint: project.inputs.corePoint,
            audience: project.inputs.audience,
            duration: project.inputs.duration,
            tone: project.inputs.tone,
            language: project.inputs.language,
            title: project.title, // For steps that need the title
            script: project.script || ''
        };

        const prompt = interpolate(template, contextData);

        if (nodeId === 'script') {
            const text = await gemini.generateText(prompt, 'gemini-3-pro-preview'); // Use Pro for script
            await saveProjectUpdate(p => ({ ...p, script: text, status: p.status === 'DRAFT' ? 'IN_PROGRESS' : p.status }));
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
            const data = await gemini.generateJSON<{description: string}[]>(prompt, {
                type: "ARRAY", items: {
                    type: "OBJECT", properties: {
                        description: {type: "STRING"}
                    }
                }
            });
            // Map to StoryboardFrame structure with IDs
            const frames: StoryboardFrame[] = data.map((item, idx) => ({
                id: crypto.randomUUID(),
                sceneNumber: idx + 1,
                description: item.description
            }));
            await saveProjectUpdate(p => ({ ...p, storyboard: frames }));
        }

    } catch (error: any) {
        alert(`生成失败: ${error.message}`);
        console.error(error);
    } finally {
        if (mountedRef.current) setGeneratingNodeId(null);
    }
  };

  if (loading || !project) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>;
  }

  return (
    <div className="flex h-full bg-[#F8F9FC] relative overflow-hidden">
        {/* Left Panel: Flow Canvas (Visualized as a list for now) */}
        <div className="flex-1 flex flex-col h-full relative z-10">
             {/* Header */}
             <div className="px-8 py-6 bg-white/80 backdrop-blur-sm border-b border-slate-200 flex justify-between items-center">
                 <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900">{project.title}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{project.status}</span>
                            <span className="text-xs text-slate-400">更新于 {new Date(project.updatedAt).toLocaleString()}</span>
                        </div>
                    </div>
                 </div>
             </div>

             {/* Node Flow */}
             <div className="flex-1 overflow-y-auto p-10">
                 <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                     {NODES_CONFIG.map((node, index) => {
                         const isActive = selectedNodeId === node.id;
                         const isGenerating = generatingNodeId === node.id;
                         
                         // Determine status of data
                         let hasData = false;
                         if (node.id === 'input') hasData = !!project.inputs.topic;
                         if (node.id === 'script') hasData = !!project.script;
                         if (node.id === 'sb_text') hasData = !!project.storyboard && project.storyboard.length > 0;
                         if (node.id === 'titles') hasData = !!project.titles && project.titles.length > 0;
                         if (node.id === 'summary') hasData = !!project.summary;
                         if (node.id === 'cover') hasData = !!project.coverOptions && project.coverOptions.length > 0;
                         if (node.id === 'image_gen') {
                             const generatedCount = project.storyboard?.filter(f => !!f.imageUrl).length || 0;
                             hasData = generatedCount > 0;
                         }

                         return (
                             <div 
                                key={node.id}
                                onClick={() => setSelectedNodeId(node.id)}
                                className={`relative bg-white rounded-2xl p-6 border-2 transition-all cursor-pointer group hover:-translate-y-1 hover:shadow-lg ${
                                    isActive 
                                    ? `border-${node.color}-500 shadow-${node.color}-500/20` 
                                    : 'border-transparent shadow-sm hover:border-slate-200'
                                }`}
                             >
                                 <div className="flex items-start justify-between mb-4">
                                     <div className={`w-12 h-12 rounded-xl bg-${node.color}-100 text-${node.color}-600 flex items-center justify-center`}>
                                         <node.icon className="w-6 h-6" />
                                     </div>
                                     {hasData && (
                                         <div className="bg-emerald-100 text-emerald-600 p-1 rounded-full">
                                             <Check className="w-4 h-4" />
                                         </div>
                                     )}
                                 </div>
                                 
                                 <h3 className="text-lg font-bold text-slate-800 mb-1">{node.label}</h3>
                                 <p className="text-xs text-slate-400 font-medium mb-4 min-h-[1.5em]">{node.description}</p>
                                 
                                 <div className="flex items-center justify-between mt-auto">
                                     {node.id !== 'input' && node.id !== 'image_gen' ? (
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); handleGenerate(node.id); }}
                                            disabled={isGenerating}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                                                hasData 
                                                ? 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                : `bg-${node.color}-50 text-${node.color}-600 hover:bg-${node.color}-100`
                                            }`}
                                         >
                                             {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                             {hasData ? '重新生成' : '开始生成'}
                                         </button>
                                     ) : node.id === 'image_gen' ? (
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(`/project/${project.id}/images`); }}
                                            className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                                         >
                                             进入工坊 <ArrowRight className="w-3.5 h-3.5" />
                                         </button>
                                     ) : (
                                        <div className="h-8"></div>
                                     )}

                                     <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? `text-${node.color}-500` : 'text-slate-300'}`}>
                                         {isActive ? 'Current' : `Step ${index + 1}`}
                                     </span>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             </div>
        </div>

        {/* Right Panel: Result Details */}
        <div 
            className={`absolute top-0 right-0 bottom-0 bg-white/95 backdrop-blur-xl border-l border-slate-200 shadow-[-4px_0_24px_rgba(0,0,0,0.05)] transform transition-all duration-300 z-20 flex flex-col ${selectedNodeId ? 'translate-x-0' : 'translate-x-full'} ${selectedNodeId === 'titles' || selectedNodeId === 'sb_text' ? 'w-[600px]' : 'w-[480px]'}`}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white/50">
                <div className="flex items-center gap-3">
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
                         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">项目主题</label>
                             <p className="text-base font-bold text-slate-800">{project.inputs.topic}</p>
                         </div>
                          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">核心观点</label>
                             <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{project.inputs.corePoint}</p>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">目标受众</label>
                                <p className="text-sm font-medium text-slate-700">{project.inputs.audience}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">预估时长</label>
                                <p className="text-sm font-medium text-slate-700">{project.inputs.duration}</p>
                            </div>
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
                        headers={['#', '爆款标题', '关键词', '得分', '']}
                        data={project.titles || []}
                        renderRow={(item: TitleItem, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 group">
                                <td className="py-3 px-5 text-center text-xs font-bold text-slate-400">{i + 1}</td>
                                <td className="py-3 px-5 text-sm text-slate-800 font-bold leading-snug">{item.title}</td>
                                <td className="py-3 px-5 text-xs text-slate-500 font-medium whitespace-nowrap">{item.keywords || item.type}</td>
                                <td className="py-3 px-5 text-center">
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${item.score && item.score > 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {item.score ? (Number(item.score)).toFixed(0) : '-'}
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
                        headers={['#', '画面描述', '']}
                        data={project.storyboard || []}
                        renderRow={(item: StoryboardFrame, i: number) => (
                            <tr key={item.id} className="hover:bg-slate-50 group">
                                <td className="py-4 px-5 text-center text-xs font-bold text-slate-400 align-top">{item.sceneNumber}</td>
                                <td className="py-4 px-5 text-xs text-slate-700 leading-relaxed align-top">{item.description}</td>
                                <td className="py-4 px-5 text-right align-top">
                                     <RowCopyButton text={item.description} />
                                </td>
                            </tr>
                        )}
                     />
                 )}
                 
                 {selectedNodeId === 'image_gen' && (
                     <div className="flex flex-col items-center justify-center h-full text-center p-8">
                         <div className="w-16 h-16 bg-pink-100 text-pink-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-pink-500/20">
                             <Images className="w-8 h-8" />
                         </div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">图片生成工坊</h3>
                         <p className="text-slate-500 text-sm mb-6 max-w-xs leading-relaxed">
                             分镜脚本已就绪。请前往独立的工作台进行批量图片生成和管理。
                         </p>
                         <button
                            onClick={() => navigate(`/project/${project.id}/images`)}
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-900/20"
                         >
                            前往工坊 <ArrowRight className="w-4 h-4" />
                         </button>
                     </div>
                 )}
            </div>
        </div>
    </div>
  );
};

export default ProjectWorkspace;
