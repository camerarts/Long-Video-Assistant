
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import { Calendar, Trash2, Plus, Sparkles, Loader2 } from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTime, setRefreshTime] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const data = await storage.getProjects();
    setProjects(data.sort((a, b) => b.updatedAt - a.updatedAt));
    setRefreshTime(`刷新数据时间：${storage.getLastUploadTime()}`);
    setLoading(false);
  };

  // Generate Serial Numbers based on creation date
  const serialMap = useMemo(() => {
    const map = new Map<string, string>();
    // Sort by creation time ascending to assign numbers chronologically
    const sorted = [...projects].sort((a, b) => a.createdAt - b.createdAt);
    const dailyCounts: Record<string, number> = {};

    sorted.forEach(p => {
        const date = new Date(p.createdAt);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        if (!dailyCounts[dateKey]) dailyCounts[dateKey] = 0;
        dailyCounts[dateKey]++;

        const seq = String(dailyCounts[dateKey]).padStart(3, '0');
        map.set(p.id, `[${dateKey}-${seq}]`);
    });
    return map;
  }, [projects]);

  const handleCreate = async () => {
    const newId = await storage.createProject();
    navigate(`/project/${newId}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation(); // Stop row click
    if (window.confirm('确定要删除这个项目吗？')) {
      await storage.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    }
  };

  const isProjectFullyComplete = (p: ProjectData) => {
      const hasScript = !!p.script && p.script.length > 0;
      const hasTitles = !!p.titles && p.titles.length > 0;
      const hasSbText = !!p.storyboard && p.storyboard.length > 0;
      const hasSummary = !!p.summary && p.summary.length > 0;
      const hasCover = !!p.coverOptions && p.coverOptions.length > 0;
      const hasImages = p.storyboard?.some(f => !!f.imageUrl) || false;
      return hasScript && hasTitles && hasSbText && hasSummary && hasCover && hasImages;
  };

  const getEffectiveStatus = (p: ProjectData): ProjectStatus => {
      if (p.status === ProjectStatus.ARCHIVED) return ProjectStatus.ARCHIVED;
      if (isProjectFullyComplete(p)) return ProjectStatus.COMPLETED;
      return p.status;
  };

  const getStatusStyle = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.COMPLETED: return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200';
      case ProjectStatus.IN_PROGRESS: return 'bg-violet-100 text-violet-700 ring-1 ring-violet-200';
      case ProjectStatus.ARCHIVED: return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
      default: return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
    }
  };

  const getStatusText = (status: ProjectStatus) => {
      switch (status) {
        case ProjectStatus.DRAFT: return '草稿';
        case ProjectStatus.IN_PROGRESS: return '进行中';
        case ProjectStatus.COMPLETED: return '已完成';
        case ProjectStatus.ARCHIVED: return '已归档';
        default: return status;
      }
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-0.5 md:mb-2 tracking-tight">项目列表</h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">管理您的长视频创作流水线。</p>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
            <span className="hidden md:inline-block text-[10px] font-bold text-slate-400 tracking-wider bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                {refreshTime}
            </span>
            <button 
              onClick={handleCreate}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-2.5 md:py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 flex items-center justify-center gap-2 w-full md:w-auto text-sm md:text-base"
            >
              <Plus className="w-5 h-5" /> <span className="md:hidden">新建</span><span className="hidden md:inline">新建项目</span>
            </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Sparkles className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">开启您的创作之旅</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">使用AI驱动的工作流，快速将灵感转化为完整的视频策划案。</p>
          <button onClick={handleCreate} className="text-violet-600 hover:text-violet-700 font-bold hover:underline decoration-2 underline-offset-4">
            立即创建第一个项目 &rarr;
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-200">
                    <thead className="bg-slate-50 text-slate-600">
                        <tr>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-16 text-center border border-slate-200">序号</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-40 text-center border border-slate-200">序列号</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider text-center border border-slate-200 min-w-[300px]">主题</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-24 text-center border border-slate-200">进度</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-32 text-center hidden md:table-cell border border-slate-200">创建日期</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-20 text-center border border-slate-200">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map((project, index) => {
                            const status = getEffectiveStatus(project);
                            const serial = serialMap.get(project.id) || '-';
                            return (
                                <tr 
                                    key={project.id} 
                                    onClick={() => navigate(`/project/${project.id}`)}
                                    className="group hover:bg-violet-50/30 transition-colors cursor-pointer"
                                >
                                    <td className="py-2.5 px-3 text-center text-sm font-bold text-slate-400 border border-slate-200 align-middle">
                                        {index + 1}
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 whitespace-nowrap">
                                            {serial}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 border border-slate-200 align-middle">
                                        <div className="font-bold text-slate-800 text-sm md:text-base group-hover:text-violet-700 transition-colors whitespace-normal break-all block h-auto leading-normal">
                                            {project.title || '未命名项目'}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${getStatusStyle(status)}`}>
                                            {getStatusText(status)}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 hidden md:table-cell border border-slate-200 align-middle">
                                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
                                            <Calendar className="w-3.5 h-3.5 text-slate-300" />
                                            {new Date(project.createdAt).toLocaleDateString('zh-CN')}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <button 
                                            onClick={(e) => handleDelete(e, project.id)}
                                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                            title="删除项目"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
