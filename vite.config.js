import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => {
  const config = {
    plugins: [vue()],
    server: {
      port: 3000,
      proxy: {
        '/centrifuge': {
          target: 'http://localhost:8080',
          ws: true
        }
      }
    }
  }

  // Set base path for GitHub Pages deployment
  if (command === 'build') {
    config.base = '/handover-web/'
  }

  return config
})
