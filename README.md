# feCRM (Frontend)

React + Vite frontend using Ant Design and React Router.

## Prerequisites
- Node.js 18+ recommended
- npm (comes with Node)
- AWS CLI v2 for DigitalOcean Spaces uploads

## Setup
```bash
cd /Users/neelpalle/Documents/Playground/crm_neel_tt/feCRM
npm install
```

## Run (dev)
```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Build
```bash
npm run build
```

The build command writes a single CDN-ready artifact at `dist/index.html`. Vite first builds the app, then `scripts/inline-vite-build.mjs` inlines the generated JS, CSS, and favicon so the frontend can be uploaded as one HTML file.

## Deploy to DigitalOcean Spaces CDN

1. Create a DigitalOcean Space and enable its CDN.
2. Create Spaces access keys in DigitalOcean.
3. Configure the frontend production API and Auth0 values in `.env` before building:
   ```bash
   VITE_API_BASE_URL=https://your-backend.example.com
   VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
   VITE_AUTH0_CLIENT_ID=your_client_id
   VITE_AUTH0_AUDIENCE=your_api_audience
   ```
4. Export the Spaces deployment variables. Use `deploy.digitalocean.example.env` as the template.
5. Build and upload:
   ```bash
   npm run build
   set -a
   source deploy.digitalocean.env
   set +a
   npm run deploy:do
   ```

The deploy script uploads `dist/index.html` to `s3://$DO_SPACES_BUCKET/$DO_SPACES_PREFIX/index.html` using the DigitalOcean Spaces S3-compatible endpoint.

For React Router deep links like `/callback`, configure the Space/static-site error document to serve `index.html` if your chosen DigitalOcean hosting path supports it. Otherwise, direct CDN entry should start at `/`, and Auth0 callback/logout URLs should use the CDN origin root plus `/callback`.

## Notes
- Theme tokens are in `/Users/neelpalle/Documents/Playground/crm_neel_tt/feCRM/src/theme.ts`.
- Light/dark palette and Ant Design overrides live in `/Users/neelpalle/Documents/Playground/crm_neel_tt/feCRM/src/styles/theme.css`.
- Routes are defined in `/Users/neelpalle/Documents/Playground/crm_neel_tt/feCRM/src/App.tsx`.
