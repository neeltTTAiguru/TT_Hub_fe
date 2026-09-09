import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The Hermes dashboard's SPA does not survive being framed cross-origin: it
// renders, then ignores all input, because its UI library walks parent windows
// for popover positioning and that throws SecurityError across an origin
// boundary. Framed same-origin it works, so the Orchestrator page loads Hermes
// through this proxy instead of pointing at 127.0.0.1:9119 directly.
//
// It has to be proxied at the ROOT rather than under a prefix: the dashboard has
// no base-path support, so its bundle asks for /assets and /api absolutely.
// None of these paths collide with the Hub -- the Hub's own routes are disjoint
// from Hermes', and the Hub's production index.html inlines every asset, so it
// never serves /assets itself.
//
// /login and /auth are Hermes' own sign-in bootstrap. Bound to a non-loopback
// address the dashboard engages its OAuth gate and answers an unauthenticated
// /chat with 302 -> /login; without these entries that redirect leaves the proxy
// and the Hub answers it with its own index.html.
const HERMES_ROUTES = [
  '/analytics',
  '/auth',
  '/channels',
  '/chat',
  '/config',
  '/cron',
  '/docs',
  '/env',
  '/files',
  '/login',
  '/logs',
  '/mcp',
  '/models',
  '/pairing',
  '/plugins',
  '/profiles',
  '/sessions',
  '/skills',
  '/system',
  '/webhooks',
]

// Static + API surface. `/api` carries the chat's PTY websocket, so it needs
// ws:true or the embedded terminal connects and immediately drops.
const HERMES_ASSETS = ['/assets', '/ds-assets', '/fonts', '/fonts-terminal']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Dev sends Hermes' paths through the BACKEND, exactly as production does, so
  // the cookie gate and the backend proxy are the code being exercised here
  // rather than a dev-only shortcut that hides a prod failure. Point
  // HERMES_WEB_ORIGIN straight at the dashboard to bypass the backend when
  // debugging Hermes itself.
  const target = (env.HERMES_WEB_ORIGIN || env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

  const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean }> = {
    '/api': { target, changeOrigin: true, ws: true },
    // Mints the cookie the iframe travels on. Always the backend, never Hermes.
    '/hermes-session': {
      target: (env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, ''),
      changeOrigin: true,
    },
  }
  for (const path of [...HERMES_ASSETS, ...HERMES_ROUTES]) {
    proxy[path] = { target, changeOrigin: true }
  }

  return {
    base: './',
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rolldownOptions: {
        output: {
          codeSplitting: false,
        },
      },
    },
    server: { proxy },
    plugins: [react()],
  }
})
