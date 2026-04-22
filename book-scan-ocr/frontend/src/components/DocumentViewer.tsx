/**
 * DocumentViewer: 3-panel layout — page list, scanned image, OCR result tabs.
 * Handles page selection, image zoom, and tab switching.
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { editPage, getDocument, getDownloadUrl, getMinimalDownloadUrl, getPage, getPageImageUrl, llmExtractPage } from '../services/api';
import type { DocumentResult, PageResult } from '../types';
import BlockView from './BlockView';
import JsonView from './JsonView';
import PageNavigation from './PageNavigation';
import TextView from './TextView';
import { usePageNavigation } from '../hooks/usePageNavigation';

type Tab = 'text' | 'json' | 'blocks';

const DocumentViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<DocumentResult | null>(null);
  const [currentPageData, setCurrentPageData] = useState<PageResult | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [extractingLLM, setExtractingLLM] = useState(false);
  const [extractProvider, setExtractProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const [zoom, setZoom] = useState(0.3);
  const [imgError, setImgError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Resizable split state
  const [rightPanelWidth, setRightPanelWidth] = useState(50); // percentage
  const [isResizing, setIsResizing] = useState(false);

  const nav = usePageNavigation({ totalPages: document?.total_pages ?? 1 });

  const loadDocument = () => {
    if (!id) return;
    getDocument(id).then((doc) => {
      setDocument(doc);
      setLoadingDoc(false);
    }).catch(() => setLoadingDoc(false));
  };

  // Load document metadata
  useEffect(() => {
    loadDocument();
  }, [id]);

  // Load page data when page changes
  useEffect(() => {
    if (!id || !document) return;
    setLoadingPage(true);
    setImgError(false);
    getPage(id, nav.currentPage).then((p) => {
      setCurrentPageData(p);
    }).finally(() => setLoadingPage(false));
  }, [id, document, nav.currentPage]);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const totalWidth = window.innerWidth - 80;
      const mouseX = e.clientX - 80;
      const newWidthPercent = 100 - (mouseX / totalWidth) * 100;
      const minRight = 20;
      const maxRight = 80;
      setRightPanelWidth(Math.min(maxRight, Math.max(minRight, newWidthPercent)));
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

  const handleLLMExtract = async (provider: 'chatgpt' | 'claude') => {
    if (!id) return;
    const key = sessionStorage.getItem(provider === 'chatgpt' ? 'openai_api_key' : 'anthropic_api_key');
    if (!key) {
      alert(`${provider === 'chatgpt' ? 'OpenAI' : 'Anthropic'} API Key를 [설정]에서 먼저 입력해주세요.`);
      return;
    }
    setExtractingLLM(true);
    setExtractProvider(provider === 'chatgpt' ? 'ChatGPT 4o' : 'Claude 4.6');
    try {
      const data = await llmExtractPage(id, nav.currentPage, {
        provider,
        api_key: key
      });
      setCurrentPageData(data);
      // Wait a tiny bit for server file I/O to settle before reloading metadata
      setTimeout(() => {
        loadDocument();
        alert('AI 추출 및 저장이 완료되었습니다.');
      }, 500);
    } catch (e: any) {
      alert('LLM 추출 실패: ' + (e.response?.data?.detail || e.message || String(e)));
    } finally {
      setExtractingLLM(false);
      setExtractProvider(null);
    }
  };

  const handleUpdateBlock = (blockId: number, newText: string) => {
    if (!currentPageData) return;
    const updatedBlocks = currentPageData.text_blocks.map(b =>
      b.block_id === blockId ? { ...b, text: newText } : b
    );
    setCurrentPageData({ ...currentPageData, text_blocks: updatedBlocks });
  };

  const handleDeleteBlock = (blockId: number) => {
    if (!currentPageData) return;
    if (!window.confirm('이 블록을 삭제하시겠습니까?')) return;
    const updatedBlocks = currentPageData.text_blocks.filter(b => b.block_id !== blockId);
    setCurrentPageData({ ...currentPageData, text_blocks: updatedBlocks });
  };

  const handleSaveEdit = async () => {
    if (!id || !currentPageData) return;
    setIsSaving(true);
    try {
      await editPage(id, nav.currentPage, {
        page_title: currentPageData.page_title,
        page_number: String(currentPageData.page_number),
        text_blocks: currentPageData.text_blocks
      });

      // Refresh document metadata to show latest last_edited info
      loadDocument();

      alert('변경사항이 저장되었습니다.');
    } catch (e: any) {
      alert('저장 실패: ' + (e.response?.data?.detail || e.message));
    } finally {
      setIsSaving(false);
    }
  };

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
        <Link to="/" className="btn-secondary mt-4 inline-flex">← 목록으로</Link>
      </div>
    );
  }

  const imageUrl = id ? getPageImageUrl(id, nav.currentPage) : '';

  return (
    <div className="flex flex-col h-full animate-fade-in relative bg-white">
      {/* Global Loading Top Bar */}
      {(extractingLLM || loadingPage) && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-brand-600 text-white py-2 px-4 flex items-center justify-center gap-3 shadow-md animate-slide-down">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold">
            {extractingLLM ? `${extractProvider}가 텍스트를 분석 중입니다…` : '페이지 정보를 불러오고 있습니다…'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 bg-white/90 backdrop-blur shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn-ghost text-xs px-2 py-1" id="back-to-dashboard">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            목록
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 truncate max-w-sm">{document.filename}</h1>
            <p className="text-xs text-gray-400">{document.total_pages}페이지 · {document.ocr_engine}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white px-1 py-1 rounded-xl shadow-sm border border-gray-100 scale-90 origin-right transition-all hover:scale-100 hover:shadow-md">
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

          <a
            href={id ? getDownloadUrl(id) : '#'}
            download
            className="btn-secondary text-[10px] h-8 px-3 shadow-none border-brand-100 bg-brand-50/50 text-brand-700 hover:bg-brand-100 font-bold"
            id="download-full-json-btn"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            원본 JSON 다운로드
          </a>
          <a
            href={id ? getMinimalDownloadUrl(id) : '#'}
            download
            className="btn-secondary text-[10px] h-8 px-3 shadow-none border-brand-100 bg-brand-50/50 text-brand-700 hover:bg-brand-100 font-bold"
            id="download-minimal-json-btn"
            title="상세 좌표 정보(text_blocks)를 제외하여 용량을 줄인 버전입니다"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            JSON 다운로드 (textblock 제외)
          </a>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: page list sidebar (Fixed 80px) */}
        <div className="w-20 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto">
          {Array.from({ length: document.total_pages }, (_, i) => i + 1).map((pg) => (
            <button
              key={pg}
              id={`page-thumb-${pg}`}
              onClick={() => nav.goToPage(pg)}
              className={`w-full py-3 flex flex-col items-center gap-1 text-[11px] transition-colors duration-150 font-medium
                ${nav.currentPage === pg
                  ? 'bg-brand-50 text-brand-600 border-r-2 border-brand-600'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {pg}
            </button>
          ))}
        </div>

        {/* Center: scanned image (Resizable) */}
        <div
          className="flex flex-col border-r border-gray-100 bg-gray-50/30 min-w-0"
          style={{ width: `${100 - rightPanelWidth}%` }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">
              원본 이미지 (P{nav.currentPage})
              {currentPageData?.page_title && (
                <span className="ml-2 text-brand-600 border-l border-gray-300 pl-2">
                  {currentPageData.page_title}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} className="btn-ghost text-xs px-2 py-1 hover:bg-white">−</button>
              <span className="text-xs text-gray-600 tabular-nums w-12 text-center font-bold">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="btn-ghost text-xs px-2 py-1 hover:bg-white">+</button>
              <button onClick={() => setZoom(0.3)} className="btn-ghost text-xs px-2 py-1 hover:bg-white">30%</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            {imgError ? (
              <div className="text-gray-400 text-sm text-center mt-20">
                <svg className="w-10 h-10 mx-auto mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                이미지를 불러올 수 없습니다
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={`페이지 ${nav.currentPage}`}
                id={`scanned-image-p${nav.currentPage}`}
                className="rounded-lg shadow-xl border border-gray-200 object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', maxWidth: 'none' }}
                onError={() => setImgError(true)}
              />
            )}
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

        {/* Resizer Divider */}
        <div
          className={`w-1 cursor-col-resize hover:bg-brand-500 active:bg-brand-600 transition-colors z-20 shrink-0
            ${isResizing ? 'bg-brand-500 shadow-lg' : 'bg-gray-100'}`}
          onMouseDown={() => setIsResizing(true)}
        />

        {/* Right: OCR result tabs (Resizable Width) */}
        <div
          className="flex-shrink-0 flex flex-col bg-white relative min-w-0"
          style={{ width: `${rightPanelWidth}%` }}
        >
          {/* LLM Extract Buttons and Metadata */}
          <div className="px-4 py-2 border-b border-gray-100 bg-brand-50/50 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-wider text-brand-600 font-bold">AI 고성능 추출 정보</span>
              <div className="flex items-center gap-2">
                {currentPageData?.extracted_by && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="font-bold text-blue-600">{currentPageData.extracted_by}</span>
                    <span className="text-gray-300">|</span>
                    <span className="tabular-nums">
                      {currentPageData.extracted_at ? (
                        (() => {
                          try {
                            const iso = currentPageData.extracted_at;
                            const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
                            return new Date(normalized).toLocaleString('ko-KR', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', hour12: true,
                              timeZone: 'Asia/Seoul'
                            });
                          } catch (e) { return '-'; }
                        })()
                      ) : '-'}
                    </span>
                  </div>
                )}
                {document?.last_edited_by && (
                  <div className="flex items-center gap-1.5 text-[10px] text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100 shadow-sm">
                    <span className="font-bold">최종수정:</span>
                    <span className="font-medium">{document.last_edited_by}</span>
                    <span className="text-gray-300">|</span>
                    <span className="tabular-nums">
                      {document.last_edited_at ? (
                        (() => {
                          try {
                            const iso = document.last_edited_at;
                            const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
                            return new Date(normalized).toLocaleString('ko-KR', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', hour12: true,
                              timeZone: 'Asia/Seoul'
                            });
                          } catch (e) { return '-'; }
                        })()
                      ) : '-'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleLLMExtract('chatgpt')}
                disabled={extractingLLM || loadingPage}
                className="flex-1 btn-primary py-1.5 text-[10px] h-auto bg-emerald-600 hover:bg-emerald-500 border-emerald-600 shadow-none"
              >
                ChatGPT 4o 추출
              </button>
              <button
                onClick={() => handleLLMExtract('claude')}
                disabled={extractingLLM || loadingPage}
                className="flex-1 btn-primary py-1.5 text-[10px] h-auto bg-amber-600 hover:bg-amber-500 border-amber-600 shadow-none"
              >
                Claude 4.6
              </button>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 focus-within:ring-1 focus-within:ring-brand-500 overflow-hidden shrink-0">
                <span className="text-[10px] text-gray-400 font-bold uppercase transition-colors">P.</span>
                <input
                  type="text"
                  value={currentPageData?.page_number || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentPageData(prev => prev ? { ...prev, page_number: val } : null);
                  }}
                  className="w-10 text-xs outline-none font-bold tabular-nums bg-transparent"
                />
              </div>
              <input
                type="text"
                placeholder="페이지 제목 수정..."
                value={currentPageData?.page_title || ''}
                onChange={(e) => setCurrentPageData(prev => prev ? { ...prev, page_title: e.target.value } : null)}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-brand-500 outline-none font-medium h-8"
              />
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || loadingPage}
                className={`btn-primary text-[10px] h-8 px-4 flex items-center gap-1 shadow-sm transition-all
                  ${isSaving ? 'opacity-50' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
                id="save-edit-btn"
              >
                {isSaving ? (
                  <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                저장
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-3 border-b border-gray-100 bg-gray-50/30">
            {(['text', 'json', 'blocks'] as Tab[]).map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                  ${activeTab === tab ? 'tab-active shadow-sm' : 'tab-inactive'}`}
              >
                {tab === 'text' ? '텍스트' : tab === 'json' ? 'JSON' : '블록'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 relative bg-white">
            {currentPageData ? (
              <>
                {activeTab === 'text' && <TextView page={currentPageData} />}
                {activeTab === 'json' && <JsonView page={currentPageData} />}
                {activeTab === 'blocks' && (
                  <BlockView
                    page={currentPageData}
                    onUpdateBlock={handleUpdateBlock}
                    onDeleteBlock={handleDeleteBlock}
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2 font-medium">
                <svg className="w-8 h-8 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">데이터를 불러오는 중입니다…</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
