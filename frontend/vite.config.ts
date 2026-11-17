export default {
  server: {
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  build: {
    outDir: 'dist'
  }
}
/// <reference types="vite/client" />