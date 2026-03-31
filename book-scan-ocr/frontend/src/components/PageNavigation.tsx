/** Page navigation component: prev/next buttons and direct page number input. */

import React, { useState } from 'react';

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onGoPrev: () => void;
  onGoNext: () => void;
  onGoToPage: (page: number) => void;
}

const PageNavigation: React.FC<PageNavigationProps> = ({
  currentPage, totalPages, canGoPrev, canGoNext, onGoPrev, onGoNext, onGoToPage,
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(inputValue, 10);
    if (!isNaN(n)) {
      onGoToPage(n);
      setInputValue('');
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-2.5 border-t border-gray-100 bg-gray-50/80 backdrop-blur-sm sticky bottom-0 z-10">
      <button
        onClick={onGoPrev}
        disabled={!canGoPrev}
        className="btn-ghost text-xs gap-1 py-1.5 disabled:opacity-20 hover:bg-white"
        aria-label="이전 페이지"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        이전
      </button>

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          placeholder={String(currentPage)}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-14 bg-white border border-gray-200 rounded-md py-1 text-center text-sm text-gray-900 font-bold
                     focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
          aria-label="페이지 번호 입력"
        />
        <span className="text-xs text-gray-500 font-medium">/ {totalPages}</span>
        <button type="submit" className="btn-secondary text-[10px] px-2.5 py-1.5 uppercase font-bold shadow-none border-gray-200">Go</button>
      </form>

      <button
        onClick={onGoNext}
        disabled={!canGoNext}
        className="btn-ghost text-xs gap-1 py-1.5 disabled:opacity-20 hover:bg-white"
        aria-label="다음 페이지"
      >
        다음
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
};

export default PageNavigation;
