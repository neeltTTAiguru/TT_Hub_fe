import { useEffect, useRef, useState } from 'react'
import grapesjs, { type Editor } from 'grapesjs'
import 'grapesjs/dist/css/grapes.min.css'
import presetNewsletterImport from 'grapesjs-preset-newsletter'
import { Alert, Button, Input, Modal, Select, Space, Typography, message } from 'antd'
import trustedLogo from '../assets/trusted-technology-primary-logo.png'
import {
  fetchBrevoLists,
  fetchBrevoSenders,
  createBrevoCampaign,
  sendBrevoCampaign,
  sendBrevoDirect,
  type BrevoList,
  type BrevoSender,
} from '../lib/api'

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


const SECTION_HEADING = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:28px 28px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif">
  <div style="font-size:28px;font-weight:bold;color:#2f3136;line-height:1.25">Your headline goes here</div>
</td></tr></table>`

const SECTION_TEXT = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:12px 28px 24px;font-family:Arial,Helvetica,sans-serif">
  <div style="font-size:16px;color:#2f3136;line-height:1.7">Double-click to edit this paragraph. Keep it short — a couple of sentences reads better in an inbox than a wall of text.</div>
</td></tr></table>`

const SECTION_BUTTON = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:8px 28px 32px;text-align:center">
  <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background-color:#1f2a3a;border-radius:6px">
    <a href="https://trustedtechnology.ai" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">Learn more</a>
  </td></tr></table>
</td></tr></table>`

const SECTION_IMAGE = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:20px 28px">
  <img src="${PLACEHOLDER_IMAGE}" alt="" style="width:100%;max-width:544px;height:auto;border-radius:6px"/>
</td></tr></table>`

const SECTION_TWO_COLUMN = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:20px 28px;font-family:Arial,Helvetica,sans-serif">
  <table style="width:100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:50%;padding-right:10px;vertical-align:top">
      <img src="${PLACEHOLDER_IMAGE}" alt="" style="width:100%;height:auto;border-radius:6px;margin-bottom:10px"/>
      <div style="font-size:15px;color:#2f3136;line-height:1.6">Left column text.</div>
    </td>
    <td style="width:50%;padding-left:10px;vertical-align:top">
      <img src="${PLACEHOLDER_IMAGE}" alt="" style="width:100%;height:auto;border-radius:6px;margin-bottom:10px"/>
      <div style="font-size:15px;color:#2f3136;line-height:1.6">Right column text.</div>
    </td>
  </tr></table>
</td></tr></table>`

const SECTION_DIVIDER = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;padding:8px 28px">
  <div style="border-top:1px solid #d4d6ce;font-size:0;line-height:0">&nbsp;</div>
</td></tr></table>`

const SECTION_SPACER = `
<table style="width:100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:#ffffff;height:32px;font-size:0;line-height:0">&nbsp;</td></tr></table>`

// Block icons (inherit color via currentColor).
const IC = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M8.5 9.5h7M12 9.5V16" stroke-linecap="round"/></svg>`,
  content: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="11" rx="2"/><circle cx="8" cy="8.5" r="1.4"/><path d="M4 13l4-3 3 2 3-3 6 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke-linecap="round"/></svg>`,
  bottom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15h10M9 18h6" stroke-linecap="round"/></svg>`,
  heading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6v12M13 6v12M5 12h8" stroke-linecap="round"/><path d="M17 10h3M18.5 10v8" stroke-linecap="round"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 10h16M4 14h12M4 18h8" stroke-linecap="round"/></svg>`,
  button: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M9 12h6" stroke-linecap="round"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M4 17l5-4 3 2 3-3 5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  columns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="7.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="7.5" height="14" rx="1.5"/></svg>`,
  divider: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18" stroke-linecap="round"/><path d="M6 7h12M6 17h12" stroke-linecap="round" opacity="0.35"/></svg>`,
  spacer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v16" stroke-linecap="round"/><path d="M8 7l4-3 4 3M8 17l4 3 4-3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
}

type SectionBlock = { id: string; label: string; media: string; content: string; group: string }

// Grouped so the palette reads as "what part of an email am I adding?"
const SECTION_BLOCKS: SectionBlock[] = [
  { id: 'tt-logo', label: 'Logo', media: IC.logo, content: SECTION_LOGO, group: 'header' },
  { id: 'tt-heading', label: 'Heading', media: IC.heading, content: SECTION_HEADING, group: 'content' },
  { id: 'tt-text', label: 'Paragraph', media: IC.text, content: SECTION_TEXT, group: 'content' },
  { id: 'tt-image', label: 'Image', media: IC.image, content: SECTION_IMAGE, group: 'content' },
  { id: 'tt-content', label: 'Image + Text', media: IC.content, content: SECTION_CONTENT, group: 'content' },
  { id: 'tt-columns', label: 'Two columns', media: IC.columns, content: SECTION_TWO_COLUMN, group: 'content' },
  { id: 'tt-button', label: 'Button', media: IC.button, content: SECTION_BUTTON, group: 'content' },
  { id: 'tt-divider', label: 'Divider', media: IC.divider, content: SECTION_DIVIDER, group: 'layout' },
  { id: 'tt-spacer', label: 'Spacer', media: IC.spacer, content: SECTION_SPACER, group: 'layout' },
  { id: 'tt-bottom', label: 'Footer', media: IC.bottom, content: SECTION_BOTTOM, group: 'footer' },
]

const BLOCK_GROUPS: Record<string, { id: string; label: string; open: boolean }> = {
  header: { id: 'header', label: 'Header', open: true },
  content: { id: 'content', label: 'Content', open: true },
  layout: { id: 'layout', label: 'Spacing', open: true },
  footer: { id: 'footer', label: 'Footer', open: true },
}

// Reduce the editor to labelled, drag-in email sections and hide dev controls.
function simplifyEditor(editor: Editor) {
  const blocks = editor.BlockManager

  // Clear every default/preset block, then add only our three.
  blocks.getAll().reset()
  SECTION_BLOCKS.forEach((block) => {
    blocks.add(block.id, {
      label: block.label,
      media: block.media,
      content: block.content,
      category: BLOCK_GROUPS[block.group],
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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

// Inline styles on pasted/uploaded images win over the component-level fixes,
// so enforce fluid images inside the canvas document itself.
function constrainCanvas(editor: Editor) {
  const apply = () => {
    const doc = editor.Canvas.getDocument()
    if (!doc || doc.getElementById('tt-canvas-fit')) return
    const style = doc.createElement('style')
    style.id = 'tt-canvas-fit'
    style.textContent = `
      body { margin: 0; background: #f6f6f2; }
      img { max-width: 100% !important; height: auto !important; }
      table { max-width: 100% !important; }
    `
    doc.head?.appendChild(style)
  }
  editor.on('load', apply)
  editor.on('canvas:frame:load', apply)
}

// The logo and any bundled art are served from this app's origin, which means
// nothing to a mail client. Convert those to data URIs so the backend can store
// them and rewrite the markup to absolute, publicly fetchable URLs.
async function inlineLocalImages(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src') || ''
      if (!src || src.startsWith('data:')) return
      const isForeign = /^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)
      if (isForeign) return

      try {
        const response = await fetch(src)
        if (!response.ok) return
        const blob = await response.blob()
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('read failed'))
          reader.readAsDataURL(blob)
        })
        img.setAttribute('src', dataUri)
      } catch {
        // Leave the original src; the send will still go out, just without it.
      }
    }),
  )

  return doc.body.innerHTML
}

export default function EmailCampaignBuilder() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const [ready, setReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  const [lists, setLists] = useState<BrevoList[]>([])
  const [senders, setSenders] = useState<BrevoSender[]>([])
  const [brevoError, setBrevoError] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<string[]>([])
  const [senderEmail, setSenderEmail] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchBrevoLists(), fetchBrevoSenders()])
      .then(([nextLists, nextSenders]) => {
        if (cancelled) return
        setLists(nextLists)
        setSenders(nextSenders)
        const firstActive = nextSenders.find((sender) => sender.active)
        if (firstActive) setSenderEmail(firstActive.email)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setBrevoError(error instanceof Error ? error.message : 'Could not reach Brevo')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // "To" mixes Brevo lists (stored as `list:<id>`) with free-typed addresses.
  const listIds = recipients
    .filter((value) => value.startsWith('list:'))
    .map((value) => Number(value.slice(5)))
  const directEmails = recipients.filter((value) => !value.startsWith('list:'))

  const recipientCount =
    listIds.reduce((total, id) => total + (lists.find((list) => list.id === id)?.contactCount ?? 0), 0) +
    directEmails.length

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    let editor: Editor | null = null
    try {
      const presetNewsletter = resolvePresetPlugin(presetNewsletterImport)

      editor = grapesjs.init({
        container: containerRef.current,
        height: 'calc(100vh - 430px)',
        fromElement: false,
        // An email is 600px wide. Without pinning the device widths the canvas
        // renders at desktop width and the design reads as zoomed in and clipped.
        deviceManager: {
          devices: [
            { id: 'desktop', name: 'Desktop', width: `${EMAIL_WIDTH}px`, widthMedia: '' },
            { id: 'tablet', name: 'Tablet', width: '480px', widthMedia: '480px' },
            { id: 'mobile', name: 'Mobile', width: '320px', widthMedia: '320px' },
          ],
        },
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
      constrainCanvas(editor)

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

  async function getSendableHtml(): Promise<string> {
    const html = getInlinedHtml()
    return html ? inlineLocalImages(html) : ''
  }

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

  function handleRecipientsChange(next: string[]) {
    const kept: string[] = []
    for (const value of next) {
      if (value.startsWith('list:')) {
        kept.push(value)
        continue
      }
      const email = value.trim().toLowerCase()
      if (!EMAIL_PATTERN.test(email)) {
        message.warning(`"${value}" is not a valid email address`)
        continue
      }
      if (!kept.includes(email)) kept.push(email)
    }
    setRecipients(kept)
  }

  // Every send path creates a fresh draft campaign first, so what goes out is
  // exactly the HTML on screen right now.
  async function createDraft(): Promise<number | null> {
    const html = await getSendableHtml()
    const sender = senders.find((candidate) => candidate.email === senderEmail)
    if (!html) {
      message.error('The email is empty')
      return null
    }
    const { id } = await createBrevoCampaign({
      subject: subject.trim(),
      senderName: sender?.name || senderEmail,
      senderEmail,
      htmlContent: html,
      listIds,
    })
    return id
  }

  // Sent transactionally rather than as a campaign test, so a test works before
  // any list is chosen — and never creates a stray draft in Brevo.
  async function handleSendTest() {
    const address = testEmail.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(address)) {
      message.warning('Enter a valid address to send the test to')
      return
    }
    const html = await getSendableHtml()
    if (!html) {
      message.error('The email is empty')
      return
    }
    setBusy('test')
    try {
      const sender = senders.find((candidate) => candidate.email === senderEmail)
      await sendBrevoDirect({
        subject: subject.trim() || 'Test email',
        senderName: sender?.name || senderEmail,
        senderEmail,
        htmlContent: html,
        to: [address],
      })
      message.success(`Test sent to ${address}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Test send failed')
    } finally {
      setBusy(null)
    }
  }

  function handleSend() {
    const names = [
      ...listIds.map((id) => lists.find((list) => list.id === id)?.name).filter(Boolean),
      ...directEmails,
    ].join(', ')

    Modal.confirm({
      title: 'Send this campaign now?',
      okText: `Send to ${recipientCount.toLocaleString()} contacts`,
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}><b>Subject:</b> {subject.trim()}</p>
          <p style={{ marginBottom: 8 }}><b>To:</b> {names}</p>
          <p style={{ marginBottom: 8 }}><b>From:</b> {senderEmail}</p>
          <p style={{ marginBottom: 0 }}>This sends immediately and cannot be undone.</p>
        </div>
      ),
      onOk: async () => {
        setBusy('send')
        try {
          const html = await getSendableHtml()
          const sender = senders.find((candidate) => candidate.email === senderEmail)

          if (listIds.length) {
            const id = await createDraft()
            if (id) await sendBrevoCampaign(id)
          }

          if (directEmails.length) {
            await sendBrevoDirect({
              subject: subject.trim(),
              senderName: sender?.name || senderEmail,
              senderEmail,
              htmlContent: html,
              to: directEmails,
            })
          }

          message.success('Email sent')
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Send failed')
          throw error
        } finally {
          setBusy(null)
        }
      },
    })
  }

  const canSend =
    ready && Boolean(subject.trim()) && Boolean(senderEmail) && recipients.length > 0 && !busy

  return (
    <div className="email-builder">
      <div className="email-builder-head">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>New Email</Title>
          <Text type="secondary">Compose it, choose who gets it, send it through Brevo.</Text>
        </div>
        <Space wrap>
          <Button onClick={handleResetTemplate} disabled={!ready}>Start from template</Button>
          <Button onClick={handlePreview} disabled={!ready}>Preview</Button>
          <Button onClick={handleDownload} disabled={!ready}>Download</Button>
        </Space>
      </div>

      {brevoError ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Brevo is not connected"
          description={`${brevoError}. You can still design the email, but recipients and sending are unavailable.`}
        />
      ) : null}

      <div className="email-compose">
        <div className="email-compose-row">
          <label htmlFor="brevo-to">To</label>
          <Select
            id="brevo-to"
            mode="tags"
            allowClear
            style={{ width: '100%' }}
            placeholder="Choose Brevo lists, or type any email address"
            value={recipients}
            onChange={handleRecipientsChange}
            tokenSeparators={[',', ' ', ';']}
            options={lists.map((list) => ({
              value: `list:${list.id}`,
              label: `${list.name} — ${list.contactCount.toLocaleString()} contacts`,
            }))}
          />
        </div>

        <div className="email-compose-row">
          <label htmlFor="brevo-from">From</label>
          <Select
            id="brevo-from"
            style={{ width: '100%' }}
            placeholder="Choose a verified sender"
            value={senderEmail || undefined}
            onChange={setSenderEmail}
            options={senders.map((sender) => ({
              value: sender.email,
              label: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
              disabled: !sender.active,
            }))}
          />
        </div>

        <div className="email-compose-row">
          <label htmlFor="brevo-subject">Subject</label>
          <Input
            id="brevo-subject"
            placeholder="What lands in their inbox"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
          />
        </div>


        <div className="email-compose-body">
          {initError ? (
            <Alert type="error" showIcon message="The email builder failed to load" description={initError} />
          ) : null}
          <div className="email-builder-canvas" ref={containerRef} />
        </div>

        <div className="email-compose-actions">
          <Space wrap>
            <Input
              style={{ width: 260 }}
              placeholder="you@trustedtechnology.ai"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <Button onClick={handleSendTest} loading={busy === 'test'} disabled={!ready || !senderEmail}>
              Send test
            </Button>
          </Space>
          <Space wrap align="center">
            {recipients.length ? (
              <Text type="secondary">{recipientCount.toLocaleString()} recipients</Text>
            ) : null}
            <Button type="primary" onClick={handleSend} loading={busy === 'send'} disabled={!canSend}>
              Send campaign
            </Button>
          </Space>
        </div>
      </div>
    </div>
  )
}
