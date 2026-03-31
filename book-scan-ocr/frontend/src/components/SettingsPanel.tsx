/**
 * Settings panel: OCR provider, API key, preprocessing toggles, DPI.
 * Redesigned for Premium Light Theme.
 */

import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../services/api';
import type { OCRSettings } from '../types';

const SettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<Partial<OCRSettings>>({
    ocr_provider: 'easyocr',
    dpi: 300,
    preprocessing: { grayscale: true, binarization: false, denoise: false, deskew: false },
  });
  const [apiKey, setApiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState(sessionStorage.getItem('openai_api_key') || '');
  const [anthropicKey, setAnthropicKey] = useState(sessionStorage.getItem('anthropic_api_key') || '');

  const [showKey, setShowKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ ...settings, api_key: apiKey || undefined });

      // Store LLM keys in sessionStorage as requested
      if (openaiKey) sessionStorage.setItem('openai_api_key', openaiKey);
      else sessionStorage.removeItem('openai_api_key');

      if (anthropicKey) sessionStorage.setItem('anthropic_api_key', anthropicKey);
      else sessionStorage.removeItem('anthropic_api_key');

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const updatePreprocessing = (key: string, val: boolean) => {
    setSettings((prev) => ({
      ...prev,
      preprocessing: { ...prev.preprocessing!, [key]: val } as OCRSettings['preprocessing'],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in bg-white">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Settings</h1>
          <p className="text-sm text-gray-400 font-medium font-sans">OCR 엔진 및 AI 추출을 위한 API 키를 관리합니다.</p>
        </div>

        {/* OCR Provider */}
        <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">OCR 엔진 선택</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {(['easyocr', 'google_vision', 'azure', 'chatgpt', 'claude'] as const).map((provider) => (
              <button
                key={provider}
                id={`provider-${provider}`}
                onClick={() => setSettings((p) => ({ ...p, ocr_provider: provider }))}
                className={`py-3.5 px-4 rounded-2xl border text-sm font-bold transition-all duration-300
                ${settings.ocr_provider === provider
                    ? 'border-brand-500 bg-brand-50 text-brand-600 shadow-md shadow-brand-100/50'
                    : 'border-gray-100 bg-gray-50/50 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
              >
                {provider === 'easyocr' ? 'EasyOCR' :
                  provider === 'google_vision' ? 'Google Vision' :
                    provider === 'azure' ? 'Azure OCR' :
                      provider === 'chatgpt' ? 'ChatGPT 4o' : 'Claude 3.5'}
              </button>
            ))}
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm space-y-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">API 보안 설정</h2>
          </div>

          <div className="space-y-6">
            {/* Standard API Key */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-tight ml-1">Cloud Vision / Azure (서버 저장)</label>
              <div className="relative">
                <input
                  id="api-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API Key를 입력하세요"
                  className="w-full bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-900 focus:bg-white focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none pr-12 font-medium"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                  type="button"
                >
                  {showKey ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-emerald-600 uppercase tracking-tight ml-1">OpenAI API Key (세션 전용)</label>
              <div className="relative">
                <input
                  id="openai-key-input"
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-900 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none pr-12 font-medium"
                />
                <button
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
                  type="button"
                >
                  {showOpenaiKey ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Anthropic API Key */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-amber-600 uppercase tracking-tight ml-1">Anthropic API Key (세션 전용)</label>
              <div className="relative">
                <input
                  id="anthropic-key-input"
                  type={showAnthropicKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3.5 text-sm text-gray-900 focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none pr-12 font-medium"
                />
                <button
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-600 transition-colors"
                  type="button"
                >
                  {showAnthropicKey ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* DPI & Preprocessing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">PDF DPI</h2>
            </div>
            <div className="flex gap-2">
              {([150, 200, 300, 400] as const).map((dpi) => (
                <button
                  key={dpi}
                  id={`dpi-${dpi}`}
                  onClick={() => setSettings((p) => ({ ...p, dpi }))}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all duration-300
                  ${settings.dpi === dpi
                      ? 'border-brand-500 bg-brand-50 text-brand-600 shadow-inner'
                      : 'border-gray-100 bg-gray-50/50 text-gray-400 hover:border-gray-200'}`}
                >
                  {dpi}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-7 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">이미지 최적화</h2>
            </div>
            <div className="space-y-3">
              {[
                { key: 'grayscale', label: '그레이스케일' },
                { key: 'deskew', label: '기울기 보정' },
              ].map(({ key, label }) => {
                const value = settings.preprocessing?.[key as keyof typeof settings.preprocessing] ?? false;
                return (
                  <div key={key} className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-2xl">
                    <span className="text-sm font-bold text-gray-700">{label}</span>
                    <button
                      onClick={() => updatePreprocessing(key, !value)}
                      className={`w-12 h-6.5 rounded-full transition-all duration-300 relative p-1
                      ${value ? 'bg-brand-500' : 'bg-gray-200'}`}
                    >
                      <div className={`w-4.5 h-4.5 bg-white rounded-full shadow-md transition-transform duration-300
                      ${value ? 'translate-x-5.5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 btn-primary py-4 rounded-2xl text-base font-bold shadow-xl shadow-brand-200/50 active:scale-[0.98] transition-transform"
            id="save-settings-btn"
          >
            {saving ? (
              <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : '설정 정보 저장하기'}
          </button>
          {saved && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl animate-slide-up flex items-center gap-2 z-50">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-bold text-sm">설정이 성공적으로 저장되었습니다</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Simple Icon Components
const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export default SettingsPanel;
