

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectData } from '../types';
import * as storage from '../services/storageService';
import { Calendar, Loader2, Image as ImageIcon, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

const ImageWorkshopList: React.FC = () => {
  const navigate = useNavigate();
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await storage.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeleteConfirmId(null);
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
        alert("该项目暂无分镜数据，无法进入生图工坊。\n\n请先进入【项目列表】，在画布中生成【分镜文案】。");
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
             <span className="hidden md:inline-block text-[10px] font-bold text-slate-400 tracking-wider bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                {refreshTime}
            </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-fuchsia-500 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
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
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                        <tr>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-20 text-center">序号</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-center">主题</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-36 md:w-48 text-center">生图进度</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-40 text-center hidden md:table-cell">完成日期</th>
                            <th className="py-4 px-6 text-xs font-bold uppercase tracking-wider w-24 text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {projects.map((project, index) => {
                            const progress = getImageProgress(project);
                            const hasStoryboard = !!progress;
                            
                            return (
                                <tr 
                                    key={project.id} 
                                    onClick={() => handleRowClick(project)}
                                    className={`group transition-colors border-b border-slate-50 last:border-0 ${
                                        hasStoryboard 
                                        ? 'hover:bg-fuchsia-50/30 cursor-pointer' 
                                        : 'opacity-60 bg-slate-50/30 cursor-not-allowed grayscale-[0.5]'
                                    }`}
                                >
                                    <td className="py-5 px-6 text-center text-sm font-bold text-slate-400">
                                        {index + 1}
                                    </td>
                                    <td className="py-5 px-6">
                                        <div className="flex flex-col">
                                            <span className={`font-bold text-base md:text-lg transition-colors mb-1 line-clamp-2 md:line-clamp-1 ${hasStoryboard ? 'text-slate-800 group-hover:text-fuchsia-700' : 'text-slate-500'}`}>
                                                {project.title || '未命名项目'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-5 px-6">
                                        {hasStoryboard ? (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                                                    <span>{progress.generated} / {progress.total} 张</span>
                                                    {progress.generated === progress.total && (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                    )}
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            progress.generated === progress.total 
                                                            ? 'bg-emerald-500' 
                                                            : 'bg-gradient-to-r from-fuchsia-500 to-pink-500'
                                                        }`}
                                                        style={{ width: `${(progress.generated / progress.total) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                暂无分镜
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-5 px-6 hidden md:table-cell">
                                        <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
                                            <Calendar className="w-4 h-4 text-slate-300" />
                                            {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                                        </div>
                                    </td>
                                    <td className="py-5 px-6 text-center">
                                        {deleteConfirmId === project.id ? (
                                            <button 
                                                onClick={(e) => handleDelete(e, project.id)}
                                                className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1.5 rounded-lg font-bold hover:bg-rose-100 transition-colors animate-in fade-in duration-200 whitespace-nowrap"
                                                onMouseLeave={() => setDeleteConfirmId(null)}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                确认删除
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteConfirmId(project.id);
                                                }}
                                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                title="删除项目"
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <Trash2 className="w-4.5 h-4.5" />
                                            </button>
                                        )}
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
