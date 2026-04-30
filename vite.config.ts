import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  plugins: [react()],
})
