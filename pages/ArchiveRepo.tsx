
import React, { useEffect, useState, useMemo } from 'react';
import { ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import { Calendar, Trash2, Loader2, Archive, ArchiveRestore, CheckCircle2, AlertCircle } from 'lucide-react';

const ArchiveRepo: React.FC = () => {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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

  // Generate Serial Numbers based on ALL projects to maintain consistency
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

  // Filter for display: Only ARCHIVED projects
  const archivedProjects = useMemo(() => 
    projects.filter(p => p.status === ProjectStatus.ARCHIVED),
  [projects]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await storage.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeleteConfirmId(null);
  };

  const handleUnarchive = async (id: string) => {
      if (window.confirm('确定要撤销归档，将项目恢复到项目列表吗？')) {
          await storage.unarchiveProject(id);
          // Refresh list locally
          setProjects(prev => prev.map(p => 
              p.id === id ? { ...p, status: ProjectStatus.IN_PROGRESS } : p
          ));
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

  const getStatusText = (status: ProjectStatus) => {
      // In archive, the effective status is ARCHIVED, but we might want to show what it was?
      // For now, prompt asks for "Project Progress", let's use the standard completion logic
      // to imply what stage it was at, OR just "Completed/In Progress" text even if archived.
      // However, visually it is archived.
      // Let's stick to simple text
      return '已归档';
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-24 md:pb-0">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-slate-400 mb-0.5 md:mb-2 tracking-tight flex items-center gap-2 md:gap-3">
            <Archive className="w-6 h-6 md:w-8 md:h-8 text-slate-500" />
            归档仓库
          </h1>
          <p className="text-xs md:text-base text-slate-500 font-medium">查看已完成并归档的项目，归档项目仅供只读浏览。</p>
        </div>
        <div className="flex flex-col items-end justify-end pb-1">
             <span className="hidden md:inline-block text-[10px] font-bold text-slate-400 tracking-wider bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                {refreshTime}
            </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
        </div>
      ) : archivedProjects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Archive className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">暂无归档项目</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            当项目制作完成后，您可以在生图列表中将其归档，以保持工作台整洁。
          </p>
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
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-24 text-center border border-slate-200">项目进度</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-36 text-center border border-slate-200">生图进度</th>
                            <th className="py-2 px-3 text-xs font-bold uppercase tracking-wider w-32 text-center border border-slate-200">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {archivedProjects.map((project, index) => {
                            const progress = getImageProgress(project);
                            const hasStoryboard = !!progress;
                            const serial = serialMap.get(project.id) || '-';
                            
                            return (
                                <tr 
                                    key={project.id} 
                                    className="hover:bg-slate-50 transition-colors"
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
                                        <div className="font-bold text-sm text-slate-600 whitespace-normal break-all block h-auto leading-normal">
                                            {project.title || '未命名项目'}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                            {getStatusText(project.status)}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 border border-slate-200 align-middle">
                                         {hasStoryboard ? (
                                            <div className="flex flex-col gap-1.5 px-2">
                                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                                                    <span>{progress.generated} / {progress.total} 张</span>
                                                    {progress.generated === progress.total && (
                                                        <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                                    )}
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                                                    <div 
                                                        className="h-full rounded-full bg-slate-400"
                                                        style={{ width: `${(progress.generated / progress.total) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center text-slate-300 gap-1">
                                                <AlertCircle className="w-4 h-4" />
                                                <span className="text-[10px]">无分镜</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center border border-slate-200 align-middle">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => handleUnarchive(project.id)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all"
                                                title="撤销归档 (恢复到项目列表)"
                                            >
                                                <ArchiveRestore className="w-4 h-4" />
                                            </button>
                                            
                                            {deleteConfirmId === project.id ? (
                                                <button 
                                                    onClick={(e) => handleDelete(e, project.id)}
                                                    className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded font-bold hover:bg-rose-100 transition-colors whitespace-nowrap"
                                                    onMouseLeave={() => setDeleteConfirmId(null)}
                                                >
                                                    确认删除?
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(project.id); }}
                                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                                    title="永久删除"
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

export default ArchiveRepo;
