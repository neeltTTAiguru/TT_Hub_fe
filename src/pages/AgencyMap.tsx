import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AutoComplete, Button, Card, Checkbox, Col, Input, Modal, Row, Select, Space, Statistic, Spin, Typography, message } from 'antd'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import AgencyBriefingPanel from '../components/AgencyBriefingPanel'
import TravellerChat from '../components/TravellerChat'
import ResearchRunPanel from '../components/ResearchRunPanel'
import SdrFormModal from '../components/SdrFormModal'
import CallLogModal from '../components/CallLogModal'
import CallReportModal from '../components/CallReportModal'
import {
  TRAVELLER_SPRITE,
  TRAVELLER_SPRITE_WAVE,
  travellerSvg,
} from '../components/travellerSprite'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  getCrmDealGeojson,
  getLeAgencyGeojson,
  getLeAgencyStats,
  getResearchActivity,
  moveTraveller,
  setTrustedBwc,
  type CrmDealFeature,
  type LeAgencyFeature,
  type LeAgencyStats,
  type ResearchActivity,
  getActiveResearchRun,
  type ResearchRunState,
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
// Deliberately louder than the amber unknown pin, which it sits next to. A
// test agency that reads as real is a trap somebody eventually rings.
const TEST_COLOR = '#e8590c'
const UNKNOWN_BWC_COLOR = '#d4a017'
// The vendors actually seen in the data, offered as suggestions rather than a
// closed list - the long tail here is real, and a free-text box that quietly
// refuses an unlisted vendor is worse than no suggestions at all.
const COMMON_VENDORS = [
  'Axon',
  'Motorola/WatchGuard',
  'Getac',
  'Utility',
  'Digital Ally',
  'Wolfcom',
  'Coban',
  'Reveal',
  'Visual Labs',
  'Panasonic',
  'Pro-Vision',
  'LensLock',
]
// An agency an SDR has logged a call to. Deliberately the one cool colour in a
// warm palette, so a worked territory reads at a glance without squinting at
// shades of red and amber.
//
// It OVERRIDES the camera colour rather than sitting beside it, which is a real
// trade: a contacted agency no longer says on the map whether it has cameras.
// That is the intended reading - once we have rung them, "have we spoken to
// them" is the question being asked of the pin, and the card still carries the
// camera lines in full.
const CONTACTED_COLOR = '#7fc4e8'
// The live research run. A deliberate outsider in this palette - it is the one
// thing on the map that is happening rather than known.
const TRAVELLER_COLOR = '#1f6f8f'


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
  // our own verdict: has_bwc | no_bwc | ''
  bwcTrusted: string
  bwcTrustedBy: string
  isTest?: boolean
  // An SDR has logged at least one call to this agency.
  contacted: boolean
  callCount: number
  lastCalledAt: string | null
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
type PinCategory = 'contacted' | 'bwc' | 'noBwc' | 'unknownBwc' | 'test'

// Customers are no longer a category of their own: they keep their distinct
// ticked pin, but they are filtered by camera status like every other agency.
function categoryFor(point: {
  bwcStatus: string
  bwcTrusted?: string
  isTest?: boolean
  contacted?: boolean
}): PinCategory {
  if (point.isTest) return 'test'
  // Claimed before the camera rows on purpose - a contacted agency is coloured
  // light blue, so it has to be counted and filtered as one, or the legend
  // tallies would not match what is on the screen.
  if (point.contacted) return 'contacted'
  if (point.bwcTrusted === 'has_bwc') return 'bwc'
  if (point.bwcTrusted === 'no_bwc') return 'noBwc'
  if (point.bwcStatus === 'yes') return 'bwc'
  if (point.bwcStatus === 'no') return 'noBwc'
  // planned and purchased_not_deployed land here: nothing is deployed yet, so
  // the map does not claim they have cameras. The card still says which it is.
  return 'unknownBwc'
}

/**
 * Our own research verdict, stated on every card.
 *
 * Kept apart from the outside-source line below because they answer different
 * questions: this one is "did WE check, and what did we find", which is the
 * only claim we stand behind.
 */
function trustedLine(p: { bwcTrusted?: string; bwcVendor?: string }) {
  if (p.bwcTrusted === 'has_bwc') {
    return `Trusted research: ALREADY HAS BWC${p.bwcVendor ? ` - ${p.bwcVendor}` : ''}`
  }
  if (p.bwcTrusted === 'no_bwc') return 'Trusted research: NO BWC'
  return 'Trusted research: not checked yet'
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
  bwcTrusted?: string
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

/**
 * Colour says one thing only: does this agency have body-worn cameras.
 *
 * Our own research wins when it exists. Everything else pools four outside
 * sources of very different strength - a sighting, a survey answer, a grant, a
 * state mandate - and a pin we went and verified should not look identical to
 * one coloured by a statute.
 */
function colorFor(bwcStatus: string, bwcTrusted = '', isTest = false, contacted = false) {
  if (isTest) return TEST_COLOR
  // Outreach outranks camera status: once somebody has rung them, the pin is
  // answering "have we spoken to this agency" instead.
  if (contacted) return CONTACTED_COLOR
  if (bwcTrusted === 'has_bwc') return BWC_COLOR
  if (bwcTrusted === 'no_bwc') return NO_BWC_COLOR
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

/**
 * Two arrows chasing each other round a circle - the refresh glyph.
 *
 * Drawn inline rather than pulled from an icon set: this app has no icon
 * dependency and the three other glyphs in it are hand-written SVG on
 * currentColor, so a package for one button would be the odd thing out.
 */
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8 A5 5 0 0 1 13 8" />
        <path d="M11.2 6.6 L13 8.4 L14.8 6.6" />
        <path d="M13 8 A5 5 0 0 1 3 8" />
        <path d="M4.8 9.4 L3 7.6 L1.2 9.4" />
      </g>
    </svg>
  )
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
function dotIcon(
  officers: number | null,
  inPipeline: boolean,
  bwcStatus: string,
  bwcTrusted = '',
  isTest = false,
  contacted = false,
) {
  const width = officers === null ? 20 : Math.min(20 + Math.sqrt(officers) * 1.1, 34)
  const height = Math.round((width * 4) / 3)

  const color = colorFor(bwcStatus, bwcTrusted, isTest, contacted)

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

/**
 * The research run's current position: a pixel-art wanderer.
 *
 * Deliberately unlike every other marker here. The pins encode facts about
 * agencies; he is a thing that is happening, so he is a character rather than
 * a symbol and sits above the lot. Drawn as SVG rects with crispEdges so he
 * stays sharp at any zoom and looks identical on every machine - an emoji
 * would render differently on each and turn to mush at this size.
 */
function travellerIcon(label: string, working = true, waving = false) {
  const frame = waving ? TRAVELLER_SPRITE_WAVE : TRAVELLER_SPRITE
  const width = 34
  const height = Math.round((width * frame.length) / 16)
  const sprite = travellerSvg(width, frame)

  const html = `<div style="position:relative;width:${width}px;height:${height + 22}px;cursor:pointer;
    ${waving ? 'animation:tvl-wave 0.5s ease-in-out 3;' : working ? 'animation:tvl-bob 1.1s ease-in-out infinite;' : ''}">
    ${
      working
        ? `<span style="position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);
            width:26px;height:9px;border-radius:50%;background:${TRAVELLER_COLOR};opacity:0.3;
            animation:tvl-pulse 1.8s ease-out infinite"></span>`
        : ''
    }
    ${
      waving
        ? `<span style="position:absolute;top:-6px;left:${width - 4}px;white-space:nowrap;
            background:#fff;color:#1b1f24;font-size:12px;font-weight:600;
            padding:5px 10px;border-radius:12px;border:2px solid ${TRAVELLER_COLOR};
            box-shadow:0 2px 6px rgba(0,0,0,0.25)">Hi.</span>`
        : ''
    }
    ${
      label
        ? `<span style="position:absolute;top:0;left:50%;transform:translateX(-50%);
            white-space:nowrap;background:${TRAVELLER_COLOR};color:#fff;font-size:10px;
            font-weight:600;padding:2px 6px;border-radius:8px;
            border:2px solid rgba(255,255,255,0.92)">${label}</span>`
        : ''
    }
    <div style="position:absolute;top:20px;left:0">${sprite}</div>
  </div>`

  return L.divIcon({
    className: 'agency-map-traveller',
    html,
    iconSize: [width, height + 22],
    // He stands BESIDE the agency, not on it. Anchoring him centrally put him
    // squarely over the pin, which hid it and swallowed the click - so the
    // agency underneath could not be opened or researched. Anchoring past his
    // right edge places him just to the left, boots level with the coordinate,
    // leaving the pin visible and clickable.
    iconAnchor: [width + 8, height + 22],
  })
}

/** Hands the Leaflet map instance up, so buttons outside it can move it. */
function MapHandle({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => onReady(map), [map, onReady])
  return null
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
  const [activity, setActivity] = useState<ResearchActivity | null>(null)
  const [run, setRun] = useState<ResearchRunState | null>(null)
  const [runTick, setRunTick] = useState(0)
  // Read inside the polling loop, which must not re-subscribe on every tick.
  const activityRef = useRef<ResearchActivity | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [waving, setWaving] = useState(false)
  // Marking an agency as having cameras asks which vendor, because "they have
  // cameras" without a vendor is barely more useful than not knowing.
  const [vendorPrompt, setVendorPrompt] = useState<{ ori: string; name: string; vendor: string } | null>(null)
  const [sdrFor, setSdrFor] = useState<{ ori: string; name: string } | null>(null)
  // Which agencies have a qualification on file, so the button can show it
  // without fetching every agency's form up front.
  const [sdrFilled, setSdrFilled] = useState<Set<string>>(new Set())
  const [callLogFor, setCallLogFor] = useState<{
    ori: string
    name: string
    phone: string
    chiefName: string
    chiefTitle: string
  } | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
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
  // Bumped by the refresh button. The map is left open for hours while other
  // people are qualifying agencies and closing deals, so what is on screen goes
  // stale without anything changing here to notice it.
  const [reloadKey, setReloadKey] = useState(0)

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

    Promise.all([
      getLeAgencyGeojson(query),
      getLeAgencyStats(query),
      // Customers are fetched separately and deliberately NOT narrowed by size,
      // type or search. They are the reference points the rest of the map is
      // read against, and a filter quietly dropping one is worse than useless -
      // it makes the map look like you have no customers there. State is the
      // one filter they still respect, because that is which part of the
      // country you are looking at rather than a question about the agency.
      getLeAgencyGeojson({ state, stage: CUSTOMER_STAGE }),
    ])
      .then(([geo, nextStats, customerGeo]) => {
        if (cancelled) return
        const seen = new Set(geo.features.map((f) => f.properties.ori))
        setFeatures([
          ...geo.features,
          ...customerGeo.features.filter((f) => !seen.has(f.properties.ori)),
        ])
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
    // reloadKey is a counter, deliberately not read in the body - changing it
    // is the whole signal, and the fetch is otherwise identical.
  }, [query, state, reloadKey])

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
  }, [customersOnly, state, reloadKey])

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
      bwcTrusted: f.properties.bwcTrusted || '',
      bwcTrustedBy: f.properties.bwcTrustedBy || '',
      bwcVendor: f.properties.bwcVendor || '',
      isTest: Boolean(f.properties.isTest),
      contacted: Boolean(f.properties.contacted),
      callCount: f.properties.callCount ?? 0,
      lastCalledAt: f.properties.lastCalledAt ?? null,
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
        // Two separate lines on purpose. The first is our own verdict and is
        // always present, including when the answer is "we have not looked" -
        // an absent line reads as an oversight rather than a state. The second
        // is what outside sources say, which is a different claim entirely.
        trustedLine(f.properties),
        bwcLine(f.properties),
        // Said in words as well as colour. A light blue pin tells you somebody
        // called; only the card can tell you when, and how many times.
        f.properties.contacted
          ? `Reached out: ${f.properties.callCount ?? 1} call${
              (f.properties.callCount ?? 1) === 1 ? '' : 's'
            }${
              f.properties.lastCalledAt
                ? `, last ${new Date(f.properties.lastCalledAt).toLocaleDateString()}`
                : ''
            }${f.properties.lastCallOutcome ? ` - ${f.properties.lastCallOutcome}` : ''}`
          : '',
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
        bwcTrusted: '',
        bwcTrustedBy: '',
        bwcVendor: '',
        contacted: false,
        callCount: 0,
        lastCalledAt: null,
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
    const counts: Record<PinCategory, number> = {
      contacted: 0,
      bwc: 0,
      noBwc: 0,
      unknownBwc: 0,
      test: 0,
    }
    for (const point of agencyPoints) counts[categoryFor(point)] += 1
    return counts
  }, [agencyPoints])

  const visibleAgencyPoints = useMemo(
    () =>
      hiddenCategories.size === 0
        ? agencyPoints
        : agencyPoints.filter(
            // Customers are exempt from the legend filters too. Southwestern
            // University has no camera status, so unticking Unknown made a
            // customer vanish - which is the one thing the map must never do.
            (point) => isCustomerStage(point.stage) || !hiddenCategories.has(categoryFor(point)),
          ),
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

  // A live run is the authority on where he is standing. The activity feed
  // derives his position from research timestamps, which is right when nobody
  // is driving him but lags a run by a poll - and a traveller who arrives after
  // the agency he is working on is worse than no animation at all.
  const runAt = useMemo(() => {
    if (!run) return null
    const stop = run.current ?? (run.path.length ? run.path[run.path.length - 1] : null)
    if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return null
    return {
      ori: stop.ori,
      name: stop.name,
      state: stop.state,
      county: '',
      lat: stop.lat as number,
      lon: stop.lon as number,
      startedAt: stop.at,
    }
  }, [run])

  const runIsLive = run?.status === 'running' || run?.status === 'stopping'
  const isResearching = Boolean(runIsLive) || Boolean(activity?.travellers.length)
  const travellerAt = runAt ?? activity?.travellers[0] ?? activity?.lastPosition ?? null

  // Follow a running research job.
  //
  // Polls a deliberately small endpoint rather than re-pulling the national
  // geojson, and patches finished agencies into the features already loaded so
  // their pins change colour in place. Backs off to a slow heartbeat when
  // nothing is running, so an idle map is not hammering the API.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let since: string | undefined

    const tick = async () => {
      try {
        const next = await getResearchActivity({ since, state })
        if (cancelled) return
        since = next.now
        setActivity(next)
        activityRef.current = next
        if (next.completed.length) {
          const byOri = new Map(next.completed.map((row) => [row.ori, row]))
          setFeatures((current) =>
            current.map((feature) => {
              const done = byOri.get(feature.properties.ori)
              return done
                ? {
                    ...feature,
                    properties: {
                      ...feature.properties,
                      bwcStatus: done.bwcStatus,
                      bwcVendor: done.bwcVendor,
                      bwcEvidence: 'researched',
                      hasBwc: done.bwcStatus === 'yes',
                    },
                  }
                : feature
            }),
          )
        }
      } catch {
        /* a failed poll is not worth surfacing; the next one will retry */
      }
      if (!cancelled) {
        const running = Boolean(activityRef.current?.travellers.length)
        timer = setTimeout(tick, running ? 5000 : 30000)
      }
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state])

  const togglePoint = (point: MapPoint) => {
    setSelected((current) => {
      if (current.some((p) => p.id === point.id)) {
        return current.filter((p) => p.id !== point.id)
      }
      // Third click starts a new pair from the most recent choice.
      return current.length >= 2 ? [current[1], point] : [...current, point]
    })
  }

  /**
   * Markers, built once per data change rather than once per render.
   *
   * There are ~14,600 of them and each builds an SVG string and a Leaflet
   * divIcon. Rendering them inline meant every unrelated state change rebuilt
   * the lot: the activity poll ticking every few seconds, and - far worse -
   * every single keystroke in the traveller chat, which locked the page solid.
   */
  /**
   * Set the trusted verdict by hand and recolour the pin at once.
   *
   * Research returns "unknown" for a lot of small agencies - they publish
   * nothing, and no amount of searching invents a source. This is the escape
   * hatch for when you know the answer anyway. It is recorded as a person's
   * judgement rather than a finding, and a later automated run will not
   * overwrite it.
   */
  /**
   * Open a briefing, and walk the traveller over while it runs.
   *
   * Researching an agency IS visiting it, so leaving him standing somewhere
   * else made the map say one thing and the panel another.
   */
  const openBriefing = (ori: string, name: string) => {
    setBriefingFor({ ori, name })
    void moveTraveller(ori)
      .then((position) => {
        setActivity((current) =>
          current
            ? { ...current, lastPosition: { ...position, status: 'unknown', at: null }, sentByHand: true }
            : current,
        )
      })
      .catch(() => {
        /* he stays where he is; not worth interrupting the briefing over */
      })
  }

  const markTrusted = async (
    ori: string,
    value: 'has_bwc' | 'no_bwc' | '',
    vendor?: string,
  ) => {
    setFeatures((current) =>
      current.map((feature) =>
        feature.properties.ori === ori
          ? {
              ...feature,
              properties: {
                ...feature.properties,
                bwcTrusted: value,
                bwcTrustedBy: value ? 'manual' : '',
                bwcVendor: vendor || feature.properties.bwcVendor,
              },
            }
          : feature,
      ),
    )
    try {
      await setTrustedBwc(ori, value, vendor ? { vendor } : {})
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not save that.')
    }
  }

  const markerNodes = useMemo(
    () => (
      <>
            {points.map((point) => (
              <Marker
                key={point.id}
                position={[point.lat, point.lon]}
                icon={
                  isCustomerStage(point.stage)
                    ? customerIcon(point.officers)
                    : dotIcon(
                        point.officers,
                        point.inPipeline,
                        point.bwcStatus,
                        point.bwcTrusted,
                        point.isTest,
                        point.contacted,
                      )
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
                      <Space direction="vertical" size={6} style={{ marginTop: 6 }}>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => openBriefing(point.ori, point.name)}
                        >
                          Research this agency
                        </Button>
                        {/* Set it by hand when research finds nothing but you
                            know the answer. A person's word beats an empty
                            search, and it is recorded as a person's word. */}
                        {/* wrap, because a fourth button here squeezed the
                            "Mark:" label down to one letter per line. */}
                        <Space size={4} wrap>
                          <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            Mark:
                          </Text>
                          <Button
                            size="small"
                            type={point.bwcTrusted === 'has_bwc' ? 'primary' : 'default'}
                            onClick={() =>
                              setVendorPrompt({ ori: point.ori, name: point.name, vendor: point.bwcVendor || '' })
                            }
                          >
                            Has BWC
                          </Button>
                          <Button
                            size="small"
                            type={point.bwcTrusted === 'no_bwc' ? 'primary' : 'default'}
                            onClick={() => void markTrusted(point.ori, 'no_bwc')}
                          >
                            No BWC
                          </Button>
                          {point.bwcTrusted ? (
                            <Button size="small" onClick={() => void markTrusted(point.ori, '')}>
                              Clear
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            type={sdrFilled.has(point.ori) ? 'primary' : 'default'}
                            onClick={() => setSdrFor({ ori: point.ori, name: point.name })}
                          >
                            SDR Form
                          </Button>
                          {/* The call log sits beside the qualification because
                              they are filled in at the same moment - one is what
                              the call established, the other is that it happened
                              at all. Saving one turns the pin light blue. */}
                          <Button
                            size="small"
                            // Same convention as the SDR Form button beside it:
                            // filled means there is something on file. The
                            // light blue lives on the pin, not in the theme.
                            type={point.contacted ? 'primary' : 'default'}
                            onClick={() =>
                              setCallLogFor({
                                ori: point.ori,
                                name: point.name,
                                phone: point.contact?.phone || '',
                                chiefName: point.contact?.chiefName || '',
                                chiefTitle: point.contact?.chiefTitle || '',
                              })
                            }
                          >
                            Call log{point.callCount ? ` (${point.callCount})` : ''}
                          </Button>
                        </Space>
                      </Space>
                    ) : null}
                  </Space>
                </Popup>
                )}
              </Marker>
            ))}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, measureMode, selected, sdrFilled],
  )

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

  // Searching for an agency walks the traveller there.
  //
  // Deliberately skipped while a run is going: the runner owns his position
  // then, and sending him somewhere else would either fight the run or be
  // overwritten within seconds, which looks broken either way.
  const searchedRef = useRef('')
  useEffect(() => {
    const term = search.trim()
    if (!term || term === searchedRef.current) return
    if (runIsLive) return

    // The first match in what the map is already showing - no extra request,
    // and it is the agency the user can see rather than a hidden better match.
    const match = agencyPoints.find((point) =>
      point.name.toLowerCase().includes(term.toLowerCase()),
    )
    if (!match) return

    searchedRef.current = term
    moveTraveller(match.ori)
      .then((moved) => {
        setActivity((current) =>
          current
            ? { ...current, lastPosition: { ...moved, status: 'unknown', at: null }, sentByHand: true }
            : current,
        )
        mapRef.current?.flyTo([moved.lat, moved.lon], 11, { duration: 1.4 })
      })
      .catch(() => {
        // A search that cannot place him is not worth interrupting the user for.
      })
  }, [search, agencyPoints, runIsLive])

  // The run's trail, polled from the server rather than tracked in this tab.
  // That is what makes it survive a logout and look identical to two people
  // watching at once - the browser is a viewer here, never the driver.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = () => {
      getActiveResearchRun()
        .then((next) => {
          if (cancelled) return
          const state = 'id' in next ? next : null
          setRun(state)
          // Idle between runs is the common case, so back right off then and
          // only poll hard while there is actually something moving.
          const live = state?.status === 'running' || state?.status === 'stopping'
          timer = setTimeout(poll, live ? 5000 : 30000)
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(poll, 30000)
        })
    }
    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runTick])

  // Recolour the pins the run has settled, from the trail it already sends.
  // Re-pulling the geojson every few seconds to see three cells change would
  // move megabytes; the verdicts are already in the poll, so apply them here.
  useEffect(() => {
    const stops = run?.path ?? []
    if (!stops.length) return
    setFeatures((current) => {
      const byOri = new Map(stops.map((stop) => [stop.ori, stop]))
      let changed = false
      const next = current.map((feature) => {
        const stop = byOri.get(feature.properties.ori)
        if (!stop || stop.verdict === 'unknown' || !stop.verdict) return feature
        const trusted = stop.verdict === 'no' ? 'no_bwc' : 'has_bwc'
        if (feature.properties.bwcTrusted === trusted) return feature
        changed = true
        return {
          ...feature,
          properties: {
            ...feature.properties,
            bwcTrusted: trusted,
            hasBwc: trusted === 'has_bwc',
            bwcEvidence: 'researched',
          },
        }
      })
      return changed ? next : current
    })
  }, [run])

  // Where the traveller has actually walked, as a line. Stops with no
  // coordinate are dropped rather than drawn at zero, which would run the trail
  // through the Gulf of Guinea.
  const runPath = useMemo(() => {
    const stops = run?.path ?? []
    return stops
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
      .map((stop) => [stop.lat, stop.lon] as [number, number])
  }, [run])

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

      <style>{`
        @keyframes tvl-pulse{0%{transform:translateX(-50%) scale(0.6);opacity:0.45}70%{transform:translateX(-50%) scale(1.6);opacity:0}100%{opacity:0}}
        @keyframes tvl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes tvl-wave{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-7deg)}}
        @media (prefers-reduced-motion: reduce){.agency-map-traveller *{animation:none!important}}
      `}</style>

      {error ? <Alert type="error" showIcon message="Could not load agencies" description={error} /> : null}

      {activity?.travellers.length ? (
        <Alert
          type="info"
          showIcon
          message={`Researching ${activity.travellers[0].name}`}
          description={`${activity.remaining.toLocaleString()} agencies still to research. Pins update as each one finishes.`}
        />
      ) : null}

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
            // Disabled rather than hidden: a button that appears and vanishes
            // as runs start and stop makes the whole bar jump around.
            disabled={!travellerAt}
            onClick={() => {
              if (travellerAt && mapRef.current) {
                mapRef.current.flyTo([travellerAt.lat, travellerAt.lon], 11, { duration: 1.2 })
              }
            }}
          >
            Find the traveller
          </Button>
          <Button
            size="middle"
            type={customersOnly ? 'primary' : 'default'}
            onClick={() => setCustomersOnly((on) => !on)}
          >
            Customers only
          </Button>
          <Button
            size="middle"
            // Reads the same filters the map is drawn from, so the report
            // covers what is on screen rather than the whole country.
            onClick={() => setReportOpen(true)}
          >
            Call report
          </Button>
          <Button
            size="middle"
            // Icon only. The bar is already long, and the glyph is the one
            // control here that needs no reading.
            icon={<RefreshIcon />}
            loading={loading}
            title="Refresh the map"
            aria-label="Refresh the map"
            onClick={() => setReloadKey((key) => key + 1)}
          />
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

      <Card
        className="section-card"
        bodyStyle={{ padding: 0, position: 'relative', overflow: 'hidden' }}
      >
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
          <MapHandle onReady={(map) => { mapRef.current = map }} />

          {travellerAt ? (
            <Marker
              key={`tvl:${travellerAt.ori}`}
              position={[travellerAt.lat, travellerAt.lon]}
              // Labelled only while he is working. Standing still needs no
              // caption - it is obvious he is where he last got to.
              icon={travellerIcon(isResearching ? 'researching' : '', isResearching, waving)}
              zIndexOffset={3000}
              // No Popup on purpose. A Leaflet popup opens directly over the
              // marker it belongs to, so clicking him hid both the wave and the
              // speech bubble behind a panel that repeated what the chat header
              // already says. Clicking him waves and opens the chat; that is the
              // whole interaction.
              eventHandlers={{
                click: () => {
                  setWaving(true)
                  setTimeout(() => setWaving(false), 1800)
                  setChatOpen(true)
                },
              }}
            />
          ) : null}

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
            {markerNodes}
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

          {runPath.length > 1 ? (
            <Polyline
              positions={runPath}
              pathOptions={{ color: TRAVELLER_COLOR, weight: 2, opacity: 0.7, dashArray: '4 5' }}
              interactive={false}
            />
          ) : null}

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

      <TravellerChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onOpenBriefing={openBriefing}
        at={travellerAt}
        working={isResearching}
        onMoved={(moved) => {
          setActivity((current) =>
            current
              ? { ...current, lastPosition: { ...moved, status: 'unknown', at: null }, sentByHand: true }
              : current,
          )
          mapRef.current?.flyTo([moved.lat, moved.lon], 8, { duration: 1.6 })
        }}
      />
      </Card>

      <Card className="section-card" title="Legend">
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap size={18}>
            {(
              [
                {
                  key: 'contacted',
                  label: 'Reached out',
                  color: CONTACTED_COLOR,
                  striped: false,
                },
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
                { key: 'test', label: 'Test agency', color: TEST_COLOR, striped: false },
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
            Untick a box to hide those pins. Light blue = an SDR has logged a call, and it takes
            precedence over the camera colour - open the pin to see its camera status. Red = has
            cameras, green = confirmed none, amber = nobody has published either way. Stripes = already in HubSpot, and a larger ticked
            green pin is a current customer. Camera status comes from four sources of differing strength - a
            documented sighting, an agency's own survey answer, a camera grant, or a state mandate.
            A mandate is a legal duty, not a verified purchase. Open a pin to see which applies to
            that agency, and how its location was placed.
          </Text>
        </Space>
      </Card>

      <ResearchRunPanel
        mapFilters={query}
        states={STATES}
        agencyTypes={agencyTypes}
        run={run}
        onRunChanged={() => setRunTick((n) => n + 1)}
      />

      <Modal
        title={vendorPrompt ? `${vendorPrompt.name} - which vendor?` : 'Which vendor?'}
        open={Boolean(vendorPrompt)}
        onCancel={() => setVendorPrompt(null)}
        okText="Mark as having BWC"
        onOk={() => {
          if (!vendorPrompt) return
          void markTrusted(vendorPrompt.ori, 'has_bwc', vendorPrompt.vendor.trim())
          setVendorPrompt(null)
        }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Who supplies their cameras? Leave it blank if you do not know - the agency is still
            marked as having them, just without a vendor.
          </Text>
          <AutoComplete
            autoFocus
            style={{ width: '100%' }}
            value={vendorPrompt?.vendor ?? ''}
            placeholder="Axon, Motorola/WatchGuard, ..."
            // Suggestions, not a closed list: the long tail of vendors here is
            // real, and a picker that refuses an unlisted one loses the answer.
            options={COMMON_VENDORS.filter((vendor) =>
              vendor.toLowerCase().includes((vendorPrompt?.vendor || '').toLowerCase()),
            ).map((vendor) => ({ value: vendor }))}
            onChange={(value) =>
              setVendorPrompt((current) => (current ? { ...current, vendor: value } : current))
            }
          />
        </Space>
      </Modal>

      <SdrFormModal
        ori={sdrFor?.ori ?? null}
        agencyName={sdrFor?.name ?? ''}
        open={Boolean(sdrFor)}
        onClose={() => setSdrFor(null)}
        onSaved={(ori, filled) =>
          setSdrFilled((current) => {
            const next = new Set(current)
            if (filled) next.add(ori)
            else next.delete(ori)
            return next
          })
        }
      />

      <CallReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        filters={query}
      />

      <CallLogModal
        ori={callLogFor?.ori ?? null}
        agencyName={callLogFor?.name ?? ''}
        phone={callLogFor?.phone}
        chiefName={callLogFor?.chiefName}
        chiefTitle={callLogFor?.chiefTitle}
        open={Boolean(callLogFor)}
        onClose={() => setCallLogFor(null)}
        // Patched into the features already loaded rather than refetching the
        // national geojson - the pin recolours in place the moment it saves.
        onChanged={(ori, outreach) =>
          setFeatures((current) =>
            current.map((feature) =>
              feature.properties.ori === ori
                ? {
                    ...feature,
                    properties: {
                      ...feature.properties,
                      contacted: outreach.callCount > 0,
                      callCount: outreach.callCount,
                      lastCalledAt: outreach.lastCalledAt,
                      lastCallOutcome: outreach.lastOutcome,
                    },
                  }
                : feature,
            ),
          )
        }
      />

      <AgencyBriefingPanel
        ori={briefingFor?.ori ?? null}
        agencyName={briefingFor?.name ?? ''}
        open={Boolean(briefingFor)}
        onClose={() => setBriefingFor(null)}
        onResearched={(ori, bwcStatus, vendor) =>
          setFeatures((current) =>
            current.map((feature) =>
              feature.properties.ori === ori
                ? {
                    ...feature,
                    properties: {
                      ...feature.properties,
                      bwcStatus,
                      bwcVendor: vendor || feature.properties.bwcVendor,
                      bwcEvidence: 'researched',
                      bwcAsOf: new Date().toISOString(),
                      hasBwc: bwcStatus === 'yes',
                    },
                  }
                : feature,
            ),
          )
        }
      />
    </Space>
  )
}
