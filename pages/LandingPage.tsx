
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Sparkles, ArrowRight, Lock, 
  Image as ImageIcon, Wand2, Zap, ShieldCheck, X, Layers 
} from 'lucide-react';

const AUTH_KEY = 'lva_auth_expiry';
const SESSION_DURATION = 3 * 60 * 60 * 1000; // 3 hours
const DEFAULT_PASS = '1211';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const expiry = localStorage.getItem(AUTH_KEY);
    if (expiry && parseInt(expiry) > Date.now()) {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === DEFAULT_PASS) {
      const newExpiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(AUTH_KEY, newExpiry.toString());
      navigate('/dashboard');
    } else {
      setError(true);
      setPassword('');
    }
  };

  const FeatureCard = ({ icon: Icon, title, desc }: any) => (
    <div className="group relative p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-white/10 transition-all duration-500">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform duration-500">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-white mb-1.5">{title}</h3>
        <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#020617] text-white selection:bg-violet-500 selection:text-white font-sans overflow-hidden flex flex-col relative">
      {/* Tech Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] bg-violet-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] bg-indigo-900/20 rounded-full blur-[120px]" />
        {/* Horizontal Lines */}
        <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        {/* Vertical Lines */}
        <div className="absolute top-0 left-1/4 h-full w-px bg-gradient-to-b from-transparent via-white/5 to-transparent"></div>
        <div className="absolute top-0 right-1/4 h-full w-px bg-gradient-to-b from-transparent via-white/5 to-transparent"></div>
        {/* Radial Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-8 py-5 flex justify-between items-center max-w-7xl mx-auto w-full border-b border-white/5 bg-[#020617]/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Video className="text-white w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight">长视频助手 <span className="text-violet-500">Pro</span></span>
        </div>
        
        <div className="flex items-center gap-4">
            {isLoggedIn ? (
                <button 
                    onClick={() => navigate('/dashboard')}
                    className="px-5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-xs font-bold transition-all flex items-center gap-2"
                >
                    进入工作台 <ArrowRight className="w-3.5 h-3.5" />
                </button>
            ) : (
                <button 
                    onClick={() => setShowLogin(true)}
                    className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-full text-xs font-bold shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-2"
                >
                    <Lock className="w-3 h-3" /> 登录访问
                </button>
            )}
        </div>
      </nav>

      {/* Main Content Area - Flex Center */}
      <main className="flex-1 flex flex-col justify-center items-center relative z-10 w-full max-w-7xl mx-auto px-6 gap-12">
        
        {/* Hero Text */}
        <div className="text-center max-w-4xl mx-auto relative">
            {/* Decor Line */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-px h-12 bg-gradient-to-b from-transparent to-violet-500/50"></div>
            
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-violet-300 mb-6 animate-fade-in-up">
                <Sparkles className="w-3 h-3" /> AI 驱动的全流程视频生产工作流
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
                从灵感到爆款视频 <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-white">
                    只需一个核心观点
                </span>
            </h1>
            
            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                自动化完成脚本撰写、分镜设计、画面生成与封面策划。
                <br className="hidden md:block" />专为内容创作者打造的智能生产力引擎。
            </p>
        </div>

        {/* Feature Grid - Compressed */}
        <div className="w-full">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <FeatureCard 
                    icon={Wand2} 
                    title="智能脚本生成" 
                    desc="深度解析核心观点，自动生成逻辑严密脚本。" 
                 />
                 <FeatureCard 
                    icon={Layers} 
                    title="分镜自动化" 
                    desc="一键拆解画面描述，精确控制构图与运镜。" 
                 />
                 <FeatureCard 
                    icon={ImageIcon} 
                    title="批量生图工坊" 
                    desc="集成AI绘图能力，并行生成高分辨率画面。" 
                 />
                 <FeatureCard 
                    icon={Zap} 
                    title="爆款标题策划" 
                    desc="基于热门逻辑，智能生成高点击率标题封面。" 
                 />
             </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-slate-600 text-xs bg-[#020617]/50 backdrop-blur-sm">
         <p>© 2025 Long Video Assistant Pro. Powered by Google Gemini.</p>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowLogin(false)} />
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-sm relative shadow-2xl shadow-violet-500/10 animate-in zoom-in-95 duration-200">
                <button 
                    onClick={() => setShowLogin(false)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/20">
                    <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                
                <h2 className="text-xl font-bold text-center mb-1">欢迎回来</h2>
                <p className="text-slate-400 text-center mb-6 text-xs">请输入访问密码进入私人工作空间</p>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <input 
                            type="password" 
                            autoFocus
                            placeholder="输入密码"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError(false);
                            }}
                            className={`w-full bg-black/50 border ${error ? 'border-rose-500/50 text-rose-500' : 'border-white/10 focus:border-violet-500'} rounded-xl px-4 py-3 text-center text-base font-bold tracking-widest outline-none transition-all placeholder:text-slate-600 text-white`}
                        />
                         {error && (
                            <p className="text-rose-500 text-[10px] font-bold text-center mt-2 animate-pulse">
                                密码错误，请重试
                            </p>
                        )}
                    </div>
                    <button 
                        type="submit"
                        className="w-full py-3 bg-white text-slate-950 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        立即进入 <ArrowRight className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
