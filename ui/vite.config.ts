import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    // Raise the warning threshold — Tencent Chat SDK is inherently large (~1 MB raw)
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split the Tencent SDK into its own chunk so browsers can cache it
        // independently from your app code (better long-term cache hits)
        manualChunks(id: string) {
          if (id.includes('@tencentcloud/chat')) {
            return 'vendor-tencent';
          }
        },
      },
    },
  },
})
