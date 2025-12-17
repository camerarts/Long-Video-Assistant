import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectData, ProjectStatus, DEFAULT_PROMPTS, TitleItem, CoverOption } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { 
  Loader2, Save, Wand2, FileText, Type, Layout, 
  Image as ImageIcon, Check, Copy, ArrowLeft, BookOpen
} from 'lucide-react';

const RowCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
      onClick={handleCopy} 
      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-md transition-all" 
      title="复制"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

const formatScore = (score?: number) => score || 0;

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState('script'); 
  const [generating, setGenerating] = useState(false);
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
        if (!id) return;
        const p = await storage.getProject(id);
        if (p) {
            setProject(p);
        } else {
            navigate('/dashboard');
        }
        const loadedPrompts = await storage.getPrompts();
        setPrompts(loadedPrompts);
        setLoading(false);
    };
    init();
  }, [id, navigate]);

  const handleSave = async (updatedProject?: ProjectData) => {
      const p = updatedProject || project;
      if (!p) return;
      setSaving(true);
      await storage.saveProject(p);
      setProject(p);
      setTimeout(() => setSaving(false), 500);
  };

  const updateProject = (fn: (p: ProjectData) => ProjectData) => {
      setProject(prev => {
          if (!prev) return null;
          const next = fn(prev);
          return next;
      });
  };

  const replaceVariables = (template: string, p: ProjectData) => {
      let text = template;
      text = text.replace(/{{topic}}/g, p.inputs.topic || '');
      text = text.replace(/{{title}}/g, p.title || p.inputs.topic || '');
      text = text.replace(/{{tone}}/g, p.inputs.tone || '');
      text = text.replace(/{{language}}/g, p.inputs.language || '');
      text = text.replace(/{{script}}/g, p.script || '');
      return text;
  };

  const handleGenerateScript = async () => {
      if (!project) return;
      setGenerating(true);
      try {
          const prompt = replaceVariables(prompts.SCRIPT.template, project);
          const text = await gemini.generateText(prompt);
          const updated = { ...project, script: text, status: ProjectStatus.IN_PROGRESS };
          await handleSave(updated);
      } catch (e) {
          alert("生成失败");
      } finally {
          setGenerating(false);
      }
  };

  const handleGenerateTitles = async () => {
      if (!project) return;
      setGenerating(true);
      try {
          const prompt = replaceVariables(prompts.TITLES.template, project);
          const titles = await gemini.generateJSON<TitleItem[]>(prompt, {
              type: "ARRAY",
              items: {
                  type: "OBJECT",
                  properties: {
                      title: { type: "STRING" },
                      keywords: { type: "STRING" },
                      score: { type: "NUMBER" }
                  }
              }
          });
          const updated = { ...project, titles };
          await handleSave(updated);
      } catch (e) {
          alert("生成失败");
      } finally {
          setGenerating(false);
      }
  };

  const handleGenerateSummary = async () => {
      if (!project) return;
      setGenerating(true);
      try {
          const prompt = replaceVariables(prompts.SUMMARY.template, project);
          const text = await gemini.generateText(prompt);
          const updated = { ...project, summary: text };
          await handleSave(updated);
      } catch (e) {
          alert("生成失败");
      } finally {
          setGenerating(false);
      }
  };

  const handleGenerateStoryboard = async () => {
      if (!project) return;
      setGenerating(true);
      try {
          const prompt = replaceVariables(prompts.STORYBOARD_TEXT.template, project);
          const frames = await gemini.generateJSON<{original: string, description: string}[]>(prompt, {
              type: "ARRAY",
              items: {
                  type: "OBJECT",
                  properties: {
                      original: { type: "STRING" },
                      description: { type: "STRING" }
                  }
              }
          });
          
          const storyboard = frames.map((f, i) => ({
              id: crypto.randomUUID(),
              sceneNumber: i + 1,
              originalText: f.original,
              description: f.description,
              imagePrompt: f.description 
          }));

          const updated = { ...project, storyboard };
          await handleSave(updated);
      } catch (e) {
          alert("生成失败");
      } finally {
          setGenerating(false);
      }
  };

  const handleGenerateCover = async (type: 'A' | 'B') => {
      if (!project) return;
      setGenerating(true);
      try {
          const template = type === 'A' ? prompts.COVER_GEN.template : prompts.COVER_GEN_B.template;
          const prompt = replaceVariables(template, project);
          const options = await gemini.generateJSON<CoverOption[]>(prompt, {
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
          
          const updated = { ...project };
          if (type === 'A') updated.coverOptions = options;
          else updated.coverOptionsB = options;
          
          await handleSave(updated);
      } catch (e) {
          alert("生成失败");
      } finally {
          setGenerating(false);
      }
  };

  if (loading || !project) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-violet-500" /></div>;

  const NavItem = ({ id, label, icon: Icon }: any) => (
      <button 
          onClick={() => setSelectedNodeId(id)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
              selectedNodeId === id 
              ? 'bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-200' 
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
      >
          <Icon className={`w-4 h-4 ${selectedNodeId === id ? 'text-violet-600' : 'text-slate-400'}`} />
          {label}
      </button>
  );

  return (
    <div className="flex h-screen bg-[#F8F9FC]">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col p-4">
            <div className="mb-6">
                <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-xs mb-4">
                    <ArrowLeft className="w-4 h-4" /> 返回列表
                </button>
                <h1 className="text-lg font-black text-slate-800 line-clamp-2 leading-tight">{project.title}</h1>
            </div>

            <div className="space-y-1 flex-1 overflow-y-auto">
                <NavItem id="script" label="1. 视频文案" icon={FileText} />
                <NavItem id="titles" label="2. 标题策划" icon={Type} />
                <NavItem id="storyboard" label="3. 分镜设计" icon={Layout} />
                <NavItem id="images" label="4. 画面工坊" icon={ImageIcon} />
                <NavItem id="summary" label="5. 简介摘要" icon={BookOpen} />
                <div className="pt-4 pb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4">封面策划</span>
                </div>
                <NavItem id="cover" label="方案 A (信息型)" icon={Layout} />
                <NavItem id="cover_b" label="方案 B (极简型)" icon={Layout} />
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4">
                <button 
                    onClick={() => handleSave()}
                    disabled={saving}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    保存项目
                </button>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between shrink-0">
                <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                    {selectedNodeId === 'script' && '视频脚本'}
                    {selectedNodeId === 'titles' && '标题策划'}
                    {selectedNodeId === 'storyboard' && '分镜设计'}
                    {selectedNodeId === 'images' && '画面工坊'}
                    {selectedNodeId === 'summary' && '简介摘要'}
                    {selectedNodeId === 'cover' && '封面方案 A'}
                    {selectedNodeId === 'cover_b' && '封面方案 B'}
                </h2>
                <div className="flex gap-3">
                    {selectedNodeId === 'images' ? (
                        <button 
                            onClick={() => navigate(`/project/${project.id}/images`)}
                            className="bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/40 transition-all flex items-center gap-2"
                        >
                            <ImageIcon className="w-4 h-4" /> 进入生图工坊
                        </button>
                    ) : (
                        <button 
                            onClick={() => {
                                if (selectedNodeId === 'script') handleGenerateScript();
                                else if (selectedNodeId === 'titles') handleGenerateTitles();
                                else if (selectedNodeId === 'storyboard') handleGenerateStoryboard();
                                else if (selectedNodeId === 'summary') handleGenerateSummary();
                                else if (selectedNodeId === 'cover') handleGenerateCover('A');
                                else if (selectedNodeId === 'cover_b') handleGenerateCover('B');
                            }}
                            disabled={generating}
                            className="bg-violet-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-violet-500/30 hover:bg-violet-700 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            AI 生成
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto">
                    {selectedNodeId === 'script' && (
                        <div className="space-y-4">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">输入参数</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <input 
                                        value={project.inputs.topic} 
                                        onChange={(e) => updateProject(p => ({...p, inputs: {...p.inputs, topic: e.target.value}}))}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium"
                                        placeholder="主题"
                                    />
                                    <input 
                                        value={project.inputs.tone} 
                                        onChange={(e) => updateProject(p => ({...p, inputs: {...p.inputs, tone: e.target.value}}))}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium"
                                        placeholder="语气"
                                    />
                                </div>
                            </div>
                            <textarea
                                value={project.script || ''}
                                onChange={(e) => updateProject(p => ({...p, script: e.target.value}))}
                                className="w-full h-[600px] bg-white border border-slate-200 rounded-xl p-6 text-slate-800 leading-loose text-base outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm resize-none"
                                placeholder="生成的脚本将显示在这里..."
                            />
                        </div>
                    )}

                    {selectedNodeId === 'titles' && (
                        <div className="space-y-4">
                            {project.titles?.map((t, i) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                                    <span className="text-slate-300 font-bold text-lg w-6 text-center">{i+1}</span>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-lg mb-1">{t.title}</div>
                                        <div className="flex gap-2">
                                            {t.keywords?.split(/[,，]/).map((k, ki) => (
                                                <span key={ki} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{k.trim()}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-violet-600">{t.score}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase">Score</div>
                                    </div>
                                    <RowCopyButton text={t.title} />
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedNodeId === 'storyboard' && (
                        <div className="space-y-6">
                            {project.storyboard?.map((frame, i) => (
                                <div key={frame.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex gap-6">
                                    <div className="w-12 pt-1">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-500 font-bold text-sm">
                                            {frame.sceneNumber}
                                        </span>
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">原文</label>
                                            <p className="text-slate-800 font-medium leading-relaxed">{frame.originalText}</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">画面描述</label>
                                            <textarea 
                                                value={frame.description}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    updateProject(p => ({
                                                        ...p,
                                                        storyboard: p.storyboard?.map(f => f.id === frame.id ? {...f, description: val} : f)
                                                    }))
                                                }}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600 h-24 resize-none outline-none focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedNodeId === 'images' && (
                        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-3xl">
                            <ImageIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-800 mb-2">进入生图工坊</h3>
                            <p className="text-slate-500 mb-8">在专用的工作流中生成、管理和导出分镜画面。</p>
                            <button 
                                onClick={() => navigate(`/project/${project.id}/images`)}
                                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                            >
                                前往工坊 &rarr;
                            </button>
                        </div>
                    )}

                    {selectedNodeId === 'summary' && (
                         <textarea
                            value={project.summary || ''}
                            onChange={(e) => updateProject(p => ({...p, summary: e.target.value}))}
                            className="w-full h-[400px] bg-white border border-slate-200 rounded-xl p-6 text-slate-800 leading-loose text-base outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm resize-none"
                            placeholder="生成的简介和标签..."
                        />
                    )}

                    {(selectedNodeId === 'cover' || selectedNodeId === 'cover_b') && (
                     <div className="space-y-6">
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
                                            
                                            <div className="mb-4">
                                                <p className="text-xs text-slate-600 leading-relaxed">{opt.visual}</p>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">封面文字</p>
                                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 relative group">
                                                    <div className="text-sm font-bold text-slate-800 leading-relaxed text-center font-serif">
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
                </div>
            </main>
        </div>
    </div>
  );
};

export default ProjectWorkspace;
