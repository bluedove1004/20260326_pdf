/** JSON view tab: syntax-highlighted, collapsible JSON tree via react-json-view. */

import React from 'react';
import ReactJson from 'react-json-view';
import type { PageResult } from '../types';

interface JsonViewProps {
  page: PageResult;
}

const JsonView: React.FC<JsonViewProps> = ({ page }) => {
  return (
    <div className="animate-fade-in space-y-3 pb-10">
      <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider px-1">
        JSON 원본 데이터 — 노드를 클릭하여 하위 항목을 접거나 펼칠 수 있습니다
      </div>
      <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-6 overflow-auto max-h-[65vh] shadow-inner">
        <ReactJson
          src={page as unknown as Record<string, unknown>}
          theme="shapeshifter"
          collapsed={2}
          displayDataTypes={false}
          displayObjectSize
          enableClipboard
          style={{
            background: 'transparent',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
          }}
        />
      </div>
    </div>
  );
};

export default JsonView;
