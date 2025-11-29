import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Video, Plus, Image as ImageIcon } from 'lucide-react';
import * as storage from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname === path;

  // Check if we are in a project context
  const projectMatch = location.pathname.match(/\/project\/([^\/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;

  const isWorkspace = location.pathname.startsWith('/project/');

  const handleCreateProject = () => {
    const newId = storage.createProject();
    navigate(`/project/${newId}`);
  };

  return (
    <div className="h-screen flex bg-[#F8F9FC] text-slate-900 font-sans overflow-hidden">
      {/* App Sidebar (Global Navigation) */}
      <aside className="w-24 flex-shrink-0 border-r border-slate-200/60 bg-white/80 backdrop-blur-md flex flex-col items-center py-8 z-30 transition-all duration-300">
        <div className="flex flex-col items-center mb-10 gap-2">
            <Link to="/" className="w-11 h-11 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform duration-300">
              <Video className="text-white w-6 h-6" />
            </Link>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">助手</span>
        </div>

        <nav className="flex-1 flex flex-col gap-5 w-full px-3 items-center">
          
          {/* Big Add Button - High End Gradient */}
          <button
            onClick={handleCreateProject}
            className="w-14 h-14 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all duration-300 group mb-4"
            title="新建项目"
          >
            <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-500" />
          </button>

          <div className="w-8 h-px bg-slate-100 my-2"></div>

          <Link
            to="/"
            className={`flex flex-col items-center justify-center py-3.5 px-2 w-full rounded-2xl transition-all gap-1.5 duration-300 ${
              isActive('/') 
                ? 'bg-violet-50 text-violet-700 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${isActive('/') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide">列表</span>
          </Link>
          
          {/* Show Image Gen button if inside a project */}
          {projectId && (
            <Link
                to={`/project/${projectId}/images`}
                className={`flex flex-col items-center justify-center py-3.5 px-2 w-full rounded-2xl transition-all gap-1.5 duration-300 ${
                isActive(`/project/${projectId}/images`) 
                    ? 'bg-fuchsia-50 text-fuchsia-700 shadow-sm' 
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
                <ImageIcon className={`w-5 h-5 ${isActive(`/project/${projectId}/images`) ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                <span className="text-[10px] font-bold tracking-wide">图片</span>
            </Link>
          )}

          <Link
            to="/settings"
            className={`flex flex-col items-center justify-center py-3.5 px-2 w-full rounded-2xl transition-all gap-1.5 duration-300 ${
              isActive('/settings') 
                ? 'bg-violet-50 text-violet-700 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Settings className={`w-5 h-5 ${isActive('/settings') ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] font-bold tracking-wide">设置</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FC]">
        {isWorkspace ? (
          /* Full screen workspace mode */
          <div className="flex-1 h-full overflow-hidden">
            {children}
          </div>
        ) : (
          /* Standard page mode with container */
          <div className="flex-1 overflow-y-auto">
             <div className="container mx-auto px-8 py-10 max-w-7xl">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Layout;