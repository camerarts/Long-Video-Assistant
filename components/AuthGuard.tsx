
import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, ShieldCheck, Home, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AUTH_KEY = 'lva_auth_expiry';
const ATTEMPTS_KEY = 'lva_login_attempts';
const LOCKOUT_KEY = 'lva_lockout_date';
const SESSION_DURATION = 3 * 60 * 60 * 1000; // 3 hours
const DEFAULT_PASS = '1211';
const SUPER_PASS = 'samsung1';
const MAX_ATTEMPTS = 3;

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    checkLockout();
  }, []);

  const checkLockout = () => {
    const lockoutDate = localStorage.getItem(LOCKOUT_KEY);
    const today = new Date().toDateString();

    if (lockoutDate === today) {
      setIsLocked(true);
      setErrorMsg('今日尝试次数过多，已被禁止登录。');
    } else if (lockoutDate && lockoutDate !== today) {
      // New day, reset
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.setItem(ATTEMPTS_KEY, '0');
      setIsLocked(false);
    }
  };

  const checkAuth = () => {
    const expiry = localStorage.getItem(AUTH_KEY);
    if (expiry && parseInt(expiry) > Date.now()) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // 1. Super Password Bypass (Always allows login, resets locks)
    if (password === SUPER_PASS) {
      const newExpiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(AUTH_KEY, newExpiry.toString());
      
      // Reset security counters
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.setItem(ATTEMPTS_KEY, '0');
      
      setIsAuthenticated(true);
      return;
    }

    // 2. Check Lockout Status
    const lockoutDate = localStorage.getItem(LOCKOUT_KEY);
    const today = new Date().toDateString();
    if (lockoutDate === today) {
      setIsLocked(true);
      setErrorMsg('今日尝试次数过多，账号已被锁定，请明日再试。');
      return;
    }

    // 3. Validate Normal Password
    if (password === DEFAULT_PASS) {
      const newExpiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(AUTH_KEY, newExpiry.toString());
      // Reset attempts on success
      localStorage.setItem(ATTEMPTS_KEY, '0');
      setIsAuthenticated(true);
    } else {
      // Handle Failure
      const currentAttempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0') + 1;
      localStorage.setItem(ATTEMPTS_KEY, currentAttempts.toString());
      
      if (currentAttempts >= MAX_ATTEMPTS) {
        localStorage.setItem(LOCKOUT_KEY, today);
        setIsLocked(true);
        setErrorMsg('密码错误次数过多，今日已禁止登录。');
      } else {
        const remaining = MAX_ATTEMPTS - currentAttempts;
        setErrorMsg(`密码错误。还剩 ${remaining} 次机会。`);
      }
      setPassword('');
    }
  };

  if (loading) return null;

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-10 border border-slate-100 text-center relative">
        <button 
            onClick={() => navigate('/')}
            className="absolute top-6 left-6 text-slate-400 hover:text-slate-600 transition-colors"
            title="返回首页"
        >
            <Home className="w-5 h-5" />
        </button>

        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ${isLocked ? 'bg-rose-100 text-rose-600' : 'bg-gradient-to-br from-violet-100 to-indigo-50 text-violet-600'}`}>
          {isLocked ? <AlertTriangle className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
        </div>
        
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">{isLocked ? '访问受限' : '访问验证'}</h1>
        <p className="text-slate-500 mb-8 font-medium">
            {isLocked ? '为了安全起见，您的访问已被暂时阻止。' : '这是一个私人工作空间，请输入访问密码。'}
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
              placeholder={isLocked ? "今日已锁定" : "输入密码"}
              className={`w-full bg-slate-50 border ${errorMsg ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200 focus:ring-4 focus:ring-violet-100 focus:border-violet-400'} rounded-xl px-5 py-4 text-center text-lg outline-none transition-all placeholder:text-slate-400 text-slate-800 font-bold tracking-widest`}
            />
          </div>

          {errorMsg && (
            <p className="text-rose-500 text-sm font-bold animate-pulse">{errorMsg}</p>
          )}

          <button
            type="submit"
            className={`w-full py-4 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                isLocked 
                ? 'bg-slate-400 text-white hover:bg-slate-500' 
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5'
            }`}
          >
            {isLocked ? '尝试解锁' : '解锁进入'} {!isLocked && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>安全会话保持 3 小时</span>
        </div>
      </div>
    </div>
  );
};

export default AuthGuard;
