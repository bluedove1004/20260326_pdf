import React, { useState, useRef } from 'react';

interface SplitFile {
  filename: string;
  download_url: string;
}

interface SplitResponse {
  job_id: string;
  original_filename: string;
  files: SplitFile[];
}

const PdfSplitter: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SplitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        setError('PDF 파일만 업로드 가능합니다.');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Robust handle subpath deployment
      const currentPath = window.location.pathname;
      const baseUrl = currentPath.startsWith('/ocr/') 
        ? '/ocr/' 
        : ((import.meta as any).env.BASE_URL || '/');
      
      const safeBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      const endpoint = `${safeBase}api/pdf/split`;
      
      console.log('Split request endpoint:', endpoint);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '파일 분할에 실패했습니다.');
      }

      const data: SplitResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50 p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-600 text-[10px] font-black uppercase tracking-wider mb-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            PDF Tools
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight">
            PDF <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">Smart Splitter</span>
          </h1>
          <p className="text-gray-500 text-sm font-medium max-w-md mx-auto leading-relaxed">
            대용량 PDF 파일을 200페이지 단위로 신속하게 분기합니다.<br/>
            원본 품질 그대로 안전하게 처리됩니다.
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden">
          <div className="p-10">
            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-gray-100 rounded-[24px] p-16 text-center cursor-pointer transition-all duration-500 hover:border-brand-500 hover:bg-brand-50/30"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50/50 rounded-[24px] pointer-events-none group-hover:to-brand-50/50 transition-all"></div>
                <div className="relative">
                  <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-brand-100 group-hover:rotate-3 transition-all duration-500">
                    <svg className="w-10 h-10 text-gray-300 group-hover:text-brand-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="text-lg font-black text-gray-800 mb-1 tracking-tight">클릭하거나 파일을 끌어다 놓으세요</div>
                  <div className="text-gray-400 text-xs font-bold uppercase tracking-widest">PDF 전용 (최대 500MB)</div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="application/pdf" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="w-14 h-14 bg-red-50 rounded-xl flex items-center justify-center shadow-sm">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-bold truncate">{file.name}</p>
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{(file.size / 1024 / 1024).toFixed(1)} MB • 준비됨</p>
                  </div>
                  <button 
                    onClick={clearFile}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {!result && (
                  <button 
                    onClick={handleUpload}
                    disabled={loading}
                    className={`w-full py-5 rounded-2xl font-black text-sm tracking-tight transition-all duration-300 transform active:scale-[0.98]
                      ${loading 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-900 text-white shadow-xl shadow-gray-200 hover:bg-brand-600 hover:shadow-brand-200 hover:-translate-y-1'}`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>PDF 페이지 분석 및 분할 중...</span>
                      </div>
                    ) : (
                      'PDF 200페이지 단위로 분할 시작'
                    )}
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100 animate-in shake duration-500">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8 fade-in duration-1000">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">분할 완료된 파일 목록</h2>
              <span className="px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black rounded-full border border-green-100 uppercase tracking-widest">
                {result.files.length} CHUNKS CREATED
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.files.map((splitFile, idx) => (
                <div 
                  key={idx}
                  className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-200/50 hover:border-brand-500/30 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-brand-50 transition-colors">
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate leading-tight mb-1">{splitFile.filename}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Segment {idx + 1}</p>
                    </div>
                    <a 
                      href={splitFile.download_url} 
                      download
                      className="w-10 h-10 bg-white border border-gray-100 text-gray-400 rounded-xl flex items-center justify-center hover:bg-brand-500 hover:text-white hover:border-brand-500 shadow-sm transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-6 bg-indigo-50/50 rounded-[24px] border border-indigo-100/50 text-center">
              <p className="text-indigo-600 text-xs font-bold">
                정보: 분할된 파일은 서버에서 일정 시간 후 자동 삭제됩니다. 지금 바로 다운로드하세요.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfSplitter;
