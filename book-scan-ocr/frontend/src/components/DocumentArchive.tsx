
import React, { useCallback, useEffect, useState } from 'react';
import { listDocuments } from '../services/api';
import type { DocumentListItem } from '../types';
import DocumentList from './DocumentList';

const DocumentArchive: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>(''); 
  const [search, setSearch] = useState<string>(''); 

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchTerm);
      setPage(1); 
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const refreshDocuments = useCallback(() => {
    listDocuments(page, pageSize, search, true)
      .then((data) => {
        if (data.items.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setDocuments(data.items);
        setTotal(data.total);
      })
      .catch(console.error);
  }, [page, pageSize, search]);

  useEffect(() => { refreshDocuments(); }, [refreshDocuments]);

  return (
    <div className="h-full overflow-y-auto py-8 px-4 animate-fade-in bg-gray-50/30">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">문서 보관함</h1>
          <p className="text-sm text-gray-500 font-medium">전체 업로드된 문서 목록을 확인하고 조회할 수 있습니다.</p>
        </div>

        <DocumentList 
          documents={documents} 
          total={total}
          page={page}
          pageSize={pageSize}
          search={searchTerm}
          onPageChange={setPage}
          onSearchChange={setSearchTerm}
          onRefresh={refreshDocuments}
          detailPathPrefix="/archive-details"
          hideDelete={true}
        />
      </div>
    </div>
  );
};

export default DocumentArchive;
