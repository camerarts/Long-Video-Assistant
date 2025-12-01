
import React, { useState, useEffect } from 'react';
import { PromptTemplate } from '../types';
import * as storage from '../services/storageService';
import { Save, RefreshCw, AlertTriangle, ClipboardPaste, Check, Maximize2, X, Loader2 } from 'lucide-react';

const Settings: React.FC = () => {
  const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  
  // Track modified prompts that haven't been saved
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // Define the strict display order
  const ORDERED_KEYS = [
    'SCRIPT',
    'STORYBOARD_TEXT',
    'IMAGE_GEN',
    'TITLES',
    'SUMMARY',
    'COVER_GEN'
  ];

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    const data = await storage.getPrompts();
    setPrompts(data);
  };

  const handleSaveModule = async (key: string) => {
    setLoading(true);
    // Since storage handles the whole object, we save all, but conceptually we are "saving the module"
    // This cleans up the dirty state for this specific module (and technically others if we wanted, but let's be precise or broad)
    await storage.savePrompts(prompts);
    
    // Clear dirty state for all, as the whole state is now persisted
    setDirtyKeys(new Set());
    
    setTimeout(() => {
      setLoading(false);
      setMessage("配置已保存！");
      setTimeout(() => setMessage(null), 3000);
    }, 500);
  };

  const handleReset = async () => {
    if (window.confirm("确定要重置所有提示词为默认值吗？此操作无法撤销。")) {
      await storage.resetPrompts();
      const defaults = await storage.getPrompts();
      setPrompts(defaults);
      setDirtyKeys(new Set());
      setMessage("已恢复默认设置。");
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handlePromptChange = (key: string, value: string) => {
    setPrompts(prev => ({
      ...prev,
      [key]: { ...prev[key], template: value }
    }));
    setDirtyKeys(prev => new Set(prev).add(key));
  };

  const handlePaste = async (key: string) => {
    // Check if API is available
    if (!navigator.clipboard) {
      alert("您的浏览器不支持自动读取剪贴板，请点击文本框后使用 Ctrl+V (或 Cmd+V) 手动粘贴。");
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handlePromptChange(key, text);
        setMessage("已粘贴剪贴板内容");
        setTimeout(() => setMessage(null), 1500);
      } else {
        setMessage("剪贴板似乎是空的");
        setTimeout(() => setMessage(null), 1500);
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      alert("无法访问剪贴板。请确保您已允许浏览器访问剪贴板权限，或者直接在文本框中使用快捷键粘贴。");
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">AI 提示词配置</h1>
          <p className="text-slate-500 font-medium">精细化控制内容生成的每一个环节。</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleReset}
            className="text-slate-500 hover:text-rose-500 px-5 py-2.5 text-sm font-bold transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> 恢复默认
          </button>
        </div>
      </div>

      {message && (
        <div className="fixed bottom-8 right-8 bg-emerald-500 text-white px-8 py-4 rounded-xl shadow-xl animate-fade-in-up z-50 font-bold flex items-center gap-2">
          <Check className="w-5 h-5" />
          {message}
        </div>
      )}

      <div className="space-y-10">
        <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-xl flex gap-4 items-start shadow-sm">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
                <p className="font-bold text-amber-800 text-sm">变量使用指南</p>
                <p className="text-xs text-amber-700/80 leading-relaxed">
                    在提示词中使用 <code>{'{{variable}}'}</code> 语法来插入动态内容。
                    可用变量：<code>topic</code> (主题), <code>corePoint</code> (观点), <code>script</code> (生成的脚本)。
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {ORDERED_KEYS.map((key, index) => {
            const prompt = prompts[key];
            if (!prompt) return null;
            const isDirty = dirtyKeys.has(key);

            return (
              <div key={key} className="bg-white border border-slate-100 rounded-3xl p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative group hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-1 flex flex-col">
                {/* Red Badge Index - Vibrant */}
                <div className="absolute -top-3 -right-3 w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center font-bold shadow-lg shadow-orange-500/30 border-4 border-[#F8F9FC] z-10 text-lg">
                  {index + 1}
                </div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{prompt.name}</h3>
                    <p className="text-xs font-medium text-slate-400 mt-1">{prompt.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    {/* Key Tag */}
                    <span className="text-[10px] font-mono font-bold bg-slate-50 text-slate-400 px-2 py-1 rounded-md border border-slate-100">
                        {key}
                    </span>
                    {/* Paste Button */}
                    <button 
                        onClick={() => handlePaste(key)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-violet-600 transition-colors bg-white hover:bg-violet-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-violet-200 shadow-sm"
                        title="粘贴剪贴板内容"
                    >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>粘贴</span>
                    </button>
                  </div>
                </div>
                
                <div className="relative group/textarea flex-1 mb-4">
                    <textarea
                        value={prompt.template}
                        onChange={(e) => handlePromptChange(key, e.target.value)}
                        className={`w-full h-56 rounded-2xl p-5 font-mono text-xs leading-loose outline-none transition-all resize-none selection:bg-violet-100 ${
                            isDirty 
                            ? 'bg-rose-50 border-2 border-rose-200 text-slate-800 focus:border-rose-400' 
                            : 'bg-[#FAFAFA] border border-slate-200 text-slate-700 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white'
                        }`}
                    />
                    <button 
                        onClick={() => setExpandedKey(key)}
                        className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur text-slate-400 hover:text-violet-600 rounded-lg shadow-sm border border-slate-200 opacity-0 group-hover/textarea:opacity-100 transition-all hover:scale-105"
                        title="全屏编辑"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>

                <div className="pt-2">
                    <button
                        onClick={() => handleSaveModule(key)}
                        className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                            isDirty
                            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                        }`}
                    >
                        {loading && isDirty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isDirty ? '保存配置' : '已是最新'}
                    </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Screen Editor Modal */}
      {expandedKey && prompts[expandedKey] && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-[90vw] h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                            {prompts[expandedKey].name}
                            <span className="text-sm font-medium text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">{expandedKey}</span>
                        </h2>
                    </div>
                    <button onClick={() => setExpandedKey(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 p-6 bg-[#FAFAFA]">
                    <textarea
                        autoFocus
                        value={prompts[expandedKey].template}
                        onChange={(e) => handlePromptChange(expandedKey, e.target.value)}
                        className={`w-full h-full border rounded-2xl p-8 text-slate-800 font-mono text-sm leading-loose focus:ring-0 outline-none transition-all resize-none shadow-sm selection:bg-violet-100 ${
                            dirtyKeys.has(expandedKey)
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-white border-slate-200 focus:border-violet-400'
                        }`}
                        placeholder="输入提示词..."
                    />
                </div>
                <div className="px-8 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                    <button 
                        onClick={() => handlePaste(expandedKey)}
                        className="px-4 py-2 text-slate-500 hover:text-violet-600 font-bold text-sm bg-slate-50 hover:bg-violet-50 rounded-xl transition-colors border border-slate-200 hover:border-violet-200"
                    >
                        <ClipboardPaste className="w-4 h-4 inline mr-1.5" /> 粘贴剪贴板
                    </button>
                    <button 
                        onClick={() => {
                            if (dirtyKeys.has(expandedKey)) {
                                handleSaveModule(expandedKey);
                            }
                            setExpandedKey(null);
                        }}
                        className={`px-6 py-2 font-bold rounded-xl transition-colors shadow-lg ${
                            dirtyKeys.has(expandedKey)
                            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20'
                            : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/10'
                        }`}
                    >
                        {dirtyKeys.has(expandedKey) ? '保存并关闭' : '关闭'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
