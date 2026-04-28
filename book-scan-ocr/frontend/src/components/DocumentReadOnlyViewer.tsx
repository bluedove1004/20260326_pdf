
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDocument, getDownloadUrl, getMinimalDownloadUrl, getPage, getPageImageUrl } from '../services/api';
import type { DocumentResult, PageResult } from '../types';
import BlockView from './BlockView';
import JsonView from './JsonView';
import PageNavigation from './PageNavigation';
import TextView from './TextView';
import { usePageNavigation } from '../hooks/usePageNavigation';

type Tab = 'text' | 'json' | 'blocks';

const DocumentReadOnlyViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<DocumentResult | null>(null);
  const [currentPageData, setCurrentPageData] = useState<PageResult | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const [zoom, setZoom] = useState(0.3);
  const [imgError, setImgError] = useState(false);

  const [rightPanelWidth, setRightPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);

  const nav = usePageNavigation({ totalPages: document?.total_pages ?? 1 });

  const loadDocument = () => {
    if (!id) return;
    getDocument(id).then((doc) => {
      setDocument(doc);
      setLoadingDoc(false);
    }).catch(() => setLoadingDoc(false));
  };

  useEffect(() => {
    loadDocument();
  }, [id]);

  useEffect(() => {
    if (!id || !document) return;
    setLoadingPage(true);
    setImgError(false);
    getPage(id, nav.currentPage).then((p) => {
      setCurrentPageData(p);
    }).finally(() => setLoadingPage(false));
  }, [id, document, nav.currentPage]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const totalWidth = window.innerWidth - 80;
      const mouseX = e.clientX - 80;
      const newWidthPercent = 100 - (mouseX / totalWidth) * 100;
      setRightPanelWidth(Math.min(80, Math.max(20, newWidthPercent)));
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (loadingDoc) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg">문서를 찾을 수 없습니다</p>
        <Link to="/archive" className="btn-secondary mt-4 inline-flex">← 목록으로</Link>
      </div>
    );
  }

  const imageUrl = id ? getPageImageUrl(id, nav.currentPage) : '';

  return (
    <div className="flex flex-col h-full animate-fade-in relative bg-white">
      {loadingPage && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-brand-600 text-white py-2 px-4 flex items-center justify-center gap-3 shadow-md animate-slide-down">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold">페이지 정보를 불러오고 있습니다…</span>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 bg-white/90 backdrop-blur shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/archive" className="btn-ghost text-xs px-2 py-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            보관함 목록
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 truncate max-w-sm">{document.filename}</h1>
            <p className="text-xs text-gray-400">{document.total_pages}페이지 · {document.ocr_engine}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PageNavigation
            currentPage={nav.currentPage}
            totalPages={document.total_pages}
            canGoPrev={nav.canGoPrev}
            canGoNext={nav.canGoNext}
            onGoPrev={nav.goPrev}
            onGoNext={nav.goNext}
            onGoToPage={nav.goToPage}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-20 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto">
          {Array.from({ length: document.total_pages }, (_, i) => i + 1).map((pg) => (
            <button
              key={pg}
              onClick={() => nav.goToPage(pg)}
              className={`w-full py-3 flex flex-col items-center gap-1 text-[11px] transition-colors
                ${nav.currentPage === pg ? 'bg-brand-50 text-brand-600 border-r-2 border-brand-600' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              {pg}
            </button>
          ))}
        </div>

        <div className="flex flex-col border-r border-gray-100 bg-gray-50/30 min-w-0" style={{ width: `${100 - rightPanelWidth}%` }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <span className="text-[11px] font-bold text-gray-500 uppercase">원본 이미지 (P{nav.currentPage})</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} className="btn-ghost text-xs px-2 py-1">−</button>
              <span className="text-xs text-gray-600 tabular-nums w-12 text-center font-bold">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="btn-ghost text-xs px-2 py-1">+</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            {!imgError ? (
              <img
                src={imageUrl}
                className="rounded-lg shadow-xl border border-gray-200 object-contain transition-transform"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', maxWidth: 'none' }}
                onError={() => setImgError(true)}
              />
            ) : <div className="text-gray-400 text-sm mt-20">이미지를 불러올 수 없습니다</div>}
          </div>
          <PageNavigation
            currentPage={nav.currentPage}
            totalPages={document.total_pages}
            canGoPrev={nav.canGoPrev}
            canGoNext={nav.canGoNext}
            onGoPrev={nav.goPrev}
            onGoNext={nav.goNext}
            onGoToPage={nav.goToPage}
          />
        </div>

        <div className="w-1 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition-colors z-20 shrink-0 bg-gray-100" onMouseDown={() => setIsResizing(true)} />

        <div className="flex-shrink-0 flex flex-col bg-white relative min-w-0" style={{ width: `${rightPanelWidth}%` }}>
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-1">
            <h2 className="text-sm font-bold text-gray-800">{currentPageData?.page_title || '페이지 정보'}</h2>
            <div className="text-[10px] text-gray-400 flex items-center gap-2 font-medium">
               <span>P. {currentPageData?.page_number}</span>
               {document.last_edited_by && (
                 <>
                   <span className="text-gray-200">|</span>
                   <span>최종수정: {document.last_edited_by}</span>
                 </>
               )}
            </div>
          </div>

          <div className="flex gap-1 p-3 border-b border-gray-100 bg-gray-50/30">
            {(['text', 'json', 'blocks'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}
              >
                {tab === 'text' ? '텍스트' : tab === 'json' ? 'JSON' : '블록'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 relative bg-white">
            {currentPageData ? (
              <>
                {activeTab === 'text' && <TextView page={currentPageData} />}
                {activeTab === 'json' && <JsonView page={currentPageData} />}
                {activeTab === 'blocks' && (
                  <BlockView
                    page={currentPageData}
                    onUpdateBlock={() => {}} // Disabled
                    onDeleteBlock={() => {}} // Disabled
                  />
                )}
              </>
            ) : <p className="text-center text-gray-300 mt-20">데이터를 불러오는 중입니다…</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentReadOnlyViewer;
