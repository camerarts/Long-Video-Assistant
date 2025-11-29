
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectData, ProjectStatus } from '../types';
import * as storage from '../services/storageService';
import { Calendar, Trash2, Plus, Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';

const ImageWorkshopList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const data = await storage.getProjects();
    setProjects(data.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
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
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-pink-600 mb-2 tracking-tight flex items-center gap-3">
            <ImageIcon className="w-8 h-8 text-fuchsia-600" />
            分镜图片生成工坊
          </h1>
          <p className="text-slate-500 font-medium">选择项目以进入图片生成与管理界面。</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-fuchsia-500 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Sparkles className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">暂无项目</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">请先在项目列表中创建项目，再进行图片生成。</p>
          <button onClick={() => navigate('/')} className="text-fuchsia-600 hover:text-fuchsia-700 font-bold hover:underline decoration-2 underline-offset-4">
            前往项目列表 &rarr;
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-20 text-center">序号</th>
                            <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">主题 / 核心观点</th>
                            <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-32">进度</th>
                            <th className="py-5 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider w-40">完成日期</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {projects.map((project, index) => (
                            <tr 
                                key={project.id} 
                                onClick={() => navigate(`/project/${project.id}/images`)}
                                className="group hover:bg-fuchsia-50/30 transition-colors cursor-pointer"
                            >
                                <td className="py-5 px-6 text-center text-sm font-bold text-slate-400">
                                    {index + 1}
                                </td>
                                <td className="py-5 px-6">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-800 text-lg group-hover:text-fuchsia-700 transition-colors mb-1">
                                            {project.title || '未命名项目'}
                                        </span>
                                        <span className="text-xs text-slate-400 line-clamp-1 max-w-md">
                                            {project.inputs.corePoint || '暂无核心观点描述...'}
                                        </span>
                                    </div>
                                </td>
                                <td className="py-5 px-6">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${getStatusStyle(project.status)}`}>
                                        {getStatusText(project.status)}
                                    </span>
                                </td>
                                <td className="py-5 px-6">
                                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                        <Calendar className="w-4 h-4 text-slate-300" />
                                        {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}
    </div>
  );
};

export default ImageWorkshopList;
