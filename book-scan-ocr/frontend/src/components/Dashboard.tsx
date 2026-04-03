/**
 * Dashboard: main landing page combining file uploader, progress tracking,
 * and the list of all uploaded documents.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDocuments } from '../services/api';
import type { DocumentListItem, DocumentStatusResponse } from '../types';
import DocumentList from './DocumentList';
import FileUploader from './FileUploader';
import ProgressBar from './ProgressBar';
import { useDocumentPolling } from '../hooks/useDocumentPolling';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>(''); // Immediate input state
  const [search, setSearch] = useState<string>(''); // Debounced state
  const [notification, setNotification] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingFilename, setProcessingFilename] = useState<string>('');

  const { status: pollStatus } = useDocumentPolling({
    documentId: processingId,
    enabled: processingId !== null,
    onComplete: (s: DocumentStatusResponse) => {
      if (s.status === 'completed') {
        refreshDocuments();
        setProcessingId(null);
        navigate(`/documents/${s.document_id}`);
      } else {
        setProcessingId(null);
        refreshDocuments();
      }
    },
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchTerm);
      setPage(1); // Jump to page 1 on search change
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Auto-clear notification after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const refreshDocuments = useCallback(() => {
    listDocuments(page, pageSize, search)
      .then((data) => {
        // If current page exists but has no items (e.g. after deletion), 
        // move to previous page automatically
        if (data.items.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setDocuments(data.items);
        setTotal(data.total);
        
        // Show notification if no results for a specific search
        if (search && data.total === 0) {
          setNotification(`'${search}'에 대한 검색 결과가 없습니다.`);
        }
      })
      .catch(console.error);
  }, [page, pageSize, search]);

  useEffect(() => { refreshDocuments(); }, [refreshDocuments]);

  const handleUploaded = (documentId: string, filename: string) => {
    setProcessingId(documentId);
    setProcessingFilename(filename);
    setPage(1); // Reset to first page on new upload
    refreshDocuments();
  };

  return (
    <div className="h-full overflow-y-auto py-8 px-4 animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-50 border border-brand-100 rounded-full text-xs text-brand-700 mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
            PDF 속 텍스트를 선명하게 들여다봅니다
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            Text<span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">Lens</span>
          </h1>
          <p className="text-gray-500 mt-2 text-base">PDF를 업로드하면 AI가 텍스트를 추출합니다</p>
        </div>

        {/* Upload */}
        <div className="glass-card p-6 shadow-md">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">PDF 업로드</h2>
          <FileUploader onUploaded={handleUploaded} />
        </div>

        {/* Progress (while processing) */}
        {processingId && pollStatus && (
          <ProgressBar status={pollStatus} filename={processingFilename} />
        )}

        {/* Floating Notification */}
        {notification && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
            <div className="bg-gray-800 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-gray-700">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">{notification}</span>
            </div>
          </div>
        )}

        {/* Document list */}
        <DocumentList 
          documents={documents} 
          total={total}
          page={page}
          pageSize={pageSize}
          search={searchTerm}
          onPageChange={setPage}
          onSearchChange={setSearchTerm}
          onRefresh={refreshDocuments} 
        />
      </div>
    </div>
  );
};

export default Dashboard;
