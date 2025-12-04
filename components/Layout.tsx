
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Video, Plus, Image as ImageIcon, Lightbulb, LogOut, CloudUpload, CloudDownload, Loader2, CheckCircle2, XCircle, Circle, Menu, X, Sparkles, Type } from 'lucide-react';
import * as storage from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
}

type SyncStatus = 'idle' | 'loading' | 'success' | 'error';

interface UploadState {
  projects: SyncStatus;
  images: SyncStatus;
  inspirations: SyncStatus;
  tools: SyncStatus;
  settings: SyncStatus;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState<'upload' | 'download' | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    projects: 'idle',
    images: 'idle',
    inspirations: 'idle',
    tools: 'idle',
    settings: 'idle'
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // New Project Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectTopic, setNewProjectTopic] = useState('');
  const [creating, setCreating] = useState(false);

  const isActive = (path: string) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  // Check if we are in a project context for rendering main area
  const isWorkspace = location.pathname.startsWith('/project/') && !location.pathname.endsWith('/images');

  // Poll for unsaved changes status
  useEffect(() => {
    const checkStatus = () => {
        setHasUnsavedChanges(storage.hasUnsavedChanges());
    };
    checkStatus();
    const interval = setInterval(checkStatus, 1000); // Check every second
    return () => clearInterval(interval);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleCreateClick = () => {
    setNewProjectTopic('');
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTopic.trim()) return;

    setCreating(true);
    try {
        const newId = await storage.createProject(newProjectTopic);
        setShowCreateModal(false);
        setMobileMenuOpen(false);
        navigate(`/project/${newId}`);
    } catch (err) {
        console.error(err);
    } finally {
        setCreating(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      localStorage.removeItem('lva_auth_expiry');
      navigate('/');
    }
  };

  const handleUpload = async () => {
    if (!window.confirm('确定要将所有本地数据上传覆盖到云端吗？')) return;

    setShowUploadModal(true);
    setSyncing('upload');
    setUploadState({ projects: 'loading', images: 'loading', inspirations: 'idle', tools: 'idle', settings: 'idle' });

    try {
        // 1. Upload Projects (Covers Project List & Image List data)
        await storage.uploadProjects();
        setUploadState(prev => ({ ...prev, projects: 'success', images: 'success', inspirations: 'loading' }));
        
        // 2. Upload Inspirations
        await storage.uploadInspirations();
        setUploadState(prev => ({ ...prev, inspirations: 'success', tools: 'loading' }));
        
        // 3. Upload Tools (AI Titles etc.)
        await storage.uploadTools();
        setUploadState(prev => ({ ...prev, tools: 'success', settings: 'loading' }));

        // 4. Upload Prompts
        await storage.uploadPrompts();
        setUploadState(prev => ({ ...prev, settings: 'success' }));

        // Finalize
        storage.updateLastUploadTime();
        
        // Short delay to show completion before closing or reloading
        setTimeout(() => {
            alert('所有数据上传成功！');
            window.location.reload(); 
        }, 500);

    } catch (e: any) {
        console.error(e);
        // Mark currently loading as error
        setUploadState(prev => {
            const next = { ...prev };
            if (next.projects === 'loading') { next.projects = 'error'; next.images = 'error'; }
            if (next.inspirations === 'loading') next.inspirations = 'error';
            if (next.tools === 'loading') next.tools = 'error';
            if (next.settings === 'loading') next.settings = 'error';
            return next;
        });
        alert(`上传过程中发生错误: ${e.message}`);
        setShowUploadModal(false);
        setSyncing(null);
    }
  };

  const handleDownload = async () => {
    if (window.confirm('确定要从云端下载数据吗？这将更新本地的记录。')) {
        setSyncing('download');
        try {
            await storage.downloadAllData();
            alert('数据下载成功！');
            window.location.reload();
        } catch (e: any) {
            console.error(e);
             alert(`下载失败: ${e.message}\n请检查您的网络连接或确认后台 R2 存储桶已正确配置绑定 (BUCKET)。`);
        } finally {
            setSyncing(null);
        }
    }
  };

  const StatusIcon = ({ status }: { status: SyncStatus }) => {
      switch (status) {
          case 'loading': return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
          case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
          case 'error': return <XCircle className="w-5 h-5 text-rose-500" />;
          default: return <Circle className="w-5 h-5 text-slate-200" />;
      }
  };

  return (
    <div className="h-screen flex bg-[#F8F9FC] text-slate-900 font-sans overflow-hidden">
        
      {/* Mobile Menu Toggle Button - Hidden on sm (tablets/landscape phones) and up */}
      <button 
        onClick={() => setMobileMenuOpen(true)}
        className="sm:hidden fixed bottom-6 left-6 z-40 p-3 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-lg text-slate-600 hover:text-violet-600 transition-all active:scale-95"
      >
        <Menu className="w-8 h-8" />
      </button>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div 
            className="fixed inset-0 bg-black/40 z-40 sm:hidden backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* App Sidebar (Global Navigation) - Visible on sm and up */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-20 flex flex-col items-center py-4 border-r border-slate-200/60 bg-white/95 backdrop-blur-md transition-transform duration-300 ease-in-out
        sm:relative sm:translate-x-0 sm:bg-white/80
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile Close Button */}
        <button 
            onClick={() => setMobileMenuOpen(false)}
            className="sm:hidden absolute top-2 right-2 p-2 text-slate-400 hover:text-rose-500 transition-colors"
        >
            <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center mb-4 gap-1 mt-6 sm:mt-0">
            <Link to="/dashboard" className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform duration-300">
              <Video className="text-white w-5 h-5" />
            </Link>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">助手</span>
        </div>

        <nav className="flex-1 flex flex-col gap-2 w-full px-2 items-center">
          
          {/* Big Add Button - High End Gradient */}
          <button
            onClick={handleCreateClick}
            className="w-10 h-10 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all duration-300 group mb-2"
            title="新建项目"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          </button>

          <div className="w-8 h-px bg-slate-100 my-1"></div>

          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 ${
              isActive('/dashboard') 
                ? 'bg-violet-50 text-violet-700 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${isActive('/dashboard') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide scale-90">项目列表</span>
          </Link>
          
          <Link
            to="/images"
            className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 ${
              isActive('/images') 
                ? 'bg-fuchsia-50 text-fuchsia-700 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <ImageIcon className={`w-5 h-5 ${isActive('/images') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide scale-90">生图列表</span>
          </Link>

          <Link
            to="/inspiration"
            className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 ${
              isActive('/inspiration') 
                ? 'bg-amber-50 text-amber-600 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Lightbulb className={`w-5 h-5 ${isActive('/inspiration') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide scale-90">灵感仓库</span>
          </Link>

          <Link
            to="/ai-titles"
            className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 ${
              isActive('/ai-titles') 
                ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Type className={`w-5 h-5 ${isActive('/ai-titles') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide scale-90">AI标题</span>
          </Link>

          <Link
            to="/settings"
            className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 ${
              isActive('/settings') 
                ? 'bg-violet-50 text-violet-700 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Settings className={`w-5 h-5 ${isActive('/settings') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide scale-90">设置</span>
          </Link>

          <div className="mt-auto w-full flex flex-col gap-2 border-t border-slate-100 pt-3">
             <button
                onClick={handleUpload}
                disabled={!!syncing}
                className={`flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 text-slate-100 disabled:opacity-50 ${
                    hasUnsavedChanges
                    ? 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/30 animate-pulse'
                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30'
                }`}
                title={hasUnsavedChanges ? "有未保存的本地数据，请点击上传" : "数据已同步到云端"}
            >
                {syncing === 'upload' ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <CloudUpload className="w-5 h-5 stroke-2" />}
                <span className="text-[10px] font-bold tracking-wide">上传</span>
            </button>
            <button
                onClick={handleDownload}
                disabled={!!syncing}
                className="flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                title="从云端下载数据"
            >
                {syncing === 'download' ? <Loader2 className="w-5 h-5 animate-spin text-emerald-500" /> : <CloudDownload className="w-5 h-5 stroke-2" />}
                <span className="text-[10px] font-bold tracking-wide">下载</span>
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="mb-2 flex flex-col items-center justify-center py-2 px-1 w-full rounded-xl transition-all gap-1 duration-300 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="退出登录"
          >
            <LogOut className="w-5 h-5 stroke-2" />
            <span className="text-[10px] font-bold tracking-wide">退出</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FC] w-full">
        {isWorkspace ? (
          /* Full screen workspace mode */
          <div className="flex-1 h-full overflow-hidden w-full">
            {children}
          </div>
        ) : (
          /* Standard page mode with container */
          <div className="flex-1 overflow-y-auto w-full">
             <div className="container mx-auto px-4 md:px-8 py-6 md:py-10 max-w-7xl">
              {children}
            </div>
          </div>
        )}
      </main>

      {/* Upload Progress Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <CloudUpload className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900">数据上传中</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">请勿关闭页面，正在同步到云端...</p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">项目列表</span>
                        <StatusIcon status={uploadState.projects} />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">生图列表</span>
                        <StatusIcon status={uploadState.images} />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">灵感仓库</span>
                        <StatusIcon status={uploadState.inspirations} />
                    </div>
                     <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">AI工具数据</span>
                        <StatusIcon status={uploadState.tools} />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">系统设置</span>
                        <StatusIcon status={uploadState.settings} />
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                         <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Sparkles className="w-6 h-6 text-white" />
                         </div>
                         <div>
                             <h3 className="text-xl font-extrabold text-slate-900">开启新创作</h3>
                             <p className="text-xs text-slate-500 font-medium">输入主题，立即开始策划</p>
                         </div>
                    </div>
                    <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 p-2 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleConfirmCreate}>
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-600 mb-2">视频主题</label>
                        <input
                            autoFocus
                            required
                            type="text"
                            value={newProjectTopic}
                            onChange={(e) => setNewProjectTopic(e.target.value)}
                            placeholder="例如：2024年人工智能行业发展趋势"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setShowCreateModal(false)}
                            className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={!newProjectTopic.trim() || creating}
                            className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            立即创建
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
