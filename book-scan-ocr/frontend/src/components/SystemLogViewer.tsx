import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SystemLog {
  id: number;
  user_key: string;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

interface LogResponse {
  total: number;
  page: number;
  size: number;
  items: SystemLog[];
}

const SystemLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('ocr_auth_token');
      const meta = (import.meta as any).env;
      const origin = window.location.origin;
      const base = meta.BASE_URL || '/';
      const apiBase = `${origin}${base.endsWith('/') ? base.slice(0, -1) : base}`;
      
      const { data } = await axios.get<LogResponse>(`${apiBase}/api/admin/logs`, {
        params: { page, size: 50, q: search },
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, search]);

  const formatDate = (dateStr: string) => {
    const utcDate = dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
    return new Date(utcDate).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', 
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul'
    });
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LOGIN': return 'bg-blue-100 text-blue-700';
      case 'DOWNLOAD_JSON': return 'bg-emerald-100 text-emerald-700';
      case 'NAVIGATE': return 'bg-gray-100 text-gray-700';
      default: return 'bg-brand-100 text-brand-700';
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="h-full flex flex-col p-8 max-w-6xl mx-auto animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">시스템 로그 관리</h1>
          <p className="text-gray-500 text-sm mt-1">사용자 활동 및 시스템 이벤트를 모니터링합니다.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
             <input
               type="text"
               placeholder="사용자명, 액션 검색..."
               value={search}
               onChange={(e) => { setSearch(e.target.value); setPage(1); }}
               className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-64 transition-all"
             />
             <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm flex flex-col min-h-0">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur shadow-sm">
              <tr>
                <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">일시 (KST)</th>
                <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">사용자</th>
                <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">액션</th>
                <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">상세 내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center">
                  <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-gray-400 text-sm">기록된 로그가 없습니다.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs tabular-nums text-gray-500 font-medium">
                    {formatDate(log.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">{log.username}</span>
                      <span className="text-[10px] text-gray-400 tabular-nums">{log.user_key}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {log.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pNum = i + 1;
              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`w-8 h-8 rounded-xl text-xs font-bold transition-all
                    ${page === pNum ? 'bg-brand-600 text-white shadow-lg shadow-brand-100' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {pNum}
                </button>
              );
            })}
          </div>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
      <div className="mt-4 text-center">
         <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Total {total} Events</span>
      </div>
    </div>
  );
};

export default SystemLogViewer;
