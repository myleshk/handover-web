import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => {
  const config = {
    plugins: [vue()],
    base: '/',
    server: {
      port: 3000,
      proxy: {
        '/centrifuge': {
          target: 'http://localhost:8080',
          ws: true
        },
        '/upload': {
          target: 'http://localhost:8080'
        },
        '/files': {
          target: 'http://localhost:8080'
        }
      }
    }
  }

  return config
})
