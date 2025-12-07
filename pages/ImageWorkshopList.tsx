
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import { Calendar, Loader2, Image as ImageIcon, AlertCircle, CheckCircle2, Trash2, Archive, Cloud, CloudCheck } from 'lucide-react';

const ImageWorkshopList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Sync Status State
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'synced' | 'error' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState('');

  useEffect(() => {
    initData();
  }, []);

  const initData = async () => {
    setLoading(true);
    // 1. Load Local
    const localData = await storage.getProjects();
    setProjects(localData.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);

    // 2. Sync
    setSyncStatus('saving');
    try {
        await storage.downloadAllData();
        setSyncStatus('synced');
        setLastSyncTime(new Date().toLocaleTimeString());
        
        // 3. Reload
        const syncedData = await storage.getProjects();
        setProjects(syncedData.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (e) {
        console.warn("Auto-sync failed", e);
        setSyncStatus('error');
    }
  };

  // Generate Serial Numbers based on ALL projects
  const serialMap = useMemo(() => {
    const map = new Map<string, string>();
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

  // Filter for display: exclude ARCHIVED projects
  const displayedProjects = useMemo(() => 
    projects.filter(p => p.status !== ProjectStatus.ARCHIVED),
  [projects]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await storage.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeleteConfirmId(null);

    // Auto-upload
    setSyncStatus('saving');
    try {
        await storage.uploadProjects();
        setSyncStatus('synced');
        setLastSyncTime(new Date().toLocaleTimeString());
    } catch(e) {
        setSyncStatus('error');
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (window.confirm('确定要归档此项目吗？归档后项目将移入归档仓库，仅供只读浏览。')) {
          await storage.archiveProject(id);
          // Auto-upload
          setSyncStatus('saving');
          try {
              await storage.uploadProjects();
              setSyncStatus('synced');
              setLastSyncTime(new Date().toLocaleTimeString());
              navigate('/archive');
          } catch(e) {
              setSyncStatus('error');
              // Still navigate as local op succeeded
              navigate('/archive');
          }
      }
  };

  const getImageProgress = (project: ProjectData) => {
    if (!project.storyboard || project.storyboard.length === 0) {
        return null;
    }
    const total = project.storyboard.length;
    const generated = project.storyboard.filter(f => !!f.imageUrl).length;
    return { generated, total };
  };

  const handleRowClick = (project: ProjectData) => {
    if (!project.storyboard || project.storyboard.length === 0) {
        return;
    }
    navigate(`/project/${project.id}/images`);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-pink-600 mb-0.5 md:mb-2 tracking-tight flex items-center gap-2 md:gap-3">
            <ImageIcon className="w-6 h-6 md:w-8 md:h-8 text-fuchsia-600" />
            生图列表
          </h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">查看各项目的生图进度，进入工坊批量生产画面。</p>
        </div>
        <div className="flex flex-col items-end justify-end pb-1">
             {/* Sync Status Badge */}
             <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md border animate-in fade-in transition-colors ${
                syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                syncStatus === 'saving' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                'bg-slate-50 text-slate-400 border-slate-100'
            }`}>
                {syncStatus === 'synced' ? <CloudCheck className="w-3 h-3" /> : 
                 syncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" /> : 
                 syncStatus === 'error' ? <AlertCircle className="w-3 h-3" /> :
                 <Cloud className="w-3 h-3" />}
                
                {syncStatus === 'synced' ? `已同步云端: ${lastSyncTime}` :
                 syncStatus === 'saving' ? '正在同步...' :
                 syncStatus === 'error' ? '同步失败' :
                 '准备就绪'}
            </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-fuchsia-500 animate-spin" />
        </div>
      ) : displayedProjects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <ImageIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">暂无项目</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">请先在项目列表中创建项目并生成分镜。</p>
          <button onClick={() => navigate('/dashboard')} className="text-fuchsia-600 hover:text-fuchsia-700 font-bold hover:underline decoration-2 underline-offset-4">
            前往项目列表 &rarr;
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
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-36 md:w-48 text-center border border-slate-200">生图进度</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-40 text-center hidden md:table-cell border border-slate-200">完成日期</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-24 text-center border border-slate-200">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedProjects.map((project, index) => {
                            const progress = getImageProgress(project);
                            const hasStoryboard = !!progress;
                            const serial = serialMap.get(project.id) || '-';
                            
                            return (
                                <tr 
                                    key={project.id} 
                                    onClick={() => handleRowClick(project)}
                                    className={`group transition-colors ${
                                        hasStoryboard 
                                        ? 'hover:bg-fuchsia-50/30 cursor-pointer' 
                                        : 'opacity-60 bg-slate-50/30 cursor-not-allowed grayscale-[0.5]'
                                    }`}
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
                                        <div className="font-bold text-sm md:text-base text-slate-800 group-hover:text-fuchsia-700 transition-colors whitespace-normal break-all block h-auto leading-normal">
                                            {project.title || '未命名项目'}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 border border-slate-200 align-middle">
                                        {hasStoryboard ? (
                                            <div className="flex flex-col gap-1.5 px-2">
                                                <div className="flex items-center justify-between text-[10px] md:text-xs font-bold text-slate-600">
                                                    <span>{progress.generated} / {progress.total} 张</span>
                                                    {progress.generated === progress.total && (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                    )}
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${progress.generated === progress.total ? 'bg-emerald-500' : 'bg-fuchsia-500'}`}
                                                        style={{ width: `${(progress.generated / progress.total) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center text-slate-400 gap-1">
                                                <AlertCircle className="w-4 h-4" />
                                                <span className="text-xs font-medium">无分镜</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 hidden md:table-cell border border-slate-200 align-middle">
                                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
                                            <Calendar className="w-3.5 h-3.5 text-slate-300" />
                                            {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={(e) => handleArchive(e, project.id)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all"
                                                title="归档项目"
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>
                                            
                                            {deleteConfirmId === project.id ? (
                                                <button 
                                                    onClick={(e) => handleDelete(e, project.id)}
                                                    className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1.5 rounded-lg font-bold hover:bg-rose-100 transition-colors whitespace-nowrap"
                                                    onMouseLeave={() => setDeleteConfirmId(null)}
                                                >
                                                    确认删除?
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(project.id); }}
                                                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                                    title="删除项目"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
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

export default ImageWorkshopList;
