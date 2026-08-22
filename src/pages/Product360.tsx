import { useEffect, useMemo, useState } from 'react'
import { Alert, Spin, Typography } from 'antd'
import Spin360, { type SpinRow } from '../components/Spin360'

const { Text } = Typography

type Variant = { width: number; height: number; dir: string }
type Manifest = {
  name: string
  count: number
  pad: number
  ext: string
  aspect: number
  variants: Variant[]
}

/** Frame set lives in feCRM/public/product360/<slug>/ — built by scripts/spin360/prepare_frames.py */
const SLUG = 'bwc-cam'

export default function Product360() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/product360/${SLUG}/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json returned ${r.status}`)
        return r.json()
      })
      .then((m: Manifest) => { if (!cancelled) setManifest(m) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const variant = useMemo(() => {
    if (!manifest?.variants?.length) return null
    return [...manifest.variants].sort((a, b) => b.width - a.width)[0]
  }, [manifest])

  const rows = useMemo<SpinRow[]>(() => {
    if (!manifest || !variant) return []
    return [{ label: 'Level', base: `/product360/${SLUG}/${variant.dir}`, count: manifest.count }]
  }, [manifest, variant])

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load the frame set"
          description={<Text code>/product360/{SLUG}/manifest.json — {error}</Text>}
        />
      )}

      {!manifest && !error && (
        <div style={{ display: 'grid', placeItems: 'center', height: 420 }}><Spin /></div>
      )}

      {manifest && variant && rows.length > 0 && (
        <Spin360
          rows={rows}
          pad={manifest.pad}
          ext={manifest.ext}
          aspect={manifest.aspect}
          background="#ffffff"
        />
      )}
    </div>
  )
}
