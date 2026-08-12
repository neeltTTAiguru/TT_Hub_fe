declare module 'grapesjs-preset-newsletter' {
  // UMD build; the real plugin function may be nested under .default depending
  // on the bundler's interop. Typed loosely and resolved at runtime.
  const plugin: unknown
  export default plugin
}
