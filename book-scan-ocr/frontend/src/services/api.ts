/**
 * Centralised API client.
 * All HTTP calls go through this module.
 * Vite proxies /api → http://127.0.0.1:8000
 */

import axios from 'axios';
import type {
  DocumentListItem,
  DocumentResult,
  DocumentStatusResponse,
  OCRSettings,
  PageResult,
  UploadResponse,
} from '../types';

const api = axios.create({ baseURL: '/api' });

// ──────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  
  // Conditionally add session-stored LLM keys if they exist
  const openaiKey = sessionStorage.getItem('openai_api_key');
  const anthropicKey = sessionStorage.getItem('anthropic_api_key');
  if (openaiKey) form.append('openai_api_key', openaiKey);
  if (anthropicKey) form.append('anthropic_api_key', anthropicKey);

  const { data } = await api.post<UploadResponse>('/upload', form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function listDocuments(): Promise<DocumentListItem[]> {
  const { data } = await api.get<DocumentListItem[]>('/documents');
  return data;
}

export async function getDocumentStatus(id: string): Promise<DocumentStatusResponse> {
  const { data } = await api.get<DocumentStatusResponse>(`/documents/${id}/status`);
  return data;
}

export async function getDocument(id: string): Promise<DocumentResult> {
  const { data } = await api.get<DocumentResult>(`/documents/${id}`);
  return data;
}

export async function getPage(id: string, page: number): Promise<PageResult> {
  const { data } = await api.get<PageResult>(`/documents/${id}/pages/${page}`);
  return data;
}

export function getPageImageUrl(id: string, page: number): string {
  return `/api/documents/${id}/pages/${page}/image`;
}

export async function llmExtractPage(
  id: string,
  page: number,
  params: { provider: string; api_key: string; model?: string }
): Promise<PageResult> {
  const { data } = await api.post<PageResult>(`/documents/${id}/pages/${page}/llm-extract`, params);
  return data;
}

export function getDownloadUrl(id: string): string {
  return `/api/documents/${id}/download`;
}

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

export async function getSettings(): Promise<OCRSettings> {
  const { data } = await api.get<OCRSettings>('/settings');
  return data;
}

export async function saveSettings(settings: Partial<OCRSettings> & { api_key?: string }): Promise<void> {
  await api.post('/settings', settings);
}
