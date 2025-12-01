import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import { ArrowLeft, Save } from 'lucide-react';

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    topic: '',
    corePoint: '',
    // Hidden defaults
    audience: '大众',
    duration: '10分钟',
    tone: '信息丰富且引人入胜',
    language: '中文'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const newProject: ProjectData = {
      id: crypto.randomUUID(),
      title: formData.topic || '未命名项目',
      status: ProjectStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inputs: { ...formData }
    };

    storage.saveProject(newProject);
    
    // Simulate a small delay for better UX
    setTimeout(() => {
      setLoading(false);
      navigate(`/project/${newProject.id}`);
    }, 500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button 
        onClick={() => navigate('/dashboard')} 
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> 返回仪表盘
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">创建新项目</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">视频主题</label>
              <input
                required
                name="topic"
                value={formData.topic}
                onChange={handleChange}
                placeholder="例如：人工智能的历史"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">核心观点 / 角度</label>
              <textarea
                required
                name="corePoint"
                value={formData.corePoint}
                onChange={handleChange}
                rows={3}
                placeholder="主要的论点或结论是什么？"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
            >
              {loading ? (
                <>处理中...</>
              ) : (
                <>
                  <Save className="w-5 h-5" /> 创建项目
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProject;
