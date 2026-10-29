import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the browser talks only to this server; /api/* is passed on to the API.
// One address for both keeps the refresh cookie (SameSite=Strict, path /api/v1/auth) working.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.HRMS_API_URL || 'https://hrms-api-haqa.onrender.com';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              // The API only accepts refresh/logout from its own app address; in dev that is the proxy, so drop the browser's Origin.
              req.removeHeader('origin');
            });
            proxy.on('proxyRes', (res) => {
              // Dev runs on http://localhost; drop Secure so every browser (Safari too) keeps the refresh cookie.
              const c = res.headers['set-cookie'];
              if (c) {
                res.headers['set-cookie'] = c.map((v) => v.replace(/;\s*Secure/gi, ''));
              }
            });
          },
        },
      },
    },
    build: { sourcemap: false },
  };
});
