/** Block view tab: each text_block displayed as a card with confidence color coding. */

import React from 'react';
import type { PageResult, TextBlock } from '../types';

interface BlockViewProps {
  page: PageResult;
}

type Tab = 'text' | 'json' | 'blocks';

function confidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'border-emerald-100 bg-emerald-50/50 shadow-sm shadow-emerald-50';
  if (confidence >= 0.7) return 'border-amber-100 bg-amber-50/50 shadow-sm shadow-amber-50';
  return 'border-red-100 bg-red-50/50 shadow-sm shadow-red-50';
}

function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.9) return 'text-emerald-700 bg-emerald-100 border border-emerald-200';
  if (confidence >= 0.7) return 'text-amber-700 bg-amber-100 border border-amber-200';
  return 'text-red-700 bg-red-100 border border-red-200';
}

const BlockCard: React.FC<{ block: TextBlock; warn: boolean }> = ({ block, warn }) => (
  <div className={`rounded-xl border p-4 transition-all duration-200 hover:shadow-md ${confidenceClass(block.confidence)} ${warn ? 'ring-2 ring-red-500/10' : ''}`}>
    <div className="flex items-start justify-between gap-3 mb-2">
      <span className="text-[10px] text-gray-400 tabular-nums uppercase font-bold tracking-wider">#{block.block_id} Line {block.line_number}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${confidenceBadgeClass(block.confidence)}`}>
        {(block.confidence * 100).toFixed(1)}%
      </span>
    </div>
    <p className="text-sm text-gray-900 font-semibold leading-relaxed mb-2">{block.text}</p>
    <p className="text-[9px] text-gray-400 font-mono flex gap-2">
      <span className="bg-white/50 px-1 rounded">BOX: [{block.bbox.top_left[0].toFixed(0)}, {block.bbox.top_left[1].toFixed(0)}] → [{block.bbox.bottom_right[0].toFixed(0)}, {block.bbox.bottom_right[1].toFixed(0)}]</span>
    </p>
  </div>
);

const BlockView: React.FC<BlockViewProps> = ({ page }) => {
  const lowConfidenceCount = page.text_blocks.filter((b) => b.confidence < 0.7).length;

  return (
    <div className="animate-fade-in space-y-4 pb-10">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] uppercase font-bold tracking-tight text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />고신뢰도 (≥90%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />보통 (70-89%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />저신뢰도 ({lowConfidenceCount})</span>
      </div>

      {page.text_blocks.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
          <p className="text-sm text-gray-400">인식된 텍스트 블록이 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-3 pr-1">
          {page.text_blocks.map((block) => (
            <BlockCard key={block.block_id} block={block} warn={block.confidence < 0.7} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BlockView;
