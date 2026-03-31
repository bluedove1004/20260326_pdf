/** Application root with React Router and persistent navigation bar. */

import React from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import DocumentViewer from './components/DocumentViewer';
import SettingsPanel from './components/SettingsPanel';
import PdfSplitter from './components/PdfSplitter';

const NavBar: React.FC = () => {
  const { pathname } = useLocation();

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
        {navLink('/', 'Dashboard',
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
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
      </div>
    </nav>
  );
};

const App: React.FC = () => {
  const currentPath = window.location.pathname;
  const safeBase = currentPath.startsWith('/ocr/') 
    ? '/ocr/' 
    : ((import.meta as any).env.BASE_URL || '/');

  return (
    <BrowserRouter basename={safeBase}>
      <div className="h-screen bg-white flex flex-col font-sans selection:bg-brand-100 selection:text-brand-900">
        <NavBar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pdf-split" element={<PdfSplitter />} />
            <Route path="/documents/:id" element={<DocumentViewer />} />
            <Route path="/settings" element={<SettingsPanel />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
