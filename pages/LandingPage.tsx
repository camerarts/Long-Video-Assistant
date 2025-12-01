
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Video, Sparkles, ArrowRight, Lock, 
  Image as ImageIcon, Wand2, Zap, ShieldCheck, X, Layers, Cpu, Radio
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
    <div className="group relative p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-violet-500/50 transition-all duration-500 hover:-translate-y-1 overflow-hidden backdrop-blur-sm">
      {/* Hover Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10 flex flex-col items-start text-left">
        <div className="w-12 h-12 bg-[#1a1a2e] border border-white/10 rounded-xl flex items-center justify-center mb-4 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-500 group-hover:border-violet-500/30">
          <Icon className="w-5 h-5 text-violet-400 group-hover:text-white transition-colors" />
        </div>
        <h3 className="text-base font-bold text-white mb-2 tracking-wide group-hover:text-violet-200 transition-colors">{title}</h3>
        <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-[#050508] text-white font-sans overflow-hidden flex flex-col relative selection:bg-violet-500/30">
      
      {/* --- Sci-Fi Background --- */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep Nebula Glows */}
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-violet-900/20 rounded-full blur-[180px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] bg-indigo-900/10 rounded-full blur-[150px]" />
        
        {/* Subtle Starfield / Noise */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10"></div>
        
        {/* Central Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-transparent to-[#050508]/80"></div>
      </div>

      {/* --- Header / Nav --- */}
      <nav className="relative z-50 px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="relative">
             <div className="absolute inset-0 bg-violet-600 blur-md opacity-50"></div>
             <div className="relative w-10 h-10 bg-black border border-white/10 rounded-lg flex items-center justify-center">
                <Video className="text-white w-5 h-5" />
             </div>
          </div>
          <div className="flex flex-col">
             <span className="text-lg font-bold tracking-tight text-white leading-none">LVA <span className="text-violet-500">PRO</span></span>
             <span className="text-[10px] text-slate-500 tracking-[0.2em] font-medium mt-0.5">GENERATIVE AI</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
            {isLoggedIn ? (
                <button 
                    onClick={() => navigate('/dashboard')}
                    className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-bold transition-all flex items-center gap-2 group text-slate-300 hover:text-white"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    WORKBENCH <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
            ) : (
                <button 
                    onClick={() => setShowLogin(true)}
                    className="px-6 py-2 bg-white text-black hover:bg-violet-50 rounded-full text-xs font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all flex items-center gap-2"
                >
                    <Lock className="w-3 h-3" /> ACCESS
                </button>
            )}
        </div>
      </nav>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col justify-center items-center relative z-10 w-full max-w-7xl mx-auto px-6 gap-16">
        
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto">
            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-violet-300 mb-8 backdrop-blur-md">
                <Radio className="w-3 h-3 animate-pulse" /> SYSTEM ONLINE // GEMINI 2.5 ACTIVE
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-6 leading-none text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50 drop-shadow-2xl">
                FUTURE OF <br/>
                VIDEO CREATION
            </h1>
            
            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-light tracking-wide">
                由下一代大语言模型驱动的智能生产引擎。<br className="hidden md:block"/>
                <span className="text-slate-500">脚本 / 分镜 / 画面 / 策略</span> 一站式自动化生成。
            </p>
        </div>

        {/* Feature Grid */}
        <div className="w-full max-w-6xl">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <FeatureCard 
                    icon={Cpu} 
                    title="核心逻辑解析" 
                    desc="Deep logic analysis for core concepts." 
                 />
                 <FeatureCard 
                    icon={Layers} 
                    title="分镜系统" 
                    desc="Automated storyboard breakdown." 
                 />
                 <FeatureCard 
                    icon={ImageIcon} 
                    title="视觉生成" 
                    desc="High-fidelity image synthesis." 
                 />
                 <FeatureCard 
                    icon={Zap} 
                    title="流量策略" 
                    desc="Viral title & thumbnail optimization." 
                 />
             </div>
        </div>
      </main>

      {/* --- Footer --- */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-slate-600 text-[10px] font-mono uppercase tracking-widest bg-[#050508]/80 backdrop-blur-md">
         <p>System Version 2.0.5 // Powered by Google Cloud Vertex AI</p>
      </footer>

      {/* --- Login Modal --- */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowLogin(false)} />
            <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 w-full max-w-sm relative shadow-[0_0_50px_rgba(139,92,246,0.1)] animate-in zoom-in-95 duration-200">
                <button 
                    onClick={() => setShowLogin(false)}
                    className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-violet-600/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-violet-500/20">
                        <ShieldCheck className="w-6 h-6 text-violet-400" />
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-wide">SECURITY CHECK</h2>
                    <p className="text-slate-500 text-xs mt-1">Authorized Personnel Only</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                         <div className="relative">
                            <input 
                                type="password" 
                                autoFocus
                                placeholder="ACCESS CODE"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(false);
                                }}
                                className={`w-full bg-black border ${error ? 'border-rose-900 text-rose-500' : 'border-white/10 focus:border-violet-500/50'} rounded-lg px-4 py-3 text-center text-base font-mono tracking-[0.2em] outline-none transition-all placeholder:text-slate-700 text-white`}
                            />
                        </div>
                         {error && (
                            <p className="text-rose-500 text-[10px] font-mono text-center animate-pulse">
                                [ERROR] INVALID CREDENTIALS
                            </p>
                        )}
                    </div>
                    <button 
                        type="submit"
                        className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-violet-100 transition-all flex items-center justify-center gap-2 text-xs tracking-widest"
                    >
                        AUTHENTICATE
                    </button>
                </form>
            </div>
        </div>
      )}
      
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.15; transform: scale(1.1); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
