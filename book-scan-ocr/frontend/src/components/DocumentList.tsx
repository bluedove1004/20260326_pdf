/** Document list component: table of uploaded PDFs with status badges. */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteDocument, toggleArchive } from '../services/api';
import type { DocumentListItem } from '../types';

interface DocumentListProps {
  documents: DocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  onPageChange: (page: number) => void;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  detailPathPrefix?: string;
  hideDelete?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
};

const StatusBadge: React.FC<{ status: string; progress?: number }> = ({ status, progress = 0 }) => {
  const styles = {
    pending: 'bg-amber-50 text-amber-600 border-amber-100',
    processing: 'bg-blue-50 text-blue-600 border-blue-100',
    completed: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    failed: 'bg-rose-50 text-rose-600 border-rose-100',
  }[status] || 'bg-gray-50 text-gray-600 border-gray-100';

  const labels = {
    pending: '대기 중',
    processing: `추출 중 (${progress}%)`,
    completed: '완료',
    failed: '실패',
  }[status] || status;

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${styles} uppercase tracking-wider`}>
        {labels}
      </span>
      {status === 'processing' && (
        <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};



function formatDate(iso: string): string {
  try {
    // If string doesn't have timezone info, assume UTC by appending Z
    const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
    const date = new Date(normalized);
    
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    }).format(date).replace(/\. /g, '.').replace(/\.$/, '');
  } catch {
    return iso;
  }
}

const DocumentList: React.FC<DocumentListProps> = ({ 
  documents, total, page, pageSize, search, onPageChange, onSearchChange, onRefresh,
  detailPathPrefix = '/documents',
  hideDelete = false
}) => {
  const navigate = useNavigate();

  // Auto-refresh the list if any document is in 'processing' status
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.status === 'processing');
    
    if (hasProcessing) {
      const intervalId = setInterval(() => {
        onRefresh();
      }, 5000); // Poll every 5 seconds
      
      return () => clearInterval(intervalId);
    }
  }, [documents, onRefresh]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('정말 이 문서를 삭제하시겠습니까?')) {
      try {
        await deleteDocument(id);
        onRefresh();
      } catch (err) {
        console.error('Failed to delete document:', err);
        alert('문서 삭제에 실패했습니다.');
      }
    }
  };

  const handleToggleArchive = async (e: React.MouseEvent, id: string, currentStatus: boolean) => {
    e.stopPropagation();
    try {
      await toggleArchive(id, !currentStatus);
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle archive status:', err);
      alert('보관함 상태 변경에 실패했습니다.');
    }
  };

  if (documents.length === 0) {
    const isSearching = search.length > 0;
    return (
      <div className="glass-card p-10 text-center text-gray-500 animate-fade-in shadow-sm">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d={isSearching 
              ? "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"} />
        </svg>
        <p className="text-sm font-semibold text-gray-600">
          {isSearching ? `'${search}' 검색 결과가 없습니다` : '업로드된 문서가 없습니다'}
        </p>
        <p className="text-xs mt-1 text-gray-400">
          {isSearching ? '검색어를 확인하거나 지워주세요' : '위에서 PDF 파일을 업로드해 주세요'}
        </p>
        {isSearching && (
          <button 
            onClick={() => onSearchChange('')} 
            className="mt-6 px-4 py-2 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-xl transition-all"
          >
            모든 문서 보기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden animate-slide-up shadow-lg">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white/50">
        <h2 className="text-base font-bold text-gray-800">문서 목록</h2>
        
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative group">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="파일명 검색..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-8 py-1.5 bg-gray-100/50 border border-transparent rounded-lg text-xs focus:bg-white focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none w-48 transition-all"
            />
            {search && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="검색어 지우기"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button onClick={onRefresh} className="btn-ghost text-xs gap-1.5 hover:bg-gray-50 px-2.5 py-1.5" id="refresh-documents-btn">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            새로고침
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-5 py-3 font-semibold">파일명</th>
              <th className="text-center px-4 py-3 font-semibold">페이지</th>
              <th className="text-center px-4 py-3 font-semibold">상태</th>
              <th className="text-center px-4 py-3 font-semibold">생성일</th>
              <th className="text-center px-4 py-3 font-semibold">수정 정보</th>
              {localStorage.getItem('ocr_user_role') === 'superadmin' && !hideDelete && (
                <th className="text-center px-4 py-3 font-semibold w-24">보관함 노출</th>
              )}
              {!hideDelete && <th className="text-right px-5 py-3 font-semibold w-10">삭제</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <tr
                key={doc.document_id}
                onClick={() => doc.status === 'completed' && navigate(`${detailPathPrefix}/${doc.document_id}`)}
                className={`transition-colors duration-150
                  ${doc.status === 'completed' ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                id={`doc-row-${doc.document_id}`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17h8v-1H8v1zm0-3h8v-1H8v1zm0-3h5v-1H8v1z" />
                      </svg>
                    </div>
                    <span className="text-gray-800 truncate max-w-[200px] font-semibold">{doc.filename}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-center text-gray-600 tabular-nums">{doc.total_pages || '—'}</td>
                <td className="px-4 py-3.5 text-center">
                  <StatusBadge status={doc.status} progress={doc.progress} />
                </td>
                <td className="px-4 py-3.5 text-center text-gray-400 text-xs tabular-nums">{formatDate(doc.created_at)}</td>
                <td className="px-4 py-3.5 text-center">
                  {doc.last_edited_at ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-gray-400 tabular-nums">{formatDate(doc.last_edited_at)}</span>
                      <span className="text-[10px] text-brand-600 font-bold">{doc.last_edited_by}</span>
                    </div>
                  ) : (
                    <span className="text-gray-300 text-[10px]">—</span>
                  )}
                </td>
                {localStorage.getItem('ocr_user_role') === 'superadmin' && !hideDelete && (
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={(e) => handleToggleArchive(e, doc.document_id, !!doc.is_archived)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                        doc.is_archived 
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-100' 
                          : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-200'
                      }`}
                      title={doc.is_archived ? "보관함에서 숨기기" : "보관함에 보이기"}
                    >
                      {doc.is_archived ? '보임 (공개)' : '숨김 (비공개)'}
                    </button>
                  </td>
                )}
                {!hideDelete && (
                  <td className="px-5 py-3.5 text-right w-10">
                    {localStorage.getItem('ocr_user_role') === 'superadmin' && (
                      <button
                        onClick={(e) => handleDelete(e, doc.document_id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="문서 삭제"
                        id={`delete-btn-${doc.document_id}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {Math.ceil(total / pageSize) > 1 && (
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
          <span className="text-xs text-gray-500">
            총 <strong>{total}</strong>건 중 <strong>{(page - 1) * pageSize + 1}</strong>-<strong>{Math.min(page * pageSize, total)}</strong> 표시
          </span>
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg disabled:opacity-30 transition-colors"
              title="이전 페이지"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="flex items-center gap-1 mx-2">
              <span className="text-sm font-bold text-brand-600">{page}</span>
              <span className="text-xs text-gray-300">/</span>
              <span className="text-xs font-medium text-gray-500">{Math.ceil(total / pageSize)}</span>
            </div>

            <button 
              disabled={page === Math.ceil(total / pageSize)}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg disabled:opacity-30 transition-colors"
              title="다음 페이지"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentList;
