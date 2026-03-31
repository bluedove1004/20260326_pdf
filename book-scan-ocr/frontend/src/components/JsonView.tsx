/** JSON view tab: syntax-highlighted, collapsible JSON tree via react-json-view. */

import React from 'react';
import ReactJson from 'react-json-view';
import type { PageResult } from '../types';

interface JsonViewProps {
  page: PageResult;
}

const highContrastLightTheme = {
  base00: 'white',
  base01: '#e8e8e8',
  base02: '#cccccc', // Indent lines - noticeably darker
  base03: '#555555', // Deeper contrast for lines and brackets
  base04: '#444444',
  base05: '#222222', // Standard text
  base06: '#111111',
  base07: '#000000',
  base08: '#d32f2f', // Red (Errors)
  base09: '#1976d2', // Blue (Strings)
  base0A: '#6a1b9a', // Purple (Booleans)
  base0B: '#388e3c', // Green (Numbers)
  base0C: '#f57c00', // Constants
  base0D: '#0d47a1', // Keys - very deep blue
  base0E: '#c2185b', // Keywords
  base0F: '#5d4037'
};

const JsonView: React.FC<JsonViewProps> = ({ page }) => {
  return (
    <div className="flex flex-col h-full gap-4 p-6 bg-white animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          JSON 원본 데이터 — 노드를 클릭하여 하위 항목을 접거나 펼칠 수 있습니다
        </h3>
      </div>
      <div className="bg-[#fcfcfc] rounded-2xl border border-gray-100 p-8 shadow-inner overflow-auto max-h-[70vh]">
        <ReactJson
          src={page as unknown as Record<string, unknown>}
          theme={highContrastLightTheme as any}
          collapsed={2}
          displayDataTypes={false}
          displayObjectSize={true}
          enableClipboard={true}
          indentWidth={4}
          style={{
            backgroundColor: 'transparent',
            fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
        />
      </div>
    </div>
  );
};

export default JsonView;
