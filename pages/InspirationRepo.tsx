
import React, { useEffect, useState } from 'react';
import { Inspiration } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Lightbulb, Plus, Trash2, Loader2, Sparkles, X, Save, FileSpreadsheet, ArrowLeft, CheckCircle2, Star } from 'lucide-react';

const InspirationRepo: React.FC = () => {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // UI Flow State
  const [viewMode, setViewMode] = useState<'input' | 'single' | 'batch'>('input');
  
  // Form Data
  const [rawContent, setRawContent] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [singleData, setSingleData] = useState<Partial<Inspiration>>({});
  const [batchData, setBatchData] = useState<Partial<Inspiration>[]>([]);

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

  const resetModal = () => {
    setShowModal(false);
    setRawContent('');
    setSingleData({});
    setBatchData([]);
    setViewMode('input');
    setExtracting(false);
  };

  const handleAnalyze = async () => {
    if (!rawContent.trim()) return;

    const rows = rawContent.trim().split('\n').filter(r => r.trim());
    
    // --- Strategy 1: Tab-Separated Values (Standard Excel Copy) ---
    // Check if any row looks like it has tabs (Excel standard)
    if (rows.some(r => r.includes('\t'))) {
        const parsed: Partial<Inspiration>[] = [];
        let startIndex = 0;
        let catIdx = 1; // Default: Index(0), Category(1), Title(2)
        let titleIdx = 2;
        let ratingIdx = 3; // Default Rating index

        // Smart Header Detection
        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const rowStr = rows[i];
            // Check for keywords in the row
            if (rowStr.includes('分类') || rowStr.includes('标题')) {
                const cols = rowStr.split('\t');
                const cIdx = cols.findIndex(c => c.includes('分类'));
                const tIdx = cols.findIndex(c => c.includes('标题'));
                const rIdx = cols.findIndex(c => c.includes('评分'));
                
                if (cIdx !== -1) catIdx = cIdx;
                if (tIdx !== -1) titleIdx = tIdx;
                if (rIdx !== -1) ratingIdx = rIdx;
                
                startIndex = i + 1; // Start data after header
                break;
            }
        }

        for (let i = startIndex; i < rows.length; i++) {
            const cols = rows[i].split('\t').map(c => c.trim());
            
            // Try to map based on indices
            const category = cols[catIdx];
            const title = cols[titleIdx];
            const rating = cols[ratingIdx];

            if (title) {
                parsed.push({
                    category: category || '未分类',
                    viralTitle: title,
                    rating: rating || '',
                    trafficLogic: '', 
                    content: rows[i]
                });
            } else if (startIndex === 0) {
                 // Fallback: No header detected
                 if (cols.length >= 4) {
                     // Assume: Index, Cat, Title, Rating
                     parsed.push({
                        category: cols[1] || '未分类',
                        viralTitle: cols[2],
                        rating: cols[3] || '',
                        trafficLogic: '',
                        content: rows[i]
                    });
                 } else if (cols.length === 2) {
                     // Assume: Category, Title
                     parsed.push({
                        category: cols[0] || '未分类',
                        viralTitle: cols[1],
                        trafficLogic: '',
                        content: rows[i]
                    });
                 }
            }
        }

        if (parsed.length > 0) {
            setBatchData(parsed);
            setViewMode('batch');
            return;
        }
    }

    // --- Strategy 2: Vertical Block (Specific User Format) ---
    // User Format: Index -> Category -> Title -> Rating (4 lines per record)
    if (rows.length >= 4) {
         // Check for headers in first few lines matching user description
         const headerStr = rows.slice(0, 4).join(' ');
         const isVerticalHeader = headerStr.includes('序号') && headerStr.includes('分类') && headerStr.includes('标题');
         
         // If headers detected, start from line 4. If not, assume raw data starts at 0 if pattern matches.
         let startLine = isVerticalHeader ? 4 : 0;
         
         // Check modulo to see if rows allow for a 4-line structure
         // We iterate by 4 lines
         const parsed: Partial<Inspiration>[] = [];
         
         for (let i = startLine; i < rows.length; i += 4) {
            if (i + 3 < rows.length) {
                 // Format:
                 // rows[i] = Index
                 // rows[i+1] = Category
                 // rows[i+2] = Title
                 // rows[i+3] = Rating
                 const cat = rows[i+1].trim();
                 const title = rows[i+2].trim();
                 const rating = rows[i+3].trim();
                 
                 if (title) {
                    parsed.push({
                        category: cat || '未分类',
                        viralTitle: title,
                        rating: rating,
                        content: `${rows[i]} ${cat} ${title} ${rating}`
                    });
                 }
            }
         }

         if (parsed.length > 0) {
            setBatchData(parsed);
            setViewMode('batch');
            return;
        }
    }

    // --- Strategy 3: AI Fallback ---
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

      setSingleData({
        content: rawContent,
        category: result.category,
        trafficLogic: result.trafficLogic,
        viralTitle: result.viralTitle
      });
      setViewMode('single');
    } catch (e) {
      alert("AI 提取失败，请重试或检查内容。如果是批量数据，请确保格式整齐。");
      console.error(e);
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveSingle = async () => {
    if (!singleData.category || !singleData.viralTitle) return;

    const newItem: Inspiration = {
      id: crypto.randomUUID(),
      content: singleData.content || rawContent,
      category: singleData.category || '未分类',
      trafficLogic: singleData.trafficLogic || '',
      viralTitle: singleData.viralTitle || '',
      rating: singleData.rating || '',
      createdAt: Date.now()
    };

    await storage.saveInspiration(newItem);
    setInspirations(prev => [newItem, ...prev]);
    resetModal();
  };

  const handleSaveBatch = async () => {
    if (batchData.length === 0) return;
    
    const newItems: Inspiration[] = batchData.map(item => ({
        id: crypto.randomUUID(),
        content: item.content || '',
        category: item.category || '未分类',
        trafficLogic: '',
        viralTitle: item.viralTitle || '',
        rating: item.rating || '',
        createdAt: Date.now()
    }));

    setInspirations(prev => [...newItems, ...prev]);
    resetModal();

    for (const item of newItems) {
        await storage.saveInspiration(item);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600 mb-2 tracking-tight flex items-center gap-3">
            <Lightbulb className="w-8 h-8 text-amber-500" />
            视频灵感仓库
          </h1>
          <p className="text-slate-500 font-medium">收集灵感，打造爆款选题库。</p>
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
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-20 text-center">序号</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-32">分类</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">标题</th>
                  <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-24 text-center">评分</th>
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
                        <td className="py-5 px-6 font-bold text-slate-800 text-lg relative">
                            {item.viralTitle}
                        </td>
                        <td className="py-5 px-6 text-center">
                            {item.rating && (
                                <span className="inline-flex items-center gap-1 text-sm font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                                    <Star className="w-3 h-3 fill-orange-500" /> {item.rating}
                                </span>
                            )}
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

      {/* Import / Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                {viewMode === 'input' && <><Sparkles className="w-5 h-5 text-amber-500" /> 灵感录入</>}
                {viewMode === 'single' && <><Sparkles className="w-5 h-5 text-amber-500" /> AI 提取结果确认</>}
                {viewMode === 'batch' && <><FileSpreadsheet className="w-5 h-5 text-emerald-500" /> 批量导入确认 ({batchData.length}条)</>}
              </h2>
              <button onClick={resetModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-6 flex-1">
              
              {/* --- VIEW: INPUT --- */}
              {viewMode === 'input' && (
                <div className="space-y-4">
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                      <div className="mt-0.5"><FileSpreadsheet className="w-4 h-4 text-blue-500" /></div>
                      <div className="text-sm text-blue-800">
                          <p className="font-bold mb-1">Excel 智能批量导入</p>
                          <p className="opacity-80">
                            支持直接复制粘贴 Excel 表格内容。推荐格式：<strong>【序号 | 分类 | 标题 | 评分】</strong>。<br/>
                            也支持竖向排列的文本块复制（4行一组）。
                          </p>
                      </div>
                  </div>
                  
                  <textarea
                    autoFocus
                    value={rawContent}
                    onChange={(e) => setRawContent(e.target.value)}
                    className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none resize-none font-mono placeholder:text-slate-400"
                    placeholder={`请粘贴内容，例如：\n序号	分类	标题	评分\n1	健康	早起第一杯水怎么喝...	96`}
                  />
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleAnalyze}
                      disabled={!rawContent.trim() || extracting}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {extracting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> 处理中...</>
                      ) : (
                          <><Sparkles className="w-4 h-4" /> 识别 / 导入</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* --- VIEW: SINGLE REVIEW (AI) --- */}
              {viewMode === 'single' && (
                <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">分类</label>
                        <input 
                            value={singleData.category} 
                            onChange={(e) => setSingleData({...singleData, category: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">评分</label>
                        <input 
                            value={singleData.rating || ''} 
                            onChange={(e) => setSingleData({...singleData, rating: e.target.value})}
                            placeholder="可选"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                        />
                      </div>
                   </div>
                   <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">拟定爆款标题</label>
                        <input 
                            value={singleData.viralTitle} 
                            onChange={(e) => setSingleData({...singleData, viralTitle: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                        />
                   </div>
                   <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">流量逻辑分析</label>
                        <textarea 
                            value={singleData.trafficLogic} 
                            onChange={(e) => setSingleData({...singleData, trafficLogic: e.target.value})}
                            rows={3}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none"
                        />
                   </div>
                   
                   <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
                      <button onClick={() => setViewMode('input')} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                        返回修改
                      </button>
                      <button onClick={handleSaveSingle} className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-colors flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> 确认入库
                      </button>
                   </div>
                </div>
              )}

              {/* --- VIEW: BATCH REVIEW (EXCEL) --- */}
              {viewMode === 'batch' && (
                <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg mb-4 flex items-center gap-2 text-emerald-700 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        成功识别 {batchData.length} 条数据，请确认后导入。
                    </div>
                    
                    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl mb-6 max-h-96">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="sticky top-0 bg-slate-50 z-10">
                                <tr className="border-b border-slate-200">
                                    <th className="p-3 font-bold text-slate-500 w-16 text-center">序号</th>
                                    <th className="p-3 font-bold text-slate-500 w-32">分类</th>
                                    <th className="p-3 font-bold text-slate-500">标题</th>
                                    <th className="p-3 font-bold text-slate-500 w-20 text-center">评分</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {batchData.map((item, i) => (
                                    <tr key={i}>
                                        <td className="p-3 text-center text-slate-400 font-mono">{i + 1}</td>
                                        <td className="p-3 font-bold text-slate-700">{item.category}</td>
                                        <td className="p-3 text-slate-600">{item.viralTitle}</td>
                                        <td className="p-3 text-center font-bold text-orange-500">{item.rating}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex gap-3 mt-auto">
                      <button onClick={() => setViewMode('input')} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> 返回
                      </button>
                      <button onClick={handleSaveBatch} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-colors flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> 确认批量导入 ({batchData.length})
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
