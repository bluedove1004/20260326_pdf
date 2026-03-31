import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Subpath deployment를 위해 base 경로를 /ocr/로 지정
  base: '/ocr/',
  server: {
    // 요청하신 대로 포트를 5173으로 고정
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ["kmgpt.kiom.re.kr"],
    proxy: {
      // 프런트엔드에서 /ocr/api로 오는 요청을 백엔드로 전달
      '/ocr/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr\/api/, '/api'),
      },
    },
  },
})
