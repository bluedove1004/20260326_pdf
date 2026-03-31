/** File uploader component with drag-and-drop support. */

import React, { useCallback, useRef, useState } from 'react';
import { uploadDocument } from '../services/api';

interface FileUploaderProps {
  onUploaded: (documentId: string, filename: string) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onUploaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드 가능합니다');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('파일 크기가 100MB를 초과합니다');
      return;
    }
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const response = await uploadDocument(file, (pct) => setUploadProgress(pct));
      onUploaded(response.document_id, file.name);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '업로드 실패';
      setError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 group
          ${isDragging 
            ? 'border-brand-500 bg-brand-50 shadow-xl shadow-brand-100/50 scale-[1.01]' 
            : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50/50 hover:shadow-lg'
          }
          ${uploading ? 'cursor-not-allowed opacity-70' : ''}`}
        role="button"
        aria-label="PDF 파일 업로드 영역"
        id="file-upload-zone"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleInputChange}
          className="hidden"
          disabled={uploading}
          id="pdf-file-input"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-6 py-4 animate-pulse">
            <div className="w-14 h-14 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            <div className="w-full max-w-sm">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm font-bold text-gray-900 mt-3 tabular-nums">파일 업로드 중… {uploadProgress}%</p>
              <p className="text-xs text-gray-400">네트워크 상태에 따라 시간이 걸릴 수 있습니다.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg
              ${isDragging ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-500'}`}>
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-950 mb-2 leading-snug">
                {isDragging ? '여기에 놓으세요' : '새 PDF 파일 업로드'}
              </h3>
              <p className="text-sm text-gray-500 font-medium">
                드래그 앤 드롭하거나 <span className="text-brand-600 font-bold underline decoration-brand-200 underline-offset-4">클릭하여 선택</span>
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="badge-secondary bg-gray-50 text-gray-400 border-gray-100 font-bold uppercase tracking-widest text-[9px]">PDF Only</span>
              <span className="badge-secondary bg-gray-50 text-gray-400 border-gray-100 font-bold uppercase tracking-widest text-[9px]">Max 100MB</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
