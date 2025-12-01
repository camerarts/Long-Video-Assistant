
import React, { useEffect, useState } from 'react';
import { Inspiration, PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Lightbulb, Plus, Trash2, Loader2, Sparkles, X, Save, Copy } from 'lucide-react';

const InspirationRepo: React.FC = () => {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Form State
  const [rawContent, setRawContent] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [formData, setFormData] = useState<Partial<Inspiration>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await storage.getInspirations();
    setInspirations(data.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这条灵感吗？')) {
      await storage.deleteInspiration(id);
      setInspirations(prev => prev.filter(i => i.id !== id));
    }
  };

  const handleExtract = async () => {
    if (!rawContent.trim()) return;
    setExtracting(true);
    
    try {
      const prompts = await storage.getPrompts();
      const template = prompts.INSPIRATION_EXTRACT?.template || '';
      const promptText = template.replace('{{content}}', rawContent);

      const result = await gemini.generateJSON<{category: string, trafficLogic: string, viralTitle: string}>(promptText, {
        type: "OBJECT",
        properties: {
          category: {type: "STRING"},
          trafficLogic: {type: "STRING"},
          viralTitle: {type: "STRING"}
        }
      });

      setFormData({
        content: rawContent,
        category: result.category,
        trafficLogic: result.trafficLogic,
        viralTitle: result.viralTitle
      });
    } catch (e) {
      alert("AI 提取失败，请重试或手动输入。");
      console.error(e);
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.viralTitle) return;

    const newItem: Inspiration = {
      id: crypto.randomUUID(),
      content: rawContent,
      category: formData.category || '未分类',
      trafficLogic: formData.trafficLogic || '',
      viralTitle: formData.viralTitle || '',
      createdAt: Date.now()
    };

    await storage.saveInspiration(newItem);
    setInspirations(prev => [newItem, ...prev]);
    setShowModal(false);
    setRawContent('');
    setFormData({});
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600 mb-2 tracking-tight flex items-center gap-3">
            <Lightbulb className="w-8 h-8 text-amber-500" />
            视频灵感仓库
          </h1>
          <p className="text-slate-500 font-medium">收集碎片化灵感，AI 自动提炼爆款逻辑。</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> 记录新灵感
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-16 text-center">序号</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-32">类目</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-[40%]">流量逻辑</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">拟定爆款标题</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-20 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {inspirations.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-400">
                            暂无灵感，快去记录第一条吧！
                        </td>
                    </tr>
                ) : (
                    inspirations.map((item, index) => (
                    <tr key={item.id} className="group hover:bg-amber-50/30 transition-colors">
                        <td className="py-5 px-6 text-center text-sm font-bold text-slate-400">{index + 1}</td>
                        <td className="py-5 px-6">
                        <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200">
                            {item.category}
                        </span>
                        </td>
                        <td className="py-5 px-6 text-sm text-slate-600 leading-relaxed">{item.trafficLogic}</td>
                        <td className="py-5 px-6 font-bold text-slate-800 relative">
                            {item.viralTitle}
                        </td>
                        <td className="py-5 px-6 text-center">
                        <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                            <Trash2 className="w-4.5 h-4.5" />
                        </button>
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> 灵感提取
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-6">
              {!formData.viralTitle ? (
                // Step 1: Input & Extract
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-700">输入灵感素材 (文本/链接/笔记)</label>
                  <textarea
                    autoFocus
                    value={rawContent}
                    onChange={(e) => setRawContent(e.target.value)}
                    className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none resize-none"
                    placeholder="粘贴刚才看到的好点子..."
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleExtract}
                      disabled={!rawContent.trim() || extracting}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      AI 智能提取关键信息
                    </button>
                  </div>
                </div>
              ) : (
                // Step 2: Review & Save
                <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">类目</label>
                        <input 
                            value={formData.category} 
                            onChange={(e) => setFormData({...formData, category: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">拟定爆款标题</label>
                        <input 
                            value={formData.viralTitle} 
                            onChange={(e) => setFormData({...formData, viralTitle: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                        />
                      </div>
                   </div>
                   <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">流量逻辑分析</label>
                        <textarea 
                            value={formData.trafficLogic} 
                            onChange={(e) => setFormData({...formData, trafficLogic: e.target.value})}
                            rows={3}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none"
                        />
                   </div>
                   
                   <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                        <p className="text-xs text-amber-800 font-mono line-clamp-2 opacity-70">源文本: {rawContent}</p>
                   </div>

                   <div className="flex gap-3 pt-2">
                      <button onClick={() => setFormData({})} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                        返回修改
                      </button>
                      <button onClick={handleSave} className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-colors flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> 确认入库
                      </button>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspirationRepo;
