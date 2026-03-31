/** Progress bar component for OCR processing status. */

import React from 'react';
import type { DocumentStatusResponse } from '../types';

interface ProgressBarProps {
  status: DocumentStatusResponse;
  filename?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ status, filename }) => {
  const pct = Math.min(100, Math.round(status.progress_percent));
  const isDone = status.status === 'completed';
  const isFailed = status.status === 'failed';

  return (
    <div className="bg-white/80 border border-gray-100 rounded-2xl p-6 shadow-sm animate-fade-in backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            {isDone ? '처리 완료' : isFailed ? '처리 실패' : 'OCR 분석 진행 중…'}
          </h3>
          {filename && <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1 truncate max-w-[200px]">{filename}</p>}
        </div>
        <span className={`text-2xl font-black tabular-nums ${isDone ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-brand-600'}`}>
          {pct}%
        </span>
      </div>

      {/* Progress track */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-50">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${
            isDone ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-brand-500'
          }`}
          style={{ width: `${pct}%` }}
        />
        {!isDone && !isFailed && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" />
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-gray-400 font-bold uppercase">Processing Status</span>
        <p className="text-[11px] font-bold text-gray-600 tabular-nums bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
          {status.processed_pages} / {status.total_pages} Pages
        </p>
      </div>
    </div>
  );
};

export default ProgressBar;
