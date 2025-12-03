

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inspiration, ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import * as gemini from '../services/geminiService';
import { Lightbulb, Plus, Trash2, Loader2, Sparkles, X, Save, FileSpreadsheet, ArrowLeft, CheckCircle2, Star, ArrowUpDown, ArrowUp, ArrowDown, Rocket, CheckSquare, Square, Filter, Download } from 'lucide-react';

const InspirationRepo: React.FC = () => {
  const navigate = useNavigate();
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [refreshTime, setRefreshTime] = useState('');
  
  // Sorting State - Initialize from localStorage if available
  const [sortConfig, setSortConfig] = useState<{ key: 'rating' | 'createdAt'; direction: 'asc' | 'desc' }>(() => {
    try {
        const saved = localStorage.getItem('lva_inspiration_sort');
        if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { key: 'createdAt', direction: 'desc' };
  });

  // Filtering State
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // UI Flow State
  const [viewMode, setViewMode] = useState<'input' | 'single' | 'batch'>('input');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form Data
  const [rawContent, setRawContent] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [singleData, setSingleData] = useState<Partial<Inspiration>>({});
  const [batchData, setBatchData] = useState<Partial<Inspiration>[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Persist sort config whenever it changes
  useEffect(() => {
    localStorage.setItem('lva_inspiration_sort', JSON.stringify(sortConfig));
  }, [sortConfig]);

  const loadData = async () => {
    setLoading(true);
    const data = await storage.getInspirations();
    setInspirations(data);
    setRefreshTime(`刷新数据时间：${storage.getLastUploadTime()}`);
    setLoading(false);
  };

  // Extract unique categories for filter dropdown
  const uniqueCategories = useMemo(() => {
    const categories = new Set(inspirations.map(i => i.category).filter(c => c && c !== '未分类'));
    return Array.from(categories).sort();
  }, [inspirations]);

  // Filtering & Sorting Logic
  const sortedInspirations = useMemo(() => {
    let data = [...inspirations];

    // 1. Filter
    if (selectedCategory !== 'ALL') {
        data = data.filter(i => i.category === selectedCategory);
    }

    // 2. Sort
    data.sort((a, b) => {
        if (sortConfig.key === 'rating') {
            const rateA = parseFloat(a.rating || '0');
            const rateB = parseFloat(b.rating || '0');
            if (rateA === rateB) return 0;
            return sortConfig.direction === 'asc' ? rateA - rateB : rateB - rateA;
        } else {
            // Default: Created At
            return sortConfig.direction === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
        }
    });
    return data;
  }, [inspirations, sortConfig, selectedCategory]);

  const handleSort = (key: 'rating' | 'createdAt') => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const handleDelete = async (id: string) => {
    await storage.deleteInspiration(id);
    setInspirations(prev => prev.filter(i => i.id !== id));
    setDeleteConfirmId(null);
  };

  const handleToggleMark = async (item: Inspiration) => {
    const updated = { ...item, marked: !item.marked };
    // Optimistic update
    setInspirations(prev => prev.map(i => i.id === item.id ? updated : i));
    await storage.saveInspiration(updated);
  };

  const handleApprove = async (item: Inspiration) => {
    // Create a new project based on this inspiration
    const newId = crypto.randomUUID();
    const titleSnippet = item.viralTitle.length > 20 ? item.viralTitle.substring(0, 20) + '...' : item.viralTitle;
    
    const newProject: ProjectData = {
      id: newId,
      title: titleSnippet,
      status: ProjectStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inputs: {
        topic: item.viralTitle, // Auto-fill
        tone: '信息丰富且引人入胜',
        language: '中文'
      }
    };

    await storage.saveProject(newProject);
    navigate(`/project/${newId}`);
  };

  const handleDownloadExcel = () => {
    if (sortedInspirations.length === 0) {
        alert("暂无数据可导出");
        return;
    }

    // Add BOM for Excel UTF-8 compatibility
    let csvContent = "\uFEFF"; 
    
    // Headers: Index, Category, Title, Score
    csvContent += "序号,分类,标题,得分\n";
    
    sortedInspirations.forEach((item, index) => {
        const row = [
            index + 1,
            `"${(item.category || '').replace(/"/g, '""')}"`,
            `"${(item.viralTitle || '').replace(/"/g, '""')}"`,
            `"${(item.rating || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `灵感仓库_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    if (rows.some(r => r.includes('\t'))) {
        const parsed: Partial<Inspiration>[] = [];
        let startIndex = 0;
        let catIdx = 1; 
        let titleIdx = 2;
        let ratingIdx = 3;

        // Smart Header Detection
        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const rowStr = rows[i];
            if (rowStr.includes('分类') || rowStr.includes('标题')) {
                const cols = rowStr.split('\t');
                const cIdx = cols.findIndex(c => c.includes('分类'));
                const tIdx = cols.findIndex(c => c.includes('标题'));
                const rIdx = cols.findIndex(c => c.includes('评分'));
                
                if (cIdx !== -1) catIdx = cIdx;
                if (tIdx !== -1) titleIdx = tIdx;
                if (rIdx !== -1) ratingIdx = rIdx;
                
                startIndex = i + 1; 
                break;
            }
        }

        for (let i = startIndex; i < rows.length; i++) {
            const cols = rows[i].split('\t').map(c => c.trim());
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
                 // Fallback strategies
                 if (cols.length >= 4) {
                     parsed.push({
                        category: cols[1] || '未分类',
                        viralTitle: cols[2],
                        rating: cols[3] || '',
                        trafficLogic: '',
                        content: rows[i]
                    });
                 } else if (cols.length === 2) {
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
    if (rows.length >= 3) {
        // Check for headers in the first few lines
        const headerRange = rows.slice(0, 10).join(' ');
        const hasRating = headerRange.includes('评分');
        const blockSize = hasRating ? 4 : 3;
        
        // Find where the data starts (skip headers)
        let startIndex = -1;
        for(let i=0; i<rows.length; i++) {
            if (/^\d+$/.test(rows[i])) {
                startIndex = i;
                break;
            }
        }

        if (startIndex !== -1) {
             const parsed: Partial<Inspiration>[] = [];
             
             for (let i = startIndex; i < rows.length; i += blockSize) {
                // Ensure we have enough lines for a full block
                if (i + (blockSize - 1) < rows.length) {
                     const category = rows[i+1];
                     const title = rows[i+2];
                     const rating = hasRating ? rows[i+3] : '';
                     
                     if (title && !/^\d+$/.test(title)) {
                        parsed.push({
                            category: category,
                            viralTitle: title,
                            rating: rating,
                            content: rows.slice(i, i+blockSize).join(' | ')
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
    <div className="space-y-6 md:space-y-8 h-full flex flex-col pb-24 md:pb-0">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600 mb-0.5 md:mb-2 tracking-tight flex items-center gap-2 md:gap-3">
            <Lightbulb className="w-6 h-6 md:w-8 md:h-8 text-amber-500" />
            视频灵感仓库
          </h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">收集灵感，打造爆款选题库。</p>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
            <span className="hidden md:inline-block text-[10px] font-bold text-slate-400 tracking-wider bg-slate-50 px-2 py-1 rounded-md border border-slate-100 text-right">
                {refreshTime}
            </span>
            <div className="flex gap-2 md:gap-3">
                <button 
                    onClick={handleDownloadExcel}
                    className="flex-1 md:flex-none justify-center bg-white border border-slate-200 text-slate-600 hover:text-amber-600 hover:border-amber-200 px-4 py-2.5 md:py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 text-sm"
                >
                    <Download className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden md:inline">导出表格</span><span className="md:hidden">导出</span>
                </button>
                <button 
                    onClick={() => setShowModal(true)}
                    className="flex-1 md:flex-none justify-center bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-all hover:-translate-y-0.5 text-sm"
                >
                    <Plus className="w-4 h-4 md:w-5 md:h-5" /> <span className="md:inline">记录新灵感</span><span className="md:hidden">新灵感</span>
                </button>
            </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] overflow-hidden flex-1 flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 border-b border-slate-200 z-10">
                <tr>
                  <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-16 text-center">#</th>
                  <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-48 text-center relative group">
                     {/* Category Header with Filter Dropdown */}
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowCategoryFilter(!showCategoryFilter); }}
                        className={`flex items-center justify-center gap-1 mx-auto transition-colors ${selectedCategory !== 'ALL' ? 'text-amber-600 font-extrabold' : 'hover:text-slate-800'}`}
                        title="点击筛选分类"
                     >
                        {selectedCategory === 'ALL' ? '分类' : selectedCategory}
                        <Filter className={`w-3 h-3 ${selectedCategory !== 'ALL' ? 'fill-amber-600' : ''}`} />
                     </button>
                     
                     {showCategoryFilter && (
                        <>
                            <div className="fixed inset-0 z-10 cursor-default" onClick={() => setShowCategoryFilter(false)} />
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden text-left py-1 animate-in fade-in zoom-in-95 duration-200">
                                <div 
                                    onClick={() => { setSelectedCategory('ALL'); setShowCategoryFilter(false); }}
                                    className={`px-4 py-2.5 text-xs font-bold hover:bg-slate-50 cursor-pointer ${selectedCategory === 'ALL' ? 'text-amber-600 bg-amber-50' : 'text-slate-600'}`}
                                >
                                    全部全类
                                </div>
                                {uniqueCategories.map(cat => (
                                    <div 
                                        key={cat}
                                        onClick={() => { setSelectedCategory(cat); setShowCategoryFilter(false); }}
                                        className={`px-4 py-2.5 text-xs font-bold hover:bg-slate-50 cursor-pointer truncate ${selectedCategory === cat ? 'text-amber-600 bg-amber-50' : 'text-slate-600'}`}
                                        title={cat}
                                    >
                                        {cat}
                                    </div>
                                ))}
                            </div>
                        </>
                     )}
                  </th>
                  <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-center">标题</th>
                  <th 
                    className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-28 text-center cursor-pointer hover:bg-slate-200/50 transition-colors select-none group"
                    onClick={() => handleSort('rating')}
                  >
                    <div className="flex items-center justify-center gap-1">
                        评分 
                        {sortConfig.key === 'rating' ? (
                            sortConfig.direction === 'desc' ? <ArrowDown className="w-3 h-3 text-orange-500"/> : <ArrowUp className="w-3 h-3 text-orange-500"/>
                        ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                        )}
                    </div>
                  </th>
                  <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider w-56 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedInspirations.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-400">
                            {inspirations.length === 0 ? "暂无灵感，快去记录第一条吧！" : "没有符合当前筛选条件的灵感。"}
                        </td>
                    </tr>
                ) : (
                    sortedInspirations.map((item, index) => (
                    <tr 
                        key={item.id} 
                        className={`group transition-colors ${item.marked ? 'bg-emerald-50 hover:bg-emerald-100/60' : 'hover:bg-amber-50/30'}`}
                    >
                        <td className="py-3 px-4 text-center text-xs font-bold text-slate-400">{index + 1}</td>
                        <td className="py-3 px-4">
                            <div className={`font-bold text-[10px] leading-snug line-clamp-1 ${item.marked ? 'text-emerald-800' : 'text-slate-800'}`}>
                                {item.category}
                            </div>
                        </td>
                        <td className="py-3 px-4">
                            <div className={`font-bold text-sm leading-snug transition-colors line-clamp-2 md:line-clamp-none ${item.marked ? 'text-emerald-800' : 'text-slate-800'}`}>
                                {item.viralTitle}
                            </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                            {item.rating && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-md border border-orange-100">
                                    <Star className="w-3 h-3 fill-orange-500 text-orange-500" /> {item.rating}
                                </span>
                            )}
                        </td>
                        <td className="py-3 px-4 text-right pr-6">
                            <div className="flex items-center justify-center gap-3">
                                <button 
                                    onClick={() => handleApprove(item)}
                                    className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-1.5 whitespace-nowrap"
                                    title="采纳此灵感并创建新项目"
                                >
                                    <Rocket className="w-3 h-3" /> <span className="hidden lg:inline">采纳批准</span>
                                </button>
                                
                                <div className="w-px h-4 bg-slate-200"></div>

                                {/* Marking/Selection Toggle */}
                                <button
                                    onClick={() => handleToggleMark(item)}
                                    className={`p-1.5 rounded-lg transition-all ${
                                        item.marked 
                                        ? 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200' 
                                        : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
                                    }`}
                                    title={item.marked ? "取消标记" : "标记为已处理"}
                                >
                                    {item.marked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                </button>

                                {deleteConfirmId === item.id ? (
                                    <button 
                                        onClick={() => handleDelete(item.id)}
                                        className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1.5 rounded-lg font-bold hover:bg-rose-100 transition-colors animate-in fade-in duration-200 whitespace-nowrap"
                                        onMouseLeave={() => setDeleteConfirmId(null)}
                                    >
                                        删除?
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => setDeleteConfirmId(item.id)}
                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                        title="删除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
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

            <div className="p-8 overflow-y-auto bg-slate-50/30 flex-1">
              {viewMode === 'input' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
                    <strong>智能识别模式：</strong><br/>
                    1. 直接粘贴 Excel/表格 复制的内容（支持包含分类、标题、评分的列）。<br/>
                    2. 粘贴一段杂乱的文本（如文章、笔记），AI 将自动提取分类和爆款标题。<br/>
                    3. 粘贴自定义格式文本块。
                  </div>
                  <textarea
                    autoFocus
                    value={rawContent}
                    onChange={(e) => setRawContent(e.target.value)}
                    rows={10}
                    placeholder="在此粘贴灵感内容..."
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none shadow-sm"
                  />
                </div>
              )}

              {viewMode === 'single' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">分类 (Category)</label>
                    <input 
                        value={singleData.category || ''}
                        onChange={(e) => setSingleData({...singleData, category: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">爆款标题 (Viral Title)</label>
                    <input 
                        value={singleData.viralTitle || ''}
                        onChange={(e) => setSingleData({...singleData, viralTitle: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">流量逻辑 (Logic)</label>
                    <textarea 
                        value={singleData.trafficLogic || ''}
                        onChange={(e) => setSingleData({...singleData, trafficLogic: e.target.value})}
                        rows={3}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600"
                    />
                  </div>
                </div>
              )}

              {viewMode === 'batch' && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-500 mb-2">即将导入以下数据，请确认：</p>
                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2">分类</th>
                                    <th className="px-3 py-2">标题</th>
                                    <th className="px-3 py-2">评分</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {batchData.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-3 py-2 text-slate-600">{item.category}</td>
                                        <td className="px-3 py-2 font-medium text-slate-800">{item.viralTitle}</td>
                                        <td className="px-3 py-2 text-orange-600">{item.rating}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
              )}
            </div>

            <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-end gap-3">
              {viewMode === 'input' ? (
                <button
                  onClick={handleAnalyze}
                  disabled={!rawContent.trim() || extracting}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  智能解析
                </button>
              ) : viewMode === 'single' ? (
                 <button
                  onClick={handleSaveSingle}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> 保存灵感
                </button>
              ) : (
                <button
                  onClick={handleSaveBatch}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> 确认导入 ({batchData.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspirationRepo;
