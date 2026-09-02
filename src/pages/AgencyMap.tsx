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

// Deals worth showing on a map: the ones with an outcome. Everything still in
// flight is a pipeline question, not a geographic one, and it buried the
// settled deals under noise.
const PLOTTED_DEAL_STAGES = ['Closed Won', 'Closed Lost', 'No Further Interest']

// A won deal means a live customer. They are the pins worth spotting first.
const CUSTOMER_STAGE = 'Closed Won'
const CUSTOMER_COLOR = '#1f8f4d'

export const isCustomerStage = (stage: string) => stage === CUSTOMER_STAGE

// The two signals on this map are independent and must stay that way:
//   COLOUR  = does this agency have a documented body-worn camera
//   STRIPES = is it already in the HubSpot pipeline
// Conflating them hides the camera layer, because only 20 of the 5,071
// camera-equipped agencies are in HubSpot at all.
const BWC_COLOR = '#7f1d1d'
// Muted sage rather than the customer pin's vivid green, so a confirmed "no"
// never gets misread as "this is already a customer".
const NO_BWC_COLOR = '#6f9457'
// Amber for "nobody has published either way". Kept distinct from green
// because a surveyed NO and an unresearched agency are opposite facts: one is
// a qualified prospect, the other is a to-do.
const UNKNOWN_BWC_COLOR = '#d4a017'


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
  hasBwc: boolean
  // yes | no | unknown
  bwcStatus: string
  bwcVendor: string
  lines: string[]
  approximate: boolean
  contact?: {
    chiefName: string
    chiefTitle: string
    chiefSourceUrl: string
    commandStaff: Array<{ name: string; title: string }>
    website: string
    email: string
    phone: string
  }
}

/**
 * Which legend row a pin belongs to. Exactly one, and the order matters:
 * a customer is also "in HubSpot", so it has to be claimed first or it would
 * fall into a second bucket and the counts would not sum.
 */
type PinCategory = 'bwc' | 'noBwc' | 'unknownBwc'

// Customers are no longer a category of their own: they keep their distinct
// ticked pin, but they are filtered by camera status like every other agency.
function categoryFor(point: { bwcStatus: string }): PinCategory {
  if (point.bwcStatus === 'yes') return 'bwc'
  if (point.bwcStatus === 'no') return 'noBwc'
  // planned and purchased_not_deployed land here: nothing is deployed yet, so
  // the map does not claim they have cameras. The card still says which it is.
  return 'unknownBwc'
}

/**
 * One line describing what we know about this agency's cameras.
 *
 * Both the answer AND how it was established, because the four evidence
 * classes are not interchangeable: a sighting is a fact, a survey answer is a
 * self-report with a date on it, and a state mandate is only a legal duty that
 * small departments routinely lag behind. Rendering them identically would be
 * the same mistake as printing nothing at all for a confirmed "no".
 */
function bwcLine(p: {
  bwcStatus?: string
  bwcEvidence?: string
  bwcAsOf?: string | null
  bwcVendor?: string
}) {
  const year = p.bwcAsOf ? new Date(p.bwcAsOf).getFullYear() : null
  const vendor = p.bwcVendor ? ` - ${p.bwcVendor}` : ''
  if (p.bwcStatus === 'no') {
    return `Body cameras: NO - agency reported none${year ? `, ${year}` : ''}`
  }
  if (p.bwcStatus === 'planned') {
    return `Body cameras: PLANNED - budgeted or committed, not yet bought${
      year ? ` (${year})` : ''
    }`
  }
  if (p.bwcStatus === 'purchased_not_deployed') {
    return `Body cameras: BOUGHT${vendor}, not yet deployed${year ? ` (${year})` : ''}`
  }
  if (p.bwcStatus === 'yes') {
    switch (p.bwcEvidence) {
      case 'observed':
        return `Body cameras: yes${vendor}${year ? ` (documented ${year})` : ''}`
      case 'surveyed':
        return `Body cameras: yes${vendor} (agency reported${year ? `, ${year}` : ''})`
      case 'funded':
        return `Body cameras: yes - took a camera grant${year ? ` (${year})` : ''}`
      case 'mandated':
        return 'Body cameras: required by state law - not individually verified'
      // The freshest and best-sourced class on the map, so it says so rather
      // than falling through to a bare "yes" with no provenance.
      case 'researched':
        return `Body cameras: yes${vendor} - verified from source${
          year ? ` in ${year}` : ''
        }`
      default:
        return `Body cameras: yes${vendor}`
    }
  }
  return 'Body cameras: unknown - nobody has published either way'
}

/** Colour says one thing only: does this agency have body-worn cameras. */
function colorFor(bwcStatus: string) {
  if (bwcStatus === 'yes') return BWC_COLOR
  if (bwcStatus === 'no') return NO_BWC_COLOR
  return UNKNOWN_BWC_COLOR
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
function pinWidthFor(point: { officers: number | null; stage: string }) {
  if (isCustomerStage(point.stage)) {
    return point.officers === null ? 30 : Math.min(30 + Math.sqrt(point.officers) * 1.1, 42)
  }
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

/**
 * Diagonal stripe fill, used to mark a pin as already in the HubSpot pipeline.
 *
 * The pattern id has to be unique per colour or every pin on the page inherits
 * whichever one rendered first - SVG pattern ids share a single document scope
 * even across separate <svg> elements. Deriving it from the colour keeps it
 * stable across re-renders without a counter.
 */
function stripePattern(color: string) {
  const id = `stripe-${color.replace('#', '')}`
  const defs =
    `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="4" height="4" ` +
    `patternTransform="rotate(45)">` +
    `<rect width="4" height="4" fill="#ffffff"/>` +
    `<rect width="2" height="4" fill="${color}"/>` +
    `</pattern></defs>`
  return { id, defs }
}

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

/**
 * Agency pin, carrying two independent signals at once.
 *
 *   fill colour -> the active mode; in BWC mode dark red means the Atlas has
 *                  documented a body-worn camera here
 *   stripes     -> this agency is already in the HubSpot pipeline
 *
 * They are deliberately orthogonal. Letting pipeline membership drive the
 * colour would erase the camera layer, since only 20 of 5,071 camera-equipped
 * agencies are in HubSpot.
 */
function dotIcon(officers: number | null, inPipeline: boolean, bwcStatus: string) {
  const width = officers === null ? 20 : Math.min(20 + Math.sqrt(officers) * 1.1, 34)
  const height = Math.round((width * 4) / 3)

  const color = colorFor(bwcStatus)

  if (!inPipeline) {
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

  const { id, defs } = stripePattern(color)

  return makePin(
    pinSvg(
      `${defs}<path d="${PIN_PATH}" fill="url(#${id})" stroke="${color}" stroke-width="2.25" stroke-linejoin="round"/>` +
        `<circle cx="12" cy="12" r="4.4" fill="#ffffff" fill-opacity="0.95"/>`,
      width,
      height,
    ),
    width,
    height,
  )
}

/**
 * Customer pin: larger, brighter, haloed, and carrying a tick.
 *
 * Left solid rather than striped even though a customer is by definition in the
 * pipeline. These are the twelve landmarks the rest of the map is read against,
 * and stripes behind a tick at this size is mush.
 */
function customerIcon(officers: number | null) {
  const width = officers === null ? 30 : Math.min(30 + Math.sqrt(officers) * 1.1, 42)
  const height = Math.round((width * 4) / 3)

  const body = `<path d="${PIN_PATH}" fill="${CUSTOMER_COLOR}" stroke="#ffffff" stroke-width="2"/>`
  const tick = `<path d="M7.6 12.1 L10.6 15.1 L16.6 9.1" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`

  const html = `<svg width="${width}" height="${height}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 0 3px rgba(31,143,77,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.35));">${body}${tick}</svg>`

  return L.divIcon({
    className: 'agency-map-pin agency-map-pin-customer',
    html,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 6],
  })
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

  // Legend rows double as filters. Empty = nothing hidden.
  const [hiddenCategories, setHiddenCategories] = useState<Set<PinCategory>>(new Set())

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
  // The stage multi-select is gone; this is the one stage question left.
  const [customersOnly, setCustomersOnly] = useState(false)

  const query = useMemo(
    () => ({
      state,
      agencyType,
      search: search.trim() || undefined,
      maxOfficers: maxOfficers ?? undefined,
      hasOfficerCount: maxOfficers !== null,
      stage: customersOnly ? CUSTOMER_STAGE : undefined,
    }),
    [state, agencyType, search, maxOfficers, customersOnly],
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
  useEffect(() => {
    let cancelled = false
    const dealQuery = {
      stage: (customersOnly ? [CUSTOMER_STAGE] : PLOTTED_DEAL_STAGES).join(','),
      state,
    }

    getCrmDealGeojson(dealQuery)
      .then((geo) => {
        if (cancelled) return
        setDealFeatures(geo.features)
      })
      .catch(() => {
        if (!cancelled) setDealFeatures([])
      })

    return () => { cancelled = true }
  }, [customersOnly, state])

  const agencyPoints: MapPoint[] = useMemo(() => {
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
      hasBwc: Boolean(f.properties.hasBwc),
      bwcStatus: f.properties.bwcStatus || 'unknown',
      bwcVendor: f.properties.bwcVendor || '',
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
        // Always stated, for every agency. Silence used to mean both "we asked
        // and they said no" and "we have no idea", which are opposite facts.
        bwcLine(f.properties),
        // Say where the pin came from. A county-centre pin is not a location.
        f.properties.precision === 'county'
          ? 'Location: county centre only (FBI published no address)'
          : f.properties.precision === 'rooftop' || f.properties.precision === 'street'
            ? 'Location: geocoded from street address'
            : '',
        `ORI ${f.properties.ori}`,
      ].filter(Boolean),
      approximate: f.properties.approximate,
      contact: {
        chiefName: f.properties.chiefName,
        chiefTitle: f.properties.chiefTitle,
        chiefSourceUrl: f.properties.chiefSourceUrl,
        commandStaff: f.properties.commandStaff ?? [],
        website: f.properties.website,
        email: f.properties.email,
        phone: f.properties.phone,
      },
    }))
  }, [features])

  const dealPoints: MapPoint[] = useMemo(() => {
    return dealFeatures
      // With the agency layer on, an exactly-matched deal is a duplicate pin.
      // An exactly-matched deal duplicates the agency pin underneath it.
      .filter((f) => !(f.properties.locationSource === 'exact'))
      // The API is asked for settled stages only; this holds the line if a
      // cached or stale response carries anything else.
      .filter((f) => PLOTTED_DEAL_STAGES.includes(f.properties.stage))
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
        hasBwc: false,
        bwcStatus: 'unknown',
        bwcVendor: '',
        lines: [
          'HubSpot deal',
          f.properties.owner ? `Owner: ${f.properties.owner}` : '',
          f.properties.matchedAgencyName ? `Agency: ${f.properties.matchedAgencyName}` : '',
          f.properties.locationNote,
        ].filter(Boolean),
        approximate: f.properties.locationSource !== 'exact',
      }))
  }, [dealFeatures])

  /** Live tally per legend row, from what is actually plotted right now. */
  const categoryCounts = useMemo(() => {
    const counts: Record<PinCategory, number> = { bwc: 0, noBwc: 0, unknownBwc: 0 }
    for (const point of agencyPoints) counts[categoryFor(point)] += 1
    return counts
  }, [agencyPoints])

  const visibleAgencyPoints = useMemo(
    () =>
      hiddenCategories.size === 0
        ? agencyPoints
        : agencyPoints.filter((point) => !hiddenCategories.has(categoryFor(point))),
    [agencyPoints, hiddenCategories],
  )

  const toggleCategory = (category: PinCategory) =>
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })

  const points = useMemo(
    () => [...visibleAgencyPoints, ...dealPoints],
    [visibleAgencyPoints, dealPoints],
  )

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
            type={customersOnly ? 'primary' : 'default'}
            onClick={() => setCustomersOnly((on) => !on)}
          >
            Customers only
          </Button>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card className="section-card">
            <Statistic title="Agencies plotted" value={visibleAgencyPoints.length} />
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
            key={`clusters:${[...hiddenCategories].sort().join(',')}`}
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
                    ? customerIcon(point.officers)
                    : dotIcon(point.officers, point.inPipeline, point.bwcStatus)
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

                    {point.contact?.chiefName ? (
                      <Text style={{ fontSize: 12, marginTop: 4 }}>
                        {point.contact.chiefTitle
                          ? `${point.contact.chiefTitle}: `
                          : 'Chief: '}
                        <Text strong style={{ fontSize: 12 }}>
                          {point.contact.chiefName}
                        </Text>
                      </Text>
                    ) : null}
                    {(point.contact?.commandStaff ?? []).slice(0, 3).map((person) => (
                      <Text key={person.name} type="secondary" style={{ fontSize: 12 }}>
                        {person.title ? `${person.title}: ` : ''}
                        {person.name}
                      </Text>
                    ))}

                    {point.contact?.phone ? (
                      <Text style={{ fontSize: 12 }}>
                        <a href={`tel:${point.contact.phone.replace(/[^\d+]/g, '')}`}>
                          {point.contact.phone}
                        </a>
                      </Text>
                    ) : null}
                    {point.contact?.email ? (
                      <Text style={{ fontSize: 12 }}>
                        <a href={`mailto:${point.contact.email}`}>{point.contact.email}</a>
                      </Text>
                    ) : null}
                    {point.contact?.website ? (
                      <Text style={{ fontSize: 12 }}>
                        <a href={point.contact.website} target="_blank" rel="noreferrer">
                          Official website
                        </a>
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
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap size={18}>
            {(
              [
                { key: 'bwc', label: 'Has body-worn cameras', color: BWC_COLOR, striped: false },
                {
                  key: 'noBwc',
                  label: 'Confirmed no cameras',
                  color: NO_BWC_COLOR,
                  striped: false,
                },
                {
                  key: 'unknownBwc',
                  label: 'Unknown',
                  color: UNKNOWN_BWC_COLOR,
                  striped: false,
                },
              ] as Array<{
                key: PinCategory
                label: string
                color: string
                striped: boolean
                emphasis?: boolean
              }>
            ).map((item) => {
              const hidden = hiddenCategories.has(item.key)
              return (
                // The click lives on the row, not the Checkbox: antd's own
                // onChange did not fire reliably here, and the whole row is a
                // bigger target anyway. The Checkbox is display-only, with
                // pointer events off so it can never fire a second toggle.
                <Space
                  key={item.key}
                  size={6}
                  onClick={() => toggleCategory(item.key)}
                  role="checkbox"
                  aria-checked={!hidden}
                  aria-label={item.label}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <Checkbox checked={!hidden} onChange={() => {}} style={{ pointerEvents: 'none' }} />
                  <span
                    style={{
                      display: 'inline-block',
                      width: item.emphasis ? 15 : 13,
                      height: item.emphasis ? 15 : 13,
                      borderRadius: '50%',
                      border: `1px solid ${item.color}`,
                      background: item.striped ? undefined : item.color,
                      backgroundImage: item.striped
                        ? `repeating-linear-gradient(45deg, ${item.color} 0 2px, #ffffff 2px 4px)`
                        : undefined,
                      verticalAlign: 'middle',
                    }}
                  />
                  <Text strong={item.emphasis} type={item.emphasis ? undefined : 'secondary'}>
                    {item.label} ({categoryCounts[item.key].toLocaleString()})
                  </Text>
                </Space>
              )
            })}
            {hiddenCategories.size ? (
              <Button size="small" onClick={() => setHiddenCategories(new Set())}>
                Show all
              </Button>
            ) : null}
          </Space>

          <Text type="secondary" style={{ fontSize: 12 }}>
            Untick a box to hide those pins. Red = has cameras, green = confirmed none, amber =
            nobody has published either way. Stripes = already in HubSpot, and a larger ticked
            green pin is a current customer. Camera status comes from four sources of differing strength - a
            documented sighting, an agency's own survey answer, a camera grant, or a state mandate.
            A mandate is a legal duty, not a verified purchase. Open a pin to see which applies to
            that agency, and how its location was placed.
          </Text>
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
