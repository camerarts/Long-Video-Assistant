import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Sparkles, ArrowRight, Lock, Play, Layers, 
  Image as ImageIcon, Wand2, Zap, ShieldCheck, X 
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
    <div className={`group relative p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-white/10 transition-all duration-500 hover:-translate-y-2`}>
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
      <div className="relative z-10">
        <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform duration-500">
          <Icon className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-violet-500 selection:text-white font-sans overflow-x-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] left-[20%] w-full h-full bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-8 py-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Video className="text-white w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">长视频助手 <span className="text-violet-500">Pro</span></span>
        </div>
        
        <div className="flex items-center gap-4">
            {isLoggedIn ? (
                <button 
                    onClick={() => navigate('/dashboard')}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-sm font-bold transition-all flex items-center gap-2"
                >
                    进入工作台 <ArrowRight className="w-4 h-4" />
                </button>
            ) : (
                <button 
                    onClick={() => setShowLogin(true)}
                    className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-full text-sm font-bold shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-2"
                >
                    <Lock className="w-3.5 h-3.5" /> 登录访问
                </button>
            )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 pt-20 pb-32 px-6">
        <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-violet-300 mb-8 animate-fade-in-up">
                <Sparkles className="w-3.5 h-3.5" /> AI 驱动的全流程视频生产工作流
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
                从灵感到爆款视频 <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-white">
                    只需一个核心观点
                </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                自动化完成脚本撰写、分镜设计、画面生成与封面策划。
                专为内容创作者打造的智能生产力引擎。
            </p>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                 <button 
                    onClick={() => isLoggedIn ? navigate('/dashboard') : setShowLogin(true)}
                    className="h-14 px-10 bg-white text-slate-950 rounded-full font-bold text-lg hover:bg-slate-100 transition-all flex items-center gap-2 shadow-xl shadow-white/10"
                >
                    {isLoggedIn ? '继续创作' : '立即开始'} <ArrowRight className="w-5 h-5" />
                 </button>
                 <button className="h-14 px-10 bg-white/5 text-white border border-white/10 rounded-full font-bold text-lg hover:bg-white/10 transition-all flex items-center gap-2 backdrop-blur-md">
                    <Play className="w-5 h-5 fill-white" /> 观看演示
                 </button>
            </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="relative z-10 px-6 pb-32">
         <div className="max-w-7xl mx-auto">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <FeatureCard 
                    icon={Wand2} 
                    title="智能脚本生成" 
                    desc="基于Gemini 2.5大模型，深度解析核心观点，自动生成逻辑严密、引人入胜的长视频脚本。" 
                 />
                 <FeatureCard 
                    icon={Layers} 
                    title="分镜自动化" 
                    desc="一键将文案拆解为可视化的分镜描述，精确控制画面构图、光影与运镜方式。" 
                 />
                 <FeatureCard 
                    icon={ImageIcon} 
                    title="批量生图工坊" 
                    desc="集成AI绘图能力，并行生成高分辨率分镜画面，支持16:9电影质感输出。" 
                 />
                 <FeatureCard 
                    icon={Zap} 
                    title="爆款标题策划" 
                    desc="基于全网热门逻辑，智能生成高点击率标题与封面文案，提升视频完播率。" 
                 />
             </div>
         </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12 text-center text-slate-500 text-sm">
         <p>© 2025 Long Video Assistant Pro. Powered by Google Gemini.</p>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowLogin(false)} />
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-10 w-full max-w-md relative shadow-2xl shadow-violet-500/10 animate-in zoom-in-95 duration-200">
                <button 
                    onClick={() => setShowLogin(false)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/20">
                    <ShieldCheck className="w-8 h-8 text-white" />
                </div>
                
                <h2 className="text-2xl font-bold text-center mb-2">欢迎回来</h2>
                <p className="text-slate-400 text-center mb-8 text-sm">请输入访问密码进入私人工作空间</p>

                <form onSubmit={handleLogin} className="space-y-6">
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
                            className={`w-full bg-black/50 border ${error ? 'border-rose-500/50 text-rose-500' : 'border-white/10 focus:border-violet-500'} rounded-xl px-4 py-4 text-center text-lg font-bold tracking-widest outline-none transition-all placeholder:text-slate-600 text-white`}
                        />
                         {error && (
                            <p className="text-rose-500 text-xs font-bold text-center mt-2 animate-pulse">
                                密码错误，请重试
                            </p>
                        )}
                    </div>
                    <button 
                        type="submit"
                        className="w-full py-4 bg-white text-slate-950 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                        立即进入 <ArrowRight className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
