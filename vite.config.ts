import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// GitHub Pages는 https://사용자명.github.io/simetro/ 형태(하위 경로)로 서빙되므로,
// 로컬 개발(host:true, base 기본값 '/')에는 영향 없이 프로덕션 빌드에서만 base를 붙인다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/simetro/' : '/',
  server: {
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Simetro - 서울 지하철 시뮬레이터',
        short_name: 'Simetro',
        description: '실제 수도권 전철 배차와 소요시간을 반영한 오프라인 지하철 시뮬레이터',
        lang: 'ko',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/simetro/',
        scope: '/simetro/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
}))
