import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { posix } from 'node:path'

const projectRoot = new URL('..', import.meta.url)
const distDir = new URL('dist/', projectRoot)
const publicDir = new URL('public/', projectRoot)
const indexPath = new URL('index.html', distDir)

const mimeTypes = new Map([
  ['.css', 'text/css'],
  ['.js', 'text/javascript'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
])

function getExtension(path) {
  const match = path.match(/\.[a-zA-Z0-9]+(?:[?#].*)?$/)
  return match ? match[0].replace(/[?#].*$/, '').toLowerCase() : ''
}

function escapeInlineScript(content) {
  return content.replace(/<\/script/gi, '<\\/script')
}

function escapeInlineStyle(content) {
  return content.replace(/<\/style/gi, '<\\/style')
}

async function readAsset(assetPath) {
  const normalized = assetPath.replace(/^[/.]+/, '')
  const candidates = [
    new URL(normalized, distDir),
    new URL(normalized, publicDir),
  ]

  for (const candidate of candidates) {
    try {
      return await readFile(candidate)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  throw new Error(`Could not find asset referenced by index.html: ${assetPath}`)
}

async function inlineStyles(html) {
  const styleLinkPattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi
  let output = html

  for (const match of html.matchAll(styleLinkPattern)) {
    const [tag, href] = match
    const css = await readAsset(href)
    output = output.replace(tag, () => `<style>${escapeInlineStyle(css.toString('utf8'))}</style>`)
  }

  return output
}

async function inlineModuleScripts(html) {
  const scriptPattern = /<script\s+([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi
  let output = html

  for (const match of html.matchAll(scriptPattern)) {
    const [tag, beforeSrc, src, afterSrc] = match
    const script = await readAsset(src)
    const attributes = `${beforeSrc} ${afterSrc}`.replace(/\s*crossorigin(?:=["'][^"']*["'])?/gi, '').trim()
    output = output.replace(tag, () => `<script ${attributes}>${escapeInlineScript(script.toString('utf8'))}</script>`)
  }

  return output
}

async function inlineLinkedAssets(html) {
  const linkPattern = /<link\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi
  let output = html

  for (const match of html.matchAll(linkPattern)) {
    const [tag, beforeHref, href, afterHref] = match

    if (/rel=["']stylesheet["']/i.test(tag) || href.startsWith('data:') || /^https?:\/\//i.test(href)) {
      continue
    }

    const extension = getExtension(href)
    const mimeType = mimeTypes.get(extension)

    if (!mimeType) {
      continue
    }

    const asset = await readAsset(href)
    const dataUrl = `data:${mimeType};base64,${asset.toString('base64')}`
    const replacement = `<link ${beforeHref}href="${dataUrl}"${afterHref}>`
    output = output.replace(tag, () => replacement)
  }

  return output
}

async function removeExtraDistEntries() {
  const entries = await readdir(distDir, { withFileTypes: true })

  await Promise.all(
    entries
      .filter((entry) => entry.name !== 'index.html')
      .map((entry) => rm(new URL(entry.name, distDir), { recursive: true, force: true })),
  )
}

let html = await readFile(indexPath, 'utf8')
html = await inlineStyles(html)
html = await inlineModuleScripts(html)
html = await inlineLinkedAssets(html)

await writeFile(indexPath, html)
await removeExtraDistEntries()

const bytes = Buffer.byteLength(html)
console.log(`Wrote single-file CDN artifact: ${posix.join('dist', 'index.html')} (${bytes.toLocaleString()} bytes)`)
