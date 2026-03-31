/** All shared TypeScript interfaces for the Book Scan OCR application. */

export interface BBoxCoords {
  top_left: [number, number];
  top_right: [number, number];
  bottom_right: [number, number];
  bottom_left: [number, number];
}

export interface TextBlock {
  block_id: number;
  text: string;
  confidence: number;
  bbox: BBoxCoords;
  line_number: number;
}

export interface PageResult {
  page_number: number | string;
  seq_number: number;
  width: number;
  height: number;
  text_blocks: TextBlock[];
  full_text: string;
  block_count: number;
  avg_confidence: number;
  status: 'completed' | 'failed' | 'empty';
  error?: string;
  extracted_at?: string;
  extracted_by?: string;
}

export interface DocumentResult {
  document_id: string;
  filename: string;
  total_pages: number;
  ocr_engine: string;
  language: string;
  created_at: string;
  processing_time_seconds?: number;
  pages: PageResult[];
}

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DocumentListItem {
  document_id: string;
  filename: string;
  total_pages: number;
  status: DocumentStatus;
  created_at: string;
}

export interface DocumentStatusResponse {
  document_id: string;
  status: DocumentStatus;
  processed_pages: number;
  total_pages: number;
  progress_percent: number;
}

export interface UploadResponse {
  document_id: string;
  total_pages: number;
  status: DocumentStatus;
}

export interface PreprocessingOptions {
  grayscale: boolean;
  binarization: boolean;
  denoise: boolean;
  deskew: boolean;
}

export interface OCRSettings {
  ocr_provider: 'easyocr' | 'google_vision' | 'azure' | 'chatgpt' | 'claude';
  api_key?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  dpi: 150 | 200 | 300 | 400;
  use_gpu: boolean;
  preprocessing: PreprocessingOptions;
}
