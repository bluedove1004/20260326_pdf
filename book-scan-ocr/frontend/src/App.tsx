/** Application root with React Router and persistent navigation bar. */

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Link, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import DocumentViewer from './components/DocumentViewer';
import SettingsPanel from './components/SettingsPanel';
import PdfSplitter from './components/PdfSplitter';
import Login from './components/Login';
import SignUp from './components/SignUp';
import UserManagement from './components/UserManagement';
import SystemLogViewer from './components/SystemLogViewer';
import EditLogViewer from './components/EditLogViewer';
import DocumentArchive from './components/DocumentArchive';
import DocumentReadOnlyViewer from './components/DocumentReadOnlyViewer';

// Logger component to track navigation
const NavigationLogger: React.FC = () => {
    const location = useLocation();
    
    useEffect(() => {
        const logNavigation = async () => {
            try {
                const token = localStorage.getItem('ocr_auth_token');
                if (!token) return;
                
                const meta = (import.meta as any).env;
                const origin = window.location.origin;
                const base = meta.BASE_URL || '/';
                const apiBase = `${origin}${base.endsWith('/') ? base.slice(0, -1) : base}`;
                
                await axios.post(`${apiBase}/api/logs`, {
                    action: 'NAVIGATE',
                    details: `Moved to ${location.pathname}`
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (err) {
                // Silently fail to not interrupt UX
                console.debug('Log fail', err);
            }
        };
        logNavigation();
    }, [location.pathname]);
    
    return null;
};

// Helper to parse JWT without external library
const parseJwt = (token: string) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('JWT Parse Error:', e);
        return null;
    }
};

const isAdmin = () => {
    const token = localStorage.getItem('ocr_auth_token');
    if (!token) return false;
    const payload = parseJwt(token);
    // console.debug('Current Role from Token:', payload?.role);
    return payload?.role === 'superadmin';
};

// Higher-order component to protect routes
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('ocr_auth_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const NavBar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigateProxy();

  // Hide Navbar on Login and Register pages
  if (pathname === '/login' || pathname === '/register') return null;

  const handleLogout = () => {
    localStorage.removeItem('ocr_auth_token');
    localStorage.removeItem('ocr_user_role');
    localStorage.removeItem('ocr_username');
    
    // Hard reload to clean up all React states
    const base = window.location.pathname.startsWith('/ocr/') ? '/ocr/' : '/';
    window.location.href = `${base.endsWith('/') ? base : base + '/'}login`;
  };

  const navLink = (to: string, label: string, icon: React.ReactNode) => (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300
        ${pathname === to
          ? 'text-brand-600 bg-brand-50 shadow-sm shadow-brand-100/50'
          : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'}`}
      id={`nav-${to.replace('/', '') || 'home'}`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <nav className="flex items-center justify-between px-8 py-3.5 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <Link to="/" className="flex items-center gap-3 group" id="nav-logo">
        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-100 transition-transform group-hover:scale-105">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex flex-col gap-0">
          <span className="font-black text-gray-900 text-sm tracking-tight">TextLens OCR</span>
          <span className="text-[10px] text-brand-500 font-bold uppercase tracking-widest leading-none">AI Powered</span>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {localStorage.getItem('ocr_user_role') !== 'user' && navLink('/', 'Dashboard',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        )}
        {navLink('/archive', '문서 보관함',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        )}
        {navLink('/pdf-split', 'PDF Splitter',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L6 18M6 18l-3-3m3 3h15m-3-15l-3 3m3-3H6m3 3L6 6m0 0l3-3m-3 3v12" />
          </svg>
        )}
        {navLink('/settings', 'Settings',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}

        {isAdmin() && (
          <>
            <Link to="/user-mgmt" className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="사용자 관리">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
               </svg>
            </Link>
            <Link to="/system-log" className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="시스템 로그">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
               </svg>
            </Link>
            <Link to="/edit-log" className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="수정 로그">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
               </svg>
            </Link>
          </>
        )}
        
        <div className="h-4 w-[1px] bg-gray-200 mx-2" />
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
           <span className="text-xs font-bold text-gray-600">{localStorage.getItem('ocr_username')}</span>
        </div>
        
        <button 
          onClick={handleLogout}
          className="ml-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="로그아웃"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </nav>
  );
};

// Simple proxy because hooks cannot be used in same component level as Router sometimes
const useNavigateProxy = () => {
    try {
        return useLocation(); 
    } catch {
        return null;
    }
}

const App: React.FC = () => {
  const currentPath = window.location.pathname;
  const safeBase = currentPath.startsWith('/ocr/') 
    ? '/ocr/' 
    : ((import.meta as any).env.BASE_URL || '/');

  return (
    <Router basename={safeBase}>
      <NavigationLogger />
      <div className="h-screen bg-white flex flex-col font-sans selection:bg-brand-100 selection:text-brand-900">
        <NavBar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<SignUp />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                {localStorage.getItem('ocr_user_role') === 'user' 
                  ? <Navigate to="/archive" replace /> 
                  : <Dashboard />}
              </ProtectedRoute>
            } />
            
            <Route path="/user-mgmt" element={
              isAdmin() ? (
                <ProtectedRoute><UserManagement /></ProtectedRoute>
              ) : (
                <Navigate to="/archive" replace />
              )
            } />

            <Route path="/system-log" element={
              isAdmin() ? (
                <ProtectedRoute><SystemLogViewer /></ProtectedRoute>
              ) : (
                <Navigate to="/archive" replace />
              )
            } />

            <Route path="/edit-log" element={
              isAdmin() ? (
                <ProtectedRoute><EditLogViewer /></ProtectedRoute>
              ) : (
                <Navigate to="/archive" replace />
              )
            } />
            
            <Route path="/archive" element={
              <ProtectedRoute>
                <DocumentArchive />
              </ProtectedRoute>
            } />
            
            <Route path="/archive-details/:id" element={
              <ProtectedRoute>
                <DocumentReadOnlyViewer />
              </ProtectedRoute>
            } />

            <Route path="/pdf-split" element={
              <ProtectedRoute>
                <PdfSplitter />
              </ProtectedRoute>
            } />
            
            <Route path="/documents/:id" element={
              <ProtectedRoute>
                {localStorage.getItem('ocr_user_role') === 'user' 
                  ? <Navigate to="/archive" replace /> 
                  : <DocumentViewer />}
              </ProtectedRoute>
            } />
            
            <Route path="/settings" element={
              <ProtectedRoute>
                <SettingsPanel />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
