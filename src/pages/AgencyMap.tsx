import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Checkbox, Col, Input, Row, Select, Space, Statistic, Spin, Typography, message } from 'antd'
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import AgencyBriefingPanel from '../components/AgencyBriefingPanel'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  getCrmDealGeojson,
  getCrmDealStats,
  getLeAgencyGeojson,
  getLeAgencyStats,
  type CrmDealFeature,
  type LeAgencyFeature,
  type LeAgencyStats,
} from '../lib/api'

const { Paragraph, Text, Title } = Typography

const US_CENTER: [number, number] = [39.5, -98.35]
const US_ZOOM = 4

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

const SIZE_BANDS = [
  { max: 10, label: '1-10 officers', color: '#2f6f4f' },
  { max: 25, label: '11-25 officers', color: '#5c8a3c' },
  { max: 50, label: '26-50 officers', color: '#b08a2e' },
  { max: 100, label: '51-100 officers', color: '#b4622b' },
  { max: Infinity, label: '100+ officers', color: '#8c3a3a' },
]

const UNKNOWN_COLOR = '#8c8c8c'

// A won deal means a live customer. They are the pins worth spotting first.
const CUSTOMER_STAGE = 'Closed Won'
const CUSTOMER_COLOR = '#1f8f4d'

export const isCustomerStage = (stage: string) => stage === CUSTOMER_STAGE

const STAGE_COLORS: Record<string, string> = {
  'Closed Won': CUSTOMER_COLOR,
  'Contract Sent': '#3f7d5c',
  'Quote Sent': '#5c8a3c',
  'Trial In Progress': '#8fa02f',
  'Trial Agreement Sent': '#b08a2e',
  'Trial Requested': '#c2922c',
  'Presentation / Demonstration Completed': '#b4622b',
  'Qualified Lead': '#9c6b4f',
  'Closed Lost': '#8c3a3a',
  'No Further Interest': '#6b6b6b',
}

const NOT_IN_PIPELINE_COLOR = '#c8c8c0'


// Reverse pipeline order: the stages worth looking at first sit at the top.
const STAGE_ORDER = [
  'Closed Won',
  'Contract Sent',
  'Quote Sent',
  'Trial In Progress',
  'Trial Agreement Sent',
  'Trial Requested',
  'Presentation / Demonstration Completed',
  'Qualified Lead',
  'Closed Lost',
  'No Further Interest',
]

type ColorMode = 'size' | 'stage'

type MapPoint = {
  kind: 'agency' | 'deal'
  id: string
  ori: string
  name: string
  lat: number
  lon: number
  stage: string
  inPipeline: boolean
  officers: number | null
  lines: string[]
  approximate: boolean
}

function bandFor(officers: number | null) {
  if (officers === null || officers === undefined) {
    return { label: 'No count reported', color: UNKNOWN_COLOR }
  }
  return SIZE_BANDS.find((band) => officers <= band.max) ?? SIZE_BANDS[SIZE_BANDS.length - 1]
}

const EARTH_RADIUS_MILES = 3958.7613

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

/** Pin width for a point, mirroring the sizing used by each icon builder. */
function pinWidthFor(point: { officers: number | null; stage: string; approximate: boolean }) {
  if (isCustomerStage(point.stage)) {
    return point.officers === null ? 30 : Math.min(30 + Math.sqrt(point.officers) * 1.1, 42)
  }
  if (point.approximate) return 22
  return point.officers === null ? 20 : Math.min(20 + Math.sqrt(point.officers) * 1.1, 34)
}

/**
 * Ring drawn over a chosen pin.
 *
 * Pins anchor at their tip, so the coordinate sits at the bottom of the shape.
 * The head of the teardrop is at y=12 of a 32-unit viewBox, i.e. 0.625 of the
 * pin's height above the anchor - the ring is offset by that much so it circles
 * the head rather than the point.
 */
function selectionRing(label: string, pinHeight: number) {
  const size = 44
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    border:3px solid #1f6f8f;box-sizing:border-box;
    box-shadow:0 0 0 2px rgba(255,255,255,0.9);
    display:flex;align-items:flex-start;justify-content:center;
  "><span style="
    transform:translateY(-11px);background:#1f6f8f;color:#fff;
    font-size:11px;font-weight:700;line-height:1;
    padding:3px 6px;border-radius:9px;
  ">${label}</span></div>`
  return L.divIcon({
    className: 'agency-map-ring',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2 + pinHeight * 0.625],
  })
}

/** Midpoint chip carrying the measured distance. */
function distanceLabel(text: string) {
  const html = `<div style="
    transform:translate(-50%,-50%);white-space:nowrap;
    background:#1f6f8f;color:#fff;font-size:12px;font-weight:600;
    padding:4px 9px;border-radius:11px;
    border:2px solid rgba(255,255,255,0.92);
    box-shadow:0 2px 5px rgba(0,0,0,0.3);
  ">${text}</div>`
  return L.divIcon({ className: 'agency-map-distance', html, iconSize: [0, 0] })
}

/**
 * Teardrop map pins, drawn inline as SVG.
 *
 * divIcon with an explicit className drops Leaflet's default white box, so the
 * markers are pure SVG. Anchoring at the tip means the point of the pin sits on
 * the real coordinate rather than the centre of the shape.
 */
const PIN_PATH =
  'M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.373 18.627 0 12 0z'

function pinSvg(inner: string, width: number, height: number) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));">${inner}</svg>`
}

function makePin(html: string, width: number, height: number) {
  return L.divIcon({
    className: 'agency-map-pin',
    html,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 6],
  })
}

/** Solid pin, sized by officer count, coloured by the active mode. */
function dotIcon(officers: number | null, colorMode: ColorMode, stage: string, inPipeline: boolean) {
  const color =
    colorMode === 'stage'
      ? inPipeline
        ? STAGE_COLORS[stage] ?? UNKNOWN_COLOR
        : NOT_IN_PIPELINE_COLOR
      : bandFor(officers).color

  const width = officers === null ? 20 : Math.min(20 + Math.sqrt(officers) * 1.1, 34)
  const height = Math.round(width * 4 / 3)

  return makePin(
    pinSvg(
      `<path d="${PIN_PATH}" fill="${color}" stroke="#ffffff" stroke-width="1.75"/>` +
        `<circle cx="12" cy="12" r="4.4" fill="#ffffff" fill-opacity="0.92"/>`,
      width,
      height,
    ),
    width,
    height,
  )
}

/**
 * Customer pin: larger, brighter, haloed, and carrying a tick. Approximate
 * customer locations keep the dashed outline so provenance is never lost.
 */
function customerIcon(officers: number | null, approximate: boolean) {
  const width = officers === null ? 30 : Math.min(30 + Math.sqrt(officers) * 1.1, 42)
  const height = Math.round((width * 4) / 3)

  const body = approximate
    ? `<path d="${PIN_PATH}" fill="#ffffff" fill-opacity="0.9" stroke="${CUSTOMER_COLOR}" stroke-width="2.75" stroke-dasharray="4 2.6" stroke-linejoin="round"/>`
    : `<path d="${PIN_PATH}" fill="${CUSTOMER_COLOR}" stroke="#ffffff" stroke-width="2"/>`

  const tick = `<path d="M7.6 12.1 L10.6 15.1 L16.6 9.1" fill="none" stroke="${
    approximate ? CUSTOMER_COLOR : '#ffffff'
  }" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`

  const html = `<svg width="${width}" height="${height}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 0 3px rgba(31,143,77,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.35));">${body}${tick}</svg>`

  return L.divIcon({
    className: 'agency-map-pin agency-map-pin-customer',
    html,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 6],
  })
}

/** Hollow, dashed pin: this location is inferred, not surveyed. */
function approximateIcon(stage: string, inPipeline: boolean) {
  const color = inPipeline ? STAGE_COLORS[stage] ?? UNKNOWN_COLOR : NOT_IN_PIPELINE_COLOR
  const width = 22
  const height = Math.round(width * 4 / 3)

  return makePin(
    pinSvg(
      `<path d="${PIN_PATH}" fill="#ffffff" fill-opacity="0.82" stroke="${color}" stroke-width="2.75" stroke-dasharray="4 2.6" stroke-linejoin="round"/>` +
        `<circle cx="12" cy="12" r="3" fill="${color}"/>`,
      width,
      height,
    ),
    width,
    height,
  )
}

/** Cluster bubbles in the app's own palette, sized by how much they contain. */
function createClusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 34 : count < 100 ? 42 : count < 1000 ? 50 : 60
  const label = count < 1000 ? String(count) : `${Math.round(count / 100) / 10}k`

  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#7f7a60,#41464c);
    color:#f6f6f2;font-weight:600;font-size:${count < 1000 ? 13 : 12}px;
    border:2.5px solid rgba(255,255,255,0.92);
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
    box-sizing:border-box;letter-spacing:0.2px;
  ">${label}</div>`

  return L.divIcon({ html, className: 'agency-map-cluster', iconSize: [size, size] })
}

export default function AgencyMap() {
  const [briefingFor, setBriefingFor] = useState<{ ori: string; name: string } | null>(null)
  const [measureMode, setMeasureMode] = useState(false)
  const [selected, setSelected] = useState<MapPoint[]>([])
  const [showAgencies, setShowAgencies] = useState(true)
  const [showDeals, setShowDeals] = useState(true)
  const [features, setFeatures] = useState<LeAgencyFeature[]>([])
  const [dealFeatures, setDealFeatures] = useState<CrmDealFeature[]>([])
  const [stats, setStats] = useState<LeAgencyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Defaults to the population this map exists to find: small agencies.
  const [maxOfficers, setMaxOfficers] = useState<number | null>(100)
  const [state, setState] = useState<string | undefined>(undefined)
  const [agencyType, setAgencyType] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [colorMode, setColorMode] = useState<ColorMode>('stage')
  const [crm, setCrm] = useState<'all' | 'matched' | 'unmatched'>('all')
  const [stages, setStages] = useState<string[]>([])

  const query = useMemo(
    () => ({
      state,
      agencyType,
      search: search.trim() || undefined,
      maxOfficers: maxOfficers ?? undefined,
      hasOfficerCount: maxOfficers !== null,
      crm: crm === 'all' ? undefined : crm,
      stage: stages.length ? stages.join(',') : undefined,
    }),
    [state, agencyType, search, maxOfficers, crm, stages],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([getLeAgencyGeojson(query), getLeAgencyStats(query)])
      .then(([geo, nextStats]) => {
        if (cancelled) return
        setFeatures(geo.features)
        setStats(nextStats)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const text = err instanceof Error ? err.message : 'Could not load agencies.'
        setError(text)
        message.error(text)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  // The FBI returns null coordinates for ~14% of agencies (task forces, state
  // and campus police, and a few hundred real city PDs). They match the filter
  // but cannot be plotted, so say so rather than dropping them silently.

  // Counted from the HubSpot deals themselves. The equivalent le-agencies
  // rollup counts *agencies* carrying a deal, and only a third of our deals
  // sit on an FBI-rostered agency - so it read "Closed Won (2)" against 12
  // real won deals. `unplaced` is carried too, because a deal with no usable
  // location never reaches the map and that gap belongs in the label.
  const [stageCounts, setStageCounts] = useState<
    Record<string, { deals: number; unplaced: number }>
  >({})

  useEffect(() => {
    // Fetched once, without a stage filter, so the option counts stay stable.
    getCrmDealStats()
      .then((result) => {
        const next: Record<string, { deals: number; unplaced: number }> = {}
        for (const row of result.byStage || []) {
          next[row._id] = { deals: row.deals, unplaced: row.unplaced }
        }
        setStageCounts(next)
      })
      .catch(() => setStageCounts({}))
  }, [])

  useEffect(() => {
    if (!showDeals) return
    let cancelled = false
    const dealQuery = { stage: stages.length ? stages.join(',') : undefined, state }

    getCrmDealGeojson(dealQuery)
      .then((geo) => {
        if (cancelled) return
        setDealFeatures(geo.features)
      })
      .catch(() => {
        if (!cancelled) setDealFeatures([])
      })

    return () => { cancelled = true }
  }, [showDeals, stages, state])

  const agencyPoints: MapPoint[] = useMemo(() => {
    if (!showAgencies) return []
    return features.map((f) => ({
      kind: 'agency' as const,
      id: `agency:${f.properties.ori}`,
      ori: f.properties.ori,
      name: f.properties.name,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      stage: f.properties.stage,
      inPipeline: f.properties.inPipeline,
      officers: f.properties.swornOfficers,
      lines: [
        f.properties.streetAddress
          ? `${f.properties.streetAddress}${
              f.properties.addressCity ? `, ${f.properties.addressCity}` : ''
            }`
          : '',
        `${f.properties.county ? `${f.properties.county} County, ` : ''}${f.properties.state}${
          f.properties.agencyType ? ` - ${f.properties.agencyType}` : ''
        }`,
        f.properties.swornOfficers === null
          ? 'No officer count reported'
          : `${f.properties.swornOfficers} sworn officers${
              f.properties.dataYear ? ` (${f.properties.dataYear})` : ''
            }`,
        f.properties.inPipeline
          ? `${f.properties.stage}${f.properties.dealCount > 1 ? ` (${f.properties.dealCount} deals)` : ''}`
          : 'Not in HubSpot',
        // Say where the pin came from. A county-centre pin is not a location.
        f.properties.precision === 'county'
          ? 'Location: county centre only (FBI published no address)'
          : f.properties.precision === 'rooftop' || f.properties.precision === 'street'
            ? 'Location: geocoded from street address'
            : '',
        `ORI ${f.properties.ori}`,
      ].filter(Boolean),
      approximate: f.properties.approximate,
    }))
  }, [showAgencies, features])

  const dealPoints: MapPoint[] = useMemo(() => {
    if (!showDeals) return []
    return dealFeatures
      // With the agency layer on, an exactly-matched deal is a duplicate pin.
      .filter((f) => !(showAgencies && f.properties.locationSource === 'exact'))
      .map((f) => ({
        kind: 'deal' as const,
        id: `deal:${f.properties.dealId}`,
        ori: f.properties.ori,
        name: f.properties.name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        stage: f.properties.stage,
        inPipeline: true,
        officers: null,
        lines: [
          'HubSpot deal',
          f.properties.owner ? `Owner: ${f.properties.owner}` : '',
          f.properties.matchedAgencyName ? `Agency: ${f.properties.matchedAgencyName}` : '',
          f.properties.locationNote,
        ].filter(Boolean),
        approximate: f.properties.locationSource !== 'exact',
      }))
  }, [showDeals, showAgencies, dealFeatures])

  const points = useMemo(() => [...agencyPoints, ...dealPoints], [agencyPoints, dealPoints])

  const togglePoint = (point: MapPoint) => {
    setSelected((current) => {
      if (current.some((p) => p.id === point.id)) {
        return current.filter((p) => p.id !== point.id)
      }
      // Third click starts a new pair from the most recent choice.
      return current.length >= 2 ? [current[1], point] : [...current, point]
    })
  }

  const measured = useMemo(() => {
    if (selected.length < 2) return null
    const [a, b] = selected
    const miles = haversineMiles(a, b)
    return {
      a,
      b,
      miles,
      km: miles * 1.609344,
      midpoint: [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2] as [number, number],
      approximate: a.approximate || b.approximate,
    }
  }, [selected])

  const agencyTypes = useMemo(() => {
    const seen = new Set<string>()
    for (const feature of features) {
      if (feature.properties.agencyType) seen.add(feature.properties.agencyType)
    }
    return Array.from(seen).sort()
  }, [features])

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Agency Map
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Every US law enforcement agency reporting to the FBI, plotted by sworn officer count.
          Filtered to 100 or fewer officers by default.
        </Paragraph>
      </div>

      {error ? <Alert type="error" showIcon message="Could not load agencies" description={error} /> : null}

      <Card className="section-card">
        <Space wrap size={12} style={{ width: '100%' }}>
          <Space size={12}>
            <Checkbox checked={showAgencies} onChange={(e) => setShowAgencies(e.target.checked)}>
              FBI agencies
            </Checkbox>
            <Checkbox checked={showDeals} onChange={(e) => setShowDeals(e.target.checked)}>
              HubSpot deals
            </Checkbox>
          </Space>
          <Select
            allowClear
            placeholder="All states"
            style={{ width: 160 }}
            value={state}
            onChange={(value) => setState(value)}
            options={STATES.map((code) => ({ value: code, label: code }))}
            showSearch
          />
          <Select
            style={{ width: 200 }}
            disabled={!showAgencies}
            value={maxOfficers}
            onChange={(value) => setMaxOfficers(value)}
            options={[
              { value: 10, label: '10 or fewer officers' },
              { value: 25, label: '25 or fewer officers' },
              { value: 50, label: '50 or fewer officers' },
              { value: 100, label: '100 or fewer officers' },
              { value: null, label: 'Any size (incl. unreported)' },
            ]}
          />
          <Select
            allowClear
            disabled={!showAgencies}
            placeholder="All agency types"
            style={{ width: 200 }}
            value={agencyType}
            onChange={(value) => setAgencyType(value)}
            options={agencyTypes.map((type) => ({ value: type, label: type }))}
          />
          <Input.Search
            allowClear
            placeholder="Search agency name"
            style={{ width: 240 }}
            onSearch={(value) => setSearch(value)}
          />
          <Select
            style={{ width: 190 }}
            disabled={!showAgencies}
            value={crm}
            onChange={(value) => {
              setCrm(value)
              if (value === 'unmatched') setStages([])
            }}
            options={[
              { value: 'all', label: 'All agencies' },
              { value: 'matched', label: 'In HubSpot pipeline' },
              { value: 'unmatched', label: 'Never contacted' },
            ]}
          />
          <Select
            mode="multiple"
            allowClear
            disabled={crm === 'unmatched'}
            placeholder={crm === 'unmatched' ? 'No stage (never contacted)' : 'All stages'}
            style={{ minWidth: 260, maxWidth: 460 }}
            value={stages}
            onChange={(value) => setStages(value)}
            maxTagCount="responsive"
            options={STAGE_ORDER.map((stage) => {
              const count = stageCounts[stage]
              if (!count?.deals) return { value: stage, label: stage }
              return {
                value: stage,
                label: count.unplaced
                  ? `${stage} (${count.deals}, ${count.unplaced} unmapped)`
                  : `${stage} (${count.deals})`,
              }
            })}
          />
          <Button
            type={measureMode ? 'primary' : 'default'}
            onClick={() => {
              setMeasureMode((on) => !on)
              setSelected([])
            }}
          >
            {measureMode ? 'Measuring - click two pins' : 'Measure distance'}
          </Button>
          <Button
            size="middle"
            type={stages.length === 1 && stages[0] === CUSTOMER_STAGE ? 'primary' : 'default'}
            onClick={() =>
              setStages((current) =>
                current.length === 1 && current[0] === CUSTOMER_STAGE ? [] : [CUSTOMER_STAGE],
              )
            }
          >
            Customers only
          </Button>
          <Select
            style={{ width: 180 }}
            value={colorMode}
            onChange={(value) => setColorMode(value)}
            options={[
              { value: 'stage', label: 'Colour by stage' },
              { value: 'size', label: 'Colour by size' },
            ]}
          />
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card className="section-card">
            <Statistic title="Agencies plotted" value={agencyPoints.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="section-card">
            <Statistic title="Deals plotted" value={dealPoints.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="section-card">
            <Statistic title="Agencies in pipeline" value={stats?.totals.inPipeline ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="section-card">
            <Statistic title="Matching filter" value={stats?.totals.agencies ?? 0} />
          </Card>
        </Col>
      </Row>

      {measureMode ? (
        <Card className="section-card">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap size={16} align="center">
              <Text strong>
                {measured
                  ? `${Math.round(measured.miles).toLocaleString()} miles`
                  : selected.length === 1
                    ? 'Now click a second pin'
                    : 'Click two pins to measure'}
              </Text>
              {measured ? (
                <Text type="secondary">
                  {Math.round(measured.km).toLocaleString()} km - straight line, not driving distance
                </Text>
              ) : null}
              {selected.length ? (
                <Button size="small" onClick={() => setSelected([])}>
                  Clear
                </Button>
              ) : null}
            </Space>

            {selected.map((point, index) => (
              <Text key={point.id} type="secondary">
                <Text strong>{index === 0 ? 'A' : 'B'}</Text> - {point.name}
                {point.approximate ? ' (approximate location)' : ''}
              </Text>
            ))}

            {measured?.approximate ? (
              <Text type="warning">
                One of these pins is an approximate location, so this distance is an estimate.
              </Text>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <Card className="section-card" bodyStyle={{ padding: 0, position: 'relative' }}>
        {loading ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.55)',
            }}
          >
            <Spin tip="Loading agencies..." />
          </div>
        ) : null}
        <MapContainer
          center={US_CENTER}
          zoom={US_ZOOM}
          scrollWheelZoom
          style={{ height: 600, width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            iconCreateFunction={createClusterIcon}
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
          >
            {points.map((point) => (
              <Marker
                key={point.id}
                position={[point.lat, point.lon]}
                icon={
                  isCustomerStage(point.stage)
                    ? customerIcon(point.officers, point.approximate)
                    : point.approximate
                      ? approximateIcon(point.stage, point.inPipeline)
                      : dotIcon(point.officers, colorMode, point.stage, point.inPipeline)
                }
                zIndexOffset={isCustomerStage(point.stage) ? 1000 : 0}
                eventHandlers={measureMode ? { click: () => togglePoint(point) } : undefined}
              >
                {measureMode ? null : (
                <Popup>
                  <Space direction="vertical" size={2}>
                    <Text strong>{point.name}</Text>
                    {point.lines.map((line) => (
                      <Text key={line} type="secondary">
                        {line}
                      </Text>
                    ))}
                    {point.approximate ? (
                      <Text type="warning" style={{ fontSize: 12 }}>
                        Approximate location
                      </Text>
                    ) : null}
                    {point.ori ? (
                      <Button
                        size="small"
                        type="primary"
                        style={{ marginTop: 6 }}
                        onClick={() => setBriefingFor({ ori: point.ori, name: point.name })}
                      >
                        Research this agency
                      </Button>
                    ) : null}
                  </Space>
                </Popup>
                )}
              </Marker>
            ))}
          </MarkerClusterGroup>

          {selected.map((point, index) => (
            <Marker
              key={`sel:${point.id}`}
              position={[point.lat, point.lon]}
              icon={selectionRing(
                index === 0 ? 'A' : 'B',
                Math.round((pinWidthFor(point) * 4) / 3),
              )}
              zIndexOffset={2000}
              interactive={false}
            />
          ))}

          {measured ? (
            <>
              <Polyline
                positions={[
                  [measured.a.lat, measured.a.lon],
                  [measured.b.lat, measured.b.lon],
                ]}
                pathOptions={{ color: '#1f6f8f', weight: 3, dashArray: '7 6', opacity: 0.9 }}
              />
              <Marker
                position={measured.midpoint}
                icon={distanceLabel(`${Math.round(measured.miles)} mi`)}
                zIndexOffset={2500}
                interactive={false}
              />
            </>
          ) : null}
        </MapContainer>
      </Card>

      <Card className="section-card" title="Legend">
        <Space wrap size={16}>
          {(colorMode === 'stage'
            ? [
                ...STAGE_ORDER.map((label) => ({ label, color: STAGE_COLORS[label] })),
                { label: 'Not in HubSpot', color: NOT_IN_PIPELINE_COLOR },
              ]
            : [...SIZE_BANDS, { label: 'No count reported', color: UNKNOWN_COLOR }]
          ).map((band) => (
            <Space key={band.label} size={6}>
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: band.color,
                }}
              />
              <Text type="secondary">{band.label}</Text>
            </Space>
          ))}
          <Space size={6}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px dashed #8c8c8c',
              }}
            />
            <Text type="secondary">Approximate location (dashed)</Text>
          </Space>
          <Space size={6}>
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: CUSTOMER_COLOR,
                boxShadow: `0 0 0 2px #fff, 0 0 5px ${CUSTOMER_COLOR}`,
              }}
            />
            <Text strong>Current customer (larger green pin, ticked)</Text>
          </Space>
        </Space>
      </Card>
      <AgencyBriefingPanel
        ori={briefingFor?.ori ?? null}
        agencyName={briefingFor?.name ?? ''}
        open={Boolean(briefingFor)}
        onClose={() => setBriefingFor(null)}
      />
    </Space>
  )
}
