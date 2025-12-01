import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, ShieldCheck } from 'lucide-react';

const AUTH_KEY = 'lva_auth_expiry';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
const DEFAULT_PASS = '1211';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    const expiry = localStorage.getItem(AUTH_KEY);
    if (expiry && parseInt(expiry) > Date.now()) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === DEFAULT_PASS) {
      const newExpiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(AUTH_KEY, newExpiry.toString());
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  if (loading) return null;

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-10 border border-slate-100 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner text-violet-600">
          <Lock className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">访问验证</h1>
        <p className="text-slate-500 mb-8 font-medium">这是一个私人工作空间，请输入访问密码。</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="输入密码"
              className={`w-full bg-slate-50 border ${error ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200 focus:ring-4 focus:ring-violet-100 focus:border-violet-400'} rounded-xl px-5 py-4 text-center text-lg outline-none transition-all placeholder:text-slate-400 text-slate-800 font-bold tracking-widest`}
            />
          </div>

          {error && (
            <p className="text-rose-500 text-sm font-bold animate-pulse">密码错误，请重试</p>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
          >
            解锁进入 <ArrowRight className="w-5 h-5" />
          </button>
        </form>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>安全会话保持 30 分钟</span>
        </div>
      </div>
    </div>
  );
};

export default AuthGuard;
