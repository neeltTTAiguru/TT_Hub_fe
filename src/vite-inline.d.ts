// Vite's `?inline` suffix returns the asset as a base64 data: URI string —
// used to embed the logo in exported PDF/Word documents so it shows offline.
declare module '*.png?inline' {
  const src: string
  export default src
}
