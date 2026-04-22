import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const getApiBaseUrl = () => {
  const meta = (import.meta as any).env;
  if (meta.VITE_API_URL) return meta.VITE_API_URL;

  const origin = window.location.origin;
  const base = meta.BASE_URL || '/';

  // Combine origin with base path (e.g., /ocr/)
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${origin}${normalizedBase}`;
};
const API_BASE_URL = getApiBaseUrl();

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/login`, {
        username,
        password,
      });

      if (response.data.status === 'success') {
        localStorage.setItem('ocr_auth_token', response.data.access_token);
        localStorage.setItem('ocr_user_role', response.data.role);
        localStorage.setItem('ocr_username', response.data.username);
        
        // Full reload to home to ensure fresh state/permissions
        const base = window.location.pathname.startsWith('/ocr/') ? '/ocr/' : '/';
        window.location.href = base;
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || '로그인 정보가 올바르지 않습니다.');
      } else {
        setError('로그인 중 알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden font-sans">
      {/* Subtle Background Orbs */}
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-brand-200/40 blur-[100px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-indigo-200/40 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-sm px-6 relative z-10">
        <div className="glass-card p-10 bg-white/80 border-white shadow-2xl shadow-brand-100/50 rounded-[32px] animate-fade-in backdrop-blur-xl border-2">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-200 mx-auto mb-6 transform hover:rotate-3 transition-transform">
              <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">TextLens <span className="text-brand-600">OCR</span></h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/5 transition-all text-sm font-medium"
                placeholder="Input your username"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/5 transition-all text-sm font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-500 text-[13px] font-bold py-3.5 px-4 rounded-2xl animate-shake flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl transition-all hover:bg-black hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-xl shadow-gray-200"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Login</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center bg-gray-50/50 py-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-400 font-bold mb-2">아직 회원이 아니신가요?</p>
            <Link
              to="/register"
              className="text-sm font-black text-brand-600 hover:text-brand-700 transition-colors uppercase tracking-tight"
            >
              회원가입하기
            </Link>
          </div>

          <p className="mt-10 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
            &copy; 2026 KIOM &bull; AI Powered OCR
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
