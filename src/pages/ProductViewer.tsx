import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Segmented, Space, Spin, Switch, Tag, Tooltip, Typography } from 'antd'
import '@google/model-viewer'

const { Paragraph, Text } = Typography

// The model is served from public/ rather than imported: the build inlines every
// imported asset as base64, which would push 3.6MB of geometry into the bundle.
const MODEL_URL = `${import.meta.env.BASE_URL}models/t500.glb`

type ViewName = 'front' | 'side' | 'back' | 'top'

// Orbit strings are model-viewer's own format: azimuth, polar, radius.
const views: ReadonlyArray<readonly [ViewName, string, string]> = [
  ['front', 'Front', '0deg 78deg 0.34m'],
  ['side', 'Side', '90deg 78deg 0.34m'],
  ['back', 'Back', '180deg 78deg 0.34m'],
  ['top', 'Top', '0deg 18deg 0.34m'],
]

const environments = [
  ['Studio', 'neutral'],
  ['Warm', 'legacy'],
] as const

export default function ProductViewer() {
  const viewerRef = useRef<HTMLElement & {
    cameraOrbit?: string
    resetTurntableRotation?: () => void
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')
  const [view, setView] = useState<ViewName>('front')
  const [spinning, setSpinning] = useState(true)
  const [environment, setEnvironment] = useState<'neutral' | 'legacy'>('neutral')

  useEffect(() => {
    const node = viewerRef.current
    if (!node) return
    const onLoad = () => setReady(true)
    const onError = () => setFailed('The 3D model could not be loaded.')
    node.addEventListener('load', onLoad)
    node.addEventListener('error', onError)
    return () => {
      node.removeEventListener('load', onLoad)
      node.removeEventListener('error', onError)
    }
  }, [])

  const goTo = (name: ViewName) => {
    setView(name)
    const target = views.find(([id]) => id === name)
    const node = viewerRef.current
    if (target && node) {
      node.cameraOrbit = target[2]
      node.resetTurntableRotation?.()
    }
  }

  return (
    <div className="page product-viewer-page">
      <div className="page-header">
        <div>
          <Space align="center" wrap>
            <h1 className="page-title">T500 in 3D</h1>
            <Tag color="gold">Photogrammetry</Tag>
          </Space>
          <p className="page-subtitle">
            Reconstructed from the 48-frame studio turntable set. Drag to rotate, scroll to zoom.
          </p>
        </div>
        <Space wrap>
          <Tag color="blue">48 source frames</Tag>
          <Tag color="green">Silhouette match 98.6%</Tag>
        </Space>
      </div>

      {failed ? <Alert type="error" showIcon message="Viewer problem" description={failed} /> : null}

      <div className="product-viewer-grid">
        <Card className="section-card product-viewer-stage" styles={{ body: { padding: 0 } }}>
          {!ready && !failed ? (
            <div className="product-viewer-loading">
              <Spin size="large" />
              <Text type="secondary">Loading the model…</Text>
            </div>
          ) : null}
          {/* @ts-expect-error model-viewer is a custom element, not a React intrinsic */}
          <model-viewer
            ref={viewerRef}
            src={MODEL_URL}
            alt="Interactive 3D model of the Trusted Technology T500 body camera"
            camera-controls
            touch-action="pan-y"
            auto-rotate={spinning ? true : undefined}
            auto-rotate-delay="0"
            rotation-per-second="18deg"
            environment-image={environment}
            shadow-intensity="1.1"
            shadow-softness="0.9"
            exposure="1.15"
            camera-orbit={views[0][2]}
            min-camera-orbit="auto auto 0.16m"
            max-camera-orbit="auto auto 0.75m"
            interaction-prompt="none"
            className="product-viewer-canvas"
          />
        </Card>

        <Card className="section-card product-viewer-controls" title="View">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Segmented
              block
              value={view}
              onChange={(value) => goTo(value as ViewName)}
              options={views.map(([id, label]) => ({ label, value: id }))}
            />

            <div className="product-viewer-toggle">
              <Space size="small">
                <Switch size="small" checked={spinning} onChange={setSpinning} />
                <Text>Auto-rotate</Text>
              </Space>
              <Button size="small" onClick={() => goTo(view)}>Recentre</Button>
            </div>

            <div className="product-viewer-toggle">
              <Text type="secondary">Lighting</Text>
              <Segmented
                size="small"
                value={environment}
                onChange={(value) => setEnvironment(value as 'neutral' | 'legacy')}
                options={environments.map(([label, value]) => ({ label, value }))}
              />
            </div>

            <div className="product-viewer-facts">
              <div><span>Source</span><strong>48 photos, Canon R5, 90mm</strong></div>
              <div><span>Method</span><strong>Silhouette carving (visual hull)</strong></div>
              <div><span>Geometry</span><strong>90,000 triangles</strong></div>
              <div><span>Texture</span><strong>2048px, projected from the photos</strong></div>
            </div>

            <Alert
              type="warning"
              showIcon
              message="Approximate model"
              description={(
                <Paragraph style={{ margin: 0, fontSize: 13 }}>
                  Built from silhouettes, so the outer shape is accurate but recessed
                  detail — the lens dish, the screen well, the gap under the belt clip —
                  is filled in solid. Surface features are photographic texture, not
                  modelled geometry. Scale is a placeholder until the unit is measured.
                </Paragraph>
              )}
            />

            <Tooltip title="Downloads the same glTF binary the viewer is showing.">
              <Button block href={MODEL_URL} download="t500.glb">Download .glb</Button>
            </Tooltip>
          </Space>
        </Card>
      </div>
    </div>
  )
}
