import React, { useEffect, useState } from 'react';
import { getEditLogs } from '../services/api';

interface EditLog {
  id: number;
  user_key: string;
  username: string;
  document_id: string;
  filename: string;
  seq_number: number;
  created_at: string;
  edit_type: string;
}

const getEditTypeBadge = (type: string) => {
  switch (type) {
    case 'claude_extract':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">Claude Extract</span>;
    case 'chatgpt_extract':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">ChatGPT Extract</span>;
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">Manual Edit</span>;
  }
};

const EditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<EditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const pageSize = 50;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getEditLogs(page, pageSize);
      setLogs(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch edit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
      return new Date(normalized).toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).replace(/\. /g, '.').replace(/\.$/, '');
    } catch {
      return iso;
    }
  };

  // Filter logs locally based on search
  const filteredLogs = logs.filter(log => 
    log.username.toLowerCase().includes(search.toLowerCase()) ||
    log.filename.toLowerCase().includes(search.toLowerCase()) ||
    log.user_key.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-[1200px] mx-auto p-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">문서 수정 로그</h1>
          <p className="text-gray-500 font-medium">사용자들의 문서 편집 이력을 모니터링합니다.</p>
        </div>

        <div className="relative group w-full md:w-80">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="사용자명, 파일명 검색..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="glass-card overflow-hidden shadow-xl border border-white/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="px-6 py-4">수정 일시 (KST)</th>
                <th className="px-6 py-4">사용자</th>
                <th className="px-6 py-4">유형</th>
                <th className="px-6 py-4">문서명</th>
                <th className="px-6 py-4 text-center">페이지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8 h-16 bg-gray-50/30"></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-gray-400 font-medium">로그가 없습니다.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-brand-50/30 transition-colors group">
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">{log.username}</span>
                        <span className="text-[10px] text-gray-400 tabular-nums font-medium group-hover:text-brand-400 transition-colors">{log.user_key}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getEditTypeBadge(log.edit_type)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600 flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-gray-700 truncate max-w-[300px]" title={log.filename}>
                          {log.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-700">
                        P.{log.seq_number}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-6 border-t border-gray-100 bg-gray-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-xs text-gray-400 font-medium">
              showing <strong className="text-gray-700">{Math.min(filteredLogs.length, pageSize)}</strong> of <strong className="text-gray-700">{total}</strong> events
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl disabled:opacity-20 transition-all border border-transparent hover:border-brand-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div className="flex items-center gap-1 mx-4">
                <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-600 text-white text-xs font-bold shadow-lg shadow-brand-500/30">{page}</span>
                <span className="px-2 text-gray-300 text-xs">/</span>
                <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-gray-500 text-xs font-bold">{totalPages}</span>
              </div>

              <button 
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl disabled:opacity-20 transition-all border border-transparent hover:border-brand-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-8 text-center">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Total {total} Events</p>
      </div>
    </div>
  );
};

export default EditLogViewer;
