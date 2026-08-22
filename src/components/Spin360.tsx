import { useCallback, useEffect, useRef, useState } from 'react'

export type SpinRow = {
  /** shown in the elevation readout, e.g. "Level" or "Top" */
  label: string
  /** folder holding this row's numbered frames */
  base: string
  /** how many yaw frames this row has. 1 = a single still reused at every angle. */
  count: number
  /** true = greybox stand-in, not product photography. Badged in the UI. */
  placeholder?: boolean
}

export type SpinDetail = { label: string; src: string }

export type Spin360Props = {
  /** elevation rows, lowest camera angle first */
  rows: SpinRow[]
  initialRow?: number
  details?: SpinDetail[]
  pad?: number
  ext?: string
  aspect?: number
  background?: string
  accent?: string
  /** cross-fade between neighbouring frames and rows while moving */
  blend?: boolean
  /** how much the product lags the cursor */
  smoothing?: number
  /** full rotations per screen-width of horizontal travel */
  sensitivity?: number
  /** pixels of vertical travel per elevation row */
  pxPerRow?: number
  hoverRotate?: boolean
  autospin?: boolean
  onProgress?: (loaded: number, total: number) => void
  onFrame?: (index: number) => void
  onRow?: (index: number, row: SpinRow) => void
}

const mod = (n: number, m: number) => ((n % m) + m) % m
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

const chip = (enabled: boolean): React.CSSProperties => ({
  width: 20, height: 18, padding: 0, border: 0, borderRadius: 5,
  background: 'transparent', color: enabled ? '#fff' : 'rgba(255,255,255,.28)',
  fontSize: 11, lineHeight: '18px', cursor: enabled ? 'pointer' : 'default',
})

export default function Spin360({
  rows,
  initialRow = 0,
  details = [],
  pad = 3,
  ext = 'webp',
  aspect = 1,
  background = '#0b0f14',
  accent = '#4da3ff',
  blend = true,
  smoothing = 0.18,
  sensitivity = 1,
  pxPerRow = 150,
  hoverRotate = false,
  autospin = true,
  onProgress,
  onFrame,
  onRow,
}: Spin360Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /** decoded frames, indexed [row][frame] */
  const sets = useRef<(HTMLImageElement | null)[][]>([])

  // Both axes are continuous floats. The fractional parts drive the cross-fades,
  // which is what makes this read as one surface rather than a stack of slides.
  const yaw = useRef(0)
  const yawTarget = useRef(0)
  const elev = useRef(initialRow)
  const elevTarget = useRef(initialRow)
  const spin = useRef(0)
  const dragging = useRef(false)
  const touched = useRef(false)
  const inView = useRef(true)
  const raf = useRef(0)
  const lastRow = useRef(-1)
  const lastFrame = useRef(-1)

  const [detail, setDetail] = useState<SpinDetail | null>(null)
  const [rowIndex, setRowIndex] = useState(initialRow)
  const [loaded, setLoaded] = useState(0)
  const [total, setTotal] = useState(0)

  const cbs = useRef({ onProgress, onFrame, onRow })
  cbs.current = { onProgress, onFrame, onRow }

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const maxRow = rows.length - 1

  /* ---- preload every row; the whole stack is small ------------------- */
  useEffect(() => {
    const jobs: { r: number; f: number; url: string }[] = []
    rows.forEach((row, r) => {
      const order: number[] = []
      const seen = new Set<number>()
      for (const stride of [8, 4, 2, 1]) {
        for (let i = 0; i < row.count; i += stride) if (!seen.has(i)) { seen.add(i); order.push(i) }
      }
      for (let i = 0; i < row.count; i += 1) if (!seen.has(i)) order.push(i)
      order.forEach((f) => jobs.push({ r, f, url: `${row.base}/f_${String(f).padStart(pad, '0')}.${ext}` }))
    })
    // the row you start on loads first
    jobs.sort((a, b) => Math.abs(a.r - initialRow) - Math.abs(b.r - initialRow))

    sets.current = rows.map((row) => new Array(row.count).fill(null))
    setLoaded(0)
    setTotal(jobs.length)

    let cursor = 0
    let live = 0
    let done = 0
    let cancelled = false

    const pump = () => {
      while (live < 6 && cursor < jobs.length) {
        const job = jobs[cursor]
        cursor += 1
        live += 1
        const img = new Image()
        img.decoding = 'async'
        const settle = () => {
          if (cancelled) return
          if (img.naturalWidth) { sets.current[job.r][job.f] = img; done += 1 }
          live -= 1
          setLoaded(done)
          cbs.current.onProgress?.(done, jobs.length)
          pump()
        }
        img.onload = settle
        img.onerror = settle
        img.src = job.url
      }
    }
    pump()
    return () => { cancelled = true }
  }, [rows, pad, ext, initialRow])

  /* ---- render: bilinear across yaw and elevation --------------------- */
  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = host.getBoundingClientRect()
      if (!r.width) return
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    /** nearest decoded frame for a row at a given yaw */
    const pick = (r: number, y: number) => {
      const set = sets.current[r]
      if (!set || !set.length) return null
      const n = set.length
      // a single-still row shows that still at every angle
      const k = n === 1 ? 0 : mod(Math.round(y), n)
      if (set[k]) return set[k]
      for (let d = 1; d <= n; d += 1) {
        const a = set[mod(k - d, n)]
        if (a) return a
        const b = set[mod(k + d, n)]
        if (b) return b
      }
      return null
    }

    const paint = (img: HTMLImageElement, alpha: number) => {
      if (alpha <= 0.002) return
      const cw = canvas.width
      const ch = canvas.height
      const s = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      ctx.globalAlpha = alpha
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
      ctx.globalAlpha = 1
    }

    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now

      if (!dragging.current) {
        if (Math.abs(spin.current) > 0.02) {
          yawTarget.current += spin.current
          spin.current *= Math.pow(0.94, dt / 16)
        } else {
          spin.current = 0
          // settle onto a real photograph and a real elevation, so nothing rests
          // half-way between two images as a permanent double exposure
          yawTarget.current = Math.round(yawTarget.current)
          elevTarget.current = Math.round(elevTarget.current)
        }
      }

      const k = smoothing <= 0 ? 1 : 1 - Math.pow(1 - Math.min(0.99, smoothing), dt / 16)
      yaw.current += (yawTarget.current - yaw.current) * k
      elev.current += (elevTarget.current - elev.current) * k

      const moving = dragging.current
        || Math.abs(spin.current) > 0.02
        || Math.abs(yawTarget.current - yaw.current) > 0.01
        || Math.abs(elevTarget.current - elev.current) > 0.004

      const rA = clamp(Math.floor(elev.current), 0, maxRow)
      const rB = clamp(rA + 1, 0, maxRow)
      const rf = clamp(elev.current - rA, 0, 1)

      const nA = sets.current[rA]?.length ?? 1
      const yA = Math.floor(yaw.current)
      const yf = yaw.current - yA

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const a0 = pick(rA, yA)
      const a1 = blend && moving && nA > 1 ? pick(rA, yA + 1) : null
      if (a0) paint(a0, 1)
      if (a1 && a1 !== a0) paint(a1, yf)

      if (rB !== rA && rf > 0.002) {
        const b0 = pick(rB, yA)
        const b1 = blend && moving && (sets.current[rB]?.length ?? 1) > 1 ? pick(rB, yA + 1) : null
        if (b0) paint(b0, rf)
        if (b1 && b1 !== b0) paint(b1, rf * yf)
      }

      const shownRow = clamp(Math.round(elev.current), 0, maxRow)
      if (shownRow !== lastRow.current) {
        lastRow.current = shownRow
        setRowIndex(shownRow)
        cbs.current.onRow?.(shownRow, rowsRef.current[shownRow])
      }
      const shownFrame = mod(Math.round(yaw.current), Math.max(1, nA))
      if (shownFrame !== lastFrame.current) {
        lastFrame.current = shownFrame
        cbs.current.onFrame?.(shownFrame)
      }

      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf.current); ro.disconnect() }
  }, [blend, smoothing, maxRow])

  /* ---- one pointer gesture drives both axes at once ------------------ */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let lastX = 0
    let lastY = 0
    let lastT = 0
    let hoverX: number | null = null

    const perPx = () => (rowsRef.current[clamp(Math.round(elev.current), 0, maxRow)]?.count ?? 48)
      * sensitivity / Math.max(1, host.clientWidth)

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement | null)?.closest('[data-tt-control]')) return
      dragging.current = true
      touched.current = true
      spin.current = 0
      lastX = e.clientX
      lastY = e.clientY
      lastT = e.timeStamp
      host.setPointerCapture?.(e.pointerId)
    }

    const move = (e: PointerEvent) => {
      if (!dragging.current) {
        if (hoverRotate && e.pointerType === 'mouse') {
          if (hoverX !== null) { touched.current = true; yawTarget.current -= (e.clientX - hoverX) * perPx() }
          hoverX = e.clientX
        }
        return
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      // With one elevation there is nothing to tilt to, so a vertical gesture
      // belongs to the page — release it rather than swallowing the scroll.
      if (maxRow === 0 && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
        dragging.current = false
        return
      }
      e.preventDefault()
      // no axis locking — a diagonal drag spins and tilts together
      yawTarget.current -= dx * perPx()
      if (maxRow > 0) elevTarget.current = clamp(elevTarget.current - dy / pxPerRow, 0, maxRow)
      const dt = e.timeStamp - lastT
      if (dt > 0) spin.current = (-dx * perPx() * 16) / dt
      lastX = e.clientX
      lastY = e.clientY
      lastT = e.timeStamp
    }

    const up = () => { dragging.current = false }
    const leave = () => { hoverX = null }

    host.addEventListener('pointerdown', down)
    host.addEventListener('pointermove', move, { passive: false })
    host.addEventListener('pointerleave', leave)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      host.removeEventListener('pointerdown', down)
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [sensitivity, hoverRotate, pxPerRow, maxRow])

  /* ---- auto-spin one revolution when scrolled into view --------------- */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !autospin) return
    const io = new IntersectionObserver((entries) => {
      inView.current = entries[0].isIntersecting
      if (!inView.current || touched.current) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const n = rowsRef.current[clamp(Math.round(elev.current), 0, maxRow)]?.count ?? 48
      if (n < 2) return
      const from = yawTarget.current
      const start = performance.now()
      const step = (t: number) => {
        if (touched.current || !inView.current) return
        const p = Math.min(1, (t - start) / 5200)
        yawTarget.current = from + n * (1 - Math.pow(1 - p, 3))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, { threshold: 0.4 })
    io.observe(host)
    return () => io.disconnect()
  }, [autospin, maxRow])

  const goToRow = useCallback((next: number) => {
    elevTarget.current = clamp(next, 0, maxRow)
    touched.current = true
  }, [maxRow])

  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowLeft') { touched.current = true; yawTarget.current -= step }
    else if (e.key === 'ArrowRight') { touched.current = true; yawTarget.current += step }
    else if (e.key === 'ArrowUp') goToRow(Math.round(elevTarget.current) + 1)
    else if (e.key === 'ArrowDown') goToRow(Math.round(elevTarget.current) - 1)
    else if (e.key === 'Home') { touched.current = true; yawTarget.current = 0 }
    else return
    e.preventDefault()
  }

  const row = rows[rowIndex] ?? rows[0]
  const pct = total ? Math.round((loaded / total) * 100) : 0

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Interactive 360 degree product view. Arrow keys rotate; up and down change camera height."
      tabIndex={0}
      onKeyDown={key}
      style={{
        position: 'relative', width: '100%', aspectRatio: String(aspect),
        background, borderRadius: 12, overflow: 'hidden',
        touchAction: maxRow > 0 ? 'none' : 'pan-y',
        userSelect: 'none', cursor: 'grab', outlineColor: accent,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {detail && (
        <img
          src={detail.src}
          alt={`${detail.label} view`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}

      {maxRow > 0 && (
        <div
          data-tt-control=""
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: 'rgba(0,0,0,.42)', borderRadius: 999, padding: '6px 5px',
          }}
        >
          <button type="button" aria-label="Higher camera angle" disabled={rowIndex >= maxRow}
            onClick={() => goToRow(rowIndex + 1)} style={chip(rowIndex < maxRow)}>▲</button>
          {rows.map((_, i) => maxRow - i).map((idx) => (
            <button
              key={rows[idx].base}
              type="button"
              title={rows[idx].label}
              aria-label={rows[idx].label}
              aria-current={idx === rowIndex}
              onClick={() => goToRow(idx)}
              style={{
                width: idx === rowIndex ? 11 : 7, height: idx === rowIndex ? 11 : 7,
                padding: 0, border: 0, borderRadius: '50%', cursor: 'pointer',
                background: idx === rowIndex ? accent : 'rgba(255,255,255,.5)',
                transition: 'all .15s ease',
              }}
            />
          ))}
          <button type="button" aria-label="Lower camera angle" disabled={rowIndex <= 0}
            onClick={() => goToRow(rowIndex - 1)} style={chip(rowIndex > 0)}>▼</button>
        </div>
      )}

      {maxRow > 0 && (
        <div style={{
          position: 'absolute', left: 10, top: 10, padding: '4px 9px', borderRadius: 6,
          background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 12, pointerEvents: 'none',
        }}>{row?.label}</div>
      )}

      {details.length > 0 && (
        <div data-tt-control="" style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', justifyContent: 'center', gap: 6, padding: 8,
        }}>
          {[{ label: '360', src: '' }, ...details].map((d) => {
            const active = d.src ? detail?.src === d.src : detail === null
            return (
              <button key={d.label} type="button" aria-pressed={active}
                onClick={() => setDetail(d.src ? d : null)}
                style={{
                  padding: '5px 12px', border: 0, borderRadius: 999, cursor: 'pointer',
                  fontSize: 12, color: active ? '#0b0f14' : '#fff',
                  background: active ? accent : 'rgba(0,0,0,.55)',
                }}>{d.label}</button>
            )
          })}
        </div>
      )}

      {row?.placeholder && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: details.length ? 40 : 0,
          padding: '7px 10px', background: 'rgba(180,83,9,.92)', color: '#fff',
          fontSize: 12, textAlign: 'center', pointerEvents: 'none',
        }}>Placeholder — not product photography.</div>
      )}

      {pct < 100 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,.14)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width .15s linear' }} />
        </div>
      )}
    </div>
  )
}
