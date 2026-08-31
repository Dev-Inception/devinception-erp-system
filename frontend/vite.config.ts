import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'DevInception ERP & POS',
        short_name: 'DevInception',
        description: 'Enterprise-grade retail/wholesale ERP & POS management system',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell is precached; API calls are handled by the runtime rule below.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // GET requests to the backend API: try the network first (fresh data),
            // fall back to the last cached response when offline.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin ? url.pathname.startsWith('/api/') : url.pathname.includes('/api/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Enable SW in `npm run dev` so installability can be tested locally.
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Listen on the LAN, not just localhost, so a phone on the same Wi-Fi
    // can load http(s)://<your-lan-ip>:5173.
    host: true,
    proxy: {
      // Forward API calls server-side to the backend. This keeps the phone
      // talking to a single origin (whatever host/tunnel served the page),
      // sidestepping CORS and (once the page is HTTPS) mixed-content blocks.
      '/api': { target: 'http://localhost:5050', changeOrigin: true },
    },
  },
  base: '/',
});
