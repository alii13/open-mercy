import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, '../shared/engine'),
      '@protocol': path.resolve(__dirname, '../shared/protocol.ts'),
      '@roomCode': path.resolve(__dirname, '../shared/roomCode.ts'),
      '@quickChat': path.resolve(__dirname, '../shared/quickChat.ts'),
      '@lounge': path.resolve(__dirname, '../shared/lounge.ts'),
      '@handles': path.resolve(__dirname, '../shared/handles.ts'),
    },
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg'],
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '../shared/engine/**/*.test.ts',
      '../shared/__tests__/**/*.test.ts',
      '../game-server/src/**/*.test.ts',
    ],
  },
})
