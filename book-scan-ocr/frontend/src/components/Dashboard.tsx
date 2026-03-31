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

  const refreshDocuments = useCallback(() => {
    listDocuments().then(setDocuments).catch(console.error);
  }, []);

  useEffect(() => { refreshDocuments(); }, [refreshDocuments]);

  const handleUploaded = (documentId: string, filename: string) => {
    setProcessingId(documentId);
    setProcessingFilename(filename);
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

        {/* Document list */}
        <DocumentList documents={documents} onRefresh={refreshDocuments} />
      </div>
    </div>
  );
};

export default Dashboard;
