/**
 * Centralised API client.
 * All HTTP calls go through this module.
 * Dynamically handles base URL (e.g., /ocr/api if deployed behind /ocr)
 */

import axios from 'axios';
import type {
  DocumentListItem,
  DocumentResult,
  DocumentStatusResponse,
  OCRSettings,
  PageResult,
  UploadResponse,
  PaginatedDocuments,
} from '../types';

// Robustly detect base path (handles direct domain vs subpath /ocr/ deployment)
const currentPath = window.location.pathname;
const BASE_PATH = currentPath.startsWith('/ocr/') 
  ? '/ocr/' 
  : ((import.meta as any).env.BASE_URL || '/');

const api = axios.create({ 
  baseURL: `${BASE_PATH.endsWith('/') ? BASE_PATH : BASE_PATH + '/'}api` 
});

// Automatically inject auth token from localStorage if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ocr_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ──────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  
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

export async function listDocuments(page = 1, size = 10, search?: string): Promise<PaginatedDocuments> {
  const { data } = await api.get<PaginatedDocuments>('/documents', {
    params: { page, size, q: search },
  });
  return data;
}

export async function getDocumentStatus(id: string): Promise<DocumentStatusResponse> {
  const { data } = await api.get<DocumentStatusResponse>(`/documents/${id}/status`);
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`);
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
  const token = localStorage.getItem('ocr_auth_token');
  return `${api.defaults.baseURL}/documents/${id}/pages/${page}/image?token=${token}`;
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
  const token = localStorage.getItem('ocr_auth_token');
  return `${api.defaults.baseURL}/documents/${id}/download?token=${token}`;
}

export function getMinimalDownloadUrl(id: string): string {
  const token = localStorage.getItem('ocr_auth_token');
  return `${api.defaults.baseURL}/documents/${id}/download-minimal?token=${token}`;
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
