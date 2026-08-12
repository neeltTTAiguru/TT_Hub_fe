import { useEffect, useRef, useState } from 'react'
import grapesjs, { type Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import presetNewsletterImport from 'grapesjs-preset-newsletter'
import { Alert, Button, Space, Typography, message } from 'antd'
import trustedLogo from '../assets/trusted-technology-primary-logo.png'

const { Title, Text } = Typography

const STORAGE_KEY = 'tt-email-builder'

type PluginFn = (editor: unknown, options?: Record<string, unknown>) => void

// The newsletter preset ships as a UMD bundle. Depending on the bundler's
// CJS/ESM interop, the plugin function can be the import itself, or nested one
// or two levels under `.default`. Resolve it robustly instead of assuming.
function resolvePresetPlugin(mod: unknown): PluginFn {
  const candidates: unknown[] = [
    mod,
    (mod as { default?: unknown })?.default,
    (mod as { default?: { default?: unknown } })?.default?.default,
    (mod as Record<string, unknown>)?.['grapesjs-preset-newsletter'],
  ]
  const fn = candidates.find((candidate) => typeof candidate === 'function')
  if (!fn) {
    throw new Error('grapesjs-preset-newsletter: could not resolve the plugin function from the module export.')
  }
  return fn as PluginFn
}

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300'%3E%3Crect width='100%25' height='100%25' fill='%23d4d6ce'/%3E%3Ctext x='50%25' y='50%25' fill='%236b6f76' font-family='Arial' font-size='18' text-anchor='middle' dominant-baseline='middle'%3EClick to add your image%3C/text%3E%3C/svg%3E"

// ---- The only three building blocks: Logo, Image/Content, Bottom Text ----

const SECTION_LOGO = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:28px;text-align:center">
  <img src="${trustedLogo}" alt="Trusted Technology Solutions" style="width:230px;max-width:70%;height:auto"/>
</td></tr></table>`

const SECTION_CONTENT = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:28px;text-align:center;font-family:Arial,Helvetica,sans-serif">
  <img src="${PLACEHOLDER_IMAGE}" alt="" style="width:100%;max-width:536px;height:auto;border-radius:6px;margin-bottom:20px"/>
  <div style="font-size:26px;font-weight:bold;color:#2f3136;margin-bottom:12px">Your headline here</div>
  <div style="font-size:16px;color:#2f3136;line-height:1.7">Double-click to edit this text. Add your message, product details, or announcement here.</div>
</td></tr></table>`

const SECTION_BOTTOM = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#f6f6f2;padding:24px 32px 40px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6f76;line-height:1.9;border-top:1px solid #d4d6ce">
  <div>Trusted Technology Solutions, Inc.</div>
  <div>Western USA, Eastern USA</div>
  <div>troy.broddrick@trustedtechnology.ai, neil@trustedtechnology.ai</div>
  <div style="margin-top:12px"><a href="#" style="color:#6b6f76;text-decoration:underline">update your preferences</a> or <a href="#" style="color:#6b6f76;text-decoration:underline">unsubscribe</a></div>
</td></tr></table>`

// Pre-filled Trusted content used in the starter (same "Image / Content" block).
const STARTER_CONTENT = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#1f2a3a;padding:40px 32px;text-align:center;font-family:Arial,Helvetica,sans-serif">
  <img src="${PLACEHOLDER_IMAGE}" alt="" style="width:100%;max-width:536px;height:auto;border-radius:6px;margin-bottom:22px"/>
  <div style="color:#f6f1e7;font-size:38px;line-height:1.1;font-weight:bold;margin-bottom:14px">YOUR WORD VS. THEIRS. OR JUST THE FOOTAGE.</div>
  <div style="color:#ffffff;font-size:20px;font-weight:bold;margin-bottom:8px">The T500 settles it every time.</div>
  <div style="color:#c9d3e0;font-size:15px;line-height:2">Simple &bull; Secure &bull; Reliable &bull; Affordable</div>
</td></tr></table>`

const STARTER_TEMPLATE = `
<table style="width:100%;background-color:#f6f6f2;margin:0" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:24px 12px">
    <table style="width:600px;max-width:600px" cellpadding="0" cellspacing="0">
      <tr><td>${SECTION_LOGO}</td></tr>
      <tr><td>${STARTER_CONTENT}</td></tr>
      <tr><td>${SECTION_BOTTOM}</td></tr>
    </table>
  </td></tr>
</table>`

// Three friendly block icons (inherit color via currentColor).
const IC = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M8.5 9.5h7M12 9.5V16" stroke-linecap="round"/></svg>`,
  content: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="11" rx="2"/><circle cx="8" cy="8.5" r="1.4"/><path d="M4 13l4-3 3 2 3-3 6 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke-linecap="round"/></svg>`,
  bottom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15h10M9 18h6" stroke-linecap="round"/></svg>`,
}

const THREE_BLOCKS: Array<{ id: string; label: string; media: string; content: string }> = [
  { id: 'tt-logo', label: 'Logo', media: IC.logo, content: SECTION_LOGO },
  { id: 'tt-content', label: 'Image / Content', media: IC.content, content: SECTION_CONTENT },
  { id: 'tt-bottom', label: 'Bottom Text', media: IC.bottom, content: SECTION_BOTTOM },
]

// Reduce the editor to just three drag-in blocks and hide developer controls.
function simplifyEditor(editor: Editor) {
  const blocks = editor.BlockManager

  // Clear every default/preset block, then add only our three.
  blocks.getAll().reset()
  const category = { id: 'sections', label: 'Add to your email', open: true }
  THREE_BLOCKS.forEach((block) => {
    blocks.add(block.id, {
      label: block.label,
      media: block.media,
      content: block.content,
      category,
    })
  })

  // Strip developer-only controls (code view, HTML import, layers).
  const panels = editor.Panels
  ;['export-template', 'gjs-open-import-webpage', 'open-import'].forEach((id) => {
    try {
      panels.removeButton('options', id)
    } catch {
      /* button may not exist */
    }
  })
  try {
    panels.removeButton('views', 'open-layers')
  } catch {
    /* button may not exist */
  }

  editor.runCommand('open-blocks')
}

// Keep every image inside the email width. When a layperson swaps in a photo,
// it arrives at its full pixel size (e.g. 789x896) and blows out the layout —
// so cap oversized images to the container and fix their aspect ratio, while
// leaving small images (like the 230px logo) untouched.
const EMAIL_WIDTH = 600

function makeImagesFluid(editor: Editor) {
  const enforce = (component: unknown) => {
    const comp = component as {
      is?: (type: string) => boolean
      getStyle?: () => Record<string, string>
      addStyle?: (style: Record<string, string>) => void
      getAttributes?: () => Record<string, string>
      setAttributes?: (attrs: Record<string, string>) => void
    }
    if (!comp || typeof comp.is !== 'function' || !comp.is('image')) return

    // Fixed width/height HTML attributes override CSS in some clients — drop them.
    const attrs = comp.getAttributes?.() ?? {}
    if (attrs.width || attrs.height) {
      const nextAttrs = { ...attrs }
      delete nextAttrs.width
      delete nextAttrs.height
      comp.setAttributes?.(nextAttrs)
    }

    const style = comp.getStyle?.() ?? {}
    const width = style.width || ''
    const height = style.height || ''
    const nextStyle: Record<string, string> = {}

    if (/px$/.test(height)) nextStyle.height = 'auto'
    if (/px$/.test(width) && parseFloat(width) > EMAIL_WIDTH && width !== '100%') nextStyle.width = '100%'
    if (/px$/.test(width) && style['max-width'] !== '100%') nextStyle['max-width'] = '100%'

    if (Object.keys(nextStyle).length) comp.addStyle?.(nextStyle)
  }

  editor.on('component:add', enforce)
  editor.on('component:update', enforce)
  editor.on('load', () => {
    const wrapper = editor.getWrapper()
    wrapper?.find('img').forEach(enforce)
  })
}

export default function EmailCampaignBuilder() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const [ready, setReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    let editor: Editor | null = null
    try {
      const presetNewsletter = resolvePresetPlugin(presetNewsletterImport)

      editor = grapesjs.init({
        container: containerRef.current,
        height: 'calc(100vh - 240px)',
        fromElement: false,
        storageManager: {
          type: 'local',
          autosave: true,
          stepsBeforeSave: 3,
          options: { local: { key: STORAGE_KEY } },
        },
        plugins: [(ed: unknown) => presetNewsletter(ed, {})],
      })

      simplifyEditor(editor)
      makeImagesFluid(editor)

      // Seed the Trusted-branded starter only on a truly empty canvas.
      const hasSaved = Boolean(
        window.localStorage.getItem(`gjs-${STORAGE_KEY}`) || window.localStorage.getItem(STORAGE_KEY),
      )
      if (!hasSaved && !editor.getHtml().replace(/<[^>]*>/g, '').trim()) {
        editor.setComponents(STARTER_TEMPLATE)
      }

      editorRef.current = editor
      setReady(true)
    } catch (error) {
      setInitError(error instanceof Error ? error.message : 'Failed to initialise the email builder.')
      if (editor) {
        try {
          editor.destroy()
        } catch {
          /* ignore teardown errors */
        }
      }
      editorRef.current = null
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [])

  function getInlinedHtml(): string {
    const editor = editorRef.current
    if (!editor) return ''
    return (editor.runCommand('gjs-get-inlined-html') as string) || ''
  }

  function handlePreview() {
    const html = getInlinedHtml()
    if (!html) return
    const preview = window.open('', '_blank')
    if (!preview) {
      message.warning('Allow pop-ups to preview your email in a new tab')
      return
    }
    preview.document.open()
    preview.document.write(html)
    preview.document.close()
  }

  async function handleCopy() {
    const html = getInlinedHtml()
    if (!html) return
    try {
      await navigator.clipboard.writeText(html)
      message.success('Email copied — ready to paste anywhere')
    } catch {
      message.error('Could not access the clipboard')
    }
  }

  function handleDownload() {
    const html = getInlinedHtml()
    if (!html) return
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'trusted-campaign.html'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleResetTemplate() {
    const editor = editorRef.current
    if (!editor) return
    editor.setComponents(STARTER_TEMPLATE)
    message.success('Loaded the Trusted starter template')
  }

  return (
    <div className="email-builder">
      <div className="email-builder-head">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>Campaign Builder</Title>
          <Text type="secondary">Build a Trusted Technology email — no code, just drag, drop, and type.</Text>
        </div>
        <Space wrap>
          <Button onClick={handleResetTemplate} disabled={!ready}>Start from template</Button>
          <Button onClick={handlePreview} disabled={!ready}>Preview</Button>
          <Button onClick={handleDownload} disabled={!ready}>Download</Button>
          <Button type="primary" onClick={handleCopy} disabled={!ready}>Copy email</Button>
        </Space>
      </div>

      {initError ? (
        <Alert type="error" showIcon message="The email builder failed to load" description={initError} />
      ) : (
        <Alert
          type="info"
          showIcon
          closable
          className="email-builder-help"
          message="How to build your email"
          description={
            <ol className="email-builder-steps">
              <li><b>Drag</b> a block — Logo, Image / Content, or Bottom Text — onto your email.</li>
              <li><b>Double-click</b> any text to edit it, and <b>click an image</b> to swap it.</li>
              <li>Hit <b>Preview</b> to see it, then <b>Copy email</b> when you’re happy. (Sending through Brevo is coming next.)</li>
            </ol>
          }
        />
      )}

      <div className="email-builder-canvas" ref={containerRef} />
    </div>
  )
}
