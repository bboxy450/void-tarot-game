import { defineConfig } from 'vite';
// polling: on this Mac the native watcher silently misses edits and serves stale modules
export default defineConfig({ base: './', server: { watch: { usePolling: true, interval: 150 } }, build: { target: 'es2022', chunkSizeWarningLimit: 2000 } });
