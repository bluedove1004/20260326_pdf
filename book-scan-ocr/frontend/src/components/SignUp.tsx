import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const getApiBaseUrl = () => {
  const meta = (import.meta as any).env;
  const origin = window.location.origin;
  const base = meta.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${origin}${normalizedBase}`;
};

const API_BASE_URL = getApiBaseUrl();

const SignUp: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await axios.post(`${API_BASE_URL}/api/register`, {
        username,
        password,
        email,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden font-sans">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-brand-200/40 blur-[100px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-indigo-200/40 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-sm px-6 relative z-10">
        <div className="glass-card p-10 bg-white/80 border-white shadow-2xl shadow-brand-100/50 rounded-[32px] animate-fade-in backdrop-blur-xl border-2">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">Create <span className="text-brand-600">Account</span></h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Join TextLens OCR</p>
          </div>

          {success ? (
            <div className="text-center py-10 animate-fade-in">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">신청이 완료되었습니다!</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                관리자의 승인 후 로그인이 가능합니다.<br />잠시 후 로그인 페이지로 이동합니다.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-500 transition-all text-sm font-medium"
                  placeholder="ID를 입력하세요"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-500 transition-all text-sm font-medium"
                  placeholder="email@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border-2 border-gray-100 rounded-2xl px-5 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-500 transition-all text-sm font-medium"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-500 text-[12px] font-bold py-3 px-4 rounded-2xl flex items-center gap-2">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-600 text-white font-black py-4 rounded-2xl transition-all hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 mt-4 shadow-xl shadow-brand-100"
              >
                {isLoading ? <span className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin inline-block" /> : '생성하기'}
              </button>

              <div className="text-center mt-6">
                <Link to="/login" className="text-xs font-bold text-gray-400 hover:text-brand-600 transition-colors">
                  이미 계정이 있으신가요? 로그인하기
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignUp;
