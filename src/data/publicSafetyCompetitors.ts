// Canonical list of Public Safety (body-worn / in-car video) competitors the
// Competitor Analyst agent tracks. Each entry renders as a "section" of the
// Competitor Analyst's brain and is the target a memory can be saved into.
//
// IMPORTANT: keep this in sync with beCRM/src/data/publicSafetyCompetitors.js
// (the backend copy validates saves against the same slugs).

export type PublicSafetyCompetitor = {
  slug: string
  name: string
  website: string
}

export const PUBLIC_SAFETY_COMPETITORS: PublicSafetyCompetitor[] = [
  { slug: 'axon-enterprise', name: 'Axon Enterprise', website: 'https://www.axon.com' },
  { slug: 'motorola-solutions', name: 'Motorola Solutions', website: 'https://www.motorolasolutions.com' },
  { slug: 'getac-video-solutions', name: 'Getac Video Solutions', website: 'https://www.getacvideo.com' },
  { slug: 'utility-associates', name: 'Utility Associates', website: 'https://www.utility.com' },
  { slug: 'i-pro', name: 'i-PRO (Arbitrator BWC line)', website: 'https://i-pro.com' },
  { slug: 'digital-ally', name: 'Digital Ally', website: 'https://www.digitalallyinc.com' },
  { slug: 'safe-fleet-coban', name: 'Safe Fleet (COBAN)', website: 'https://www.safefleet.net' },
  { slug: 'reveal-media', name: 'Reveal Media', website: 'https://www.revealmedia.com' },
  { slug: 'pro-vision', name: 'PRO-VISION', website: 'https://www.provisionusa.com' },
  { slug: 'wolfcom', name: 'Wolfcom', website: 'https://wolfcomusa.com' },
  { slug: 'zepcam', name: 'Zepcam', website: 'https://www.zepcam.com' },
  { slug: 'hytera', name: 'Hytera', website: 'https://www.hytera.com' },
  { slug: 'safety-vision', name: 'Safety Vision', website: 'https://www.safetyvision.com' },
  { slug: 'kustom-signals', name: 'Kustom Signals', website: 'https://www.kustomsignals.com' },
  { slug: 'wrap-technologies', name: 'Wrap Technologies (Intrensic BWC)', website: 'https://www.wrap.com' },
  { slug: 'axis-communications', name: 'Axis Communications', website: 'https://www.axis.com' },
  { slug: 'transcend', name: 'Transcend (DrivePro Body)', website: 'https://www.transcend-info.com' },
  { slug: 'pinnacle-response', name: 'Pinnacle Response', website: 'https://www.pinnacleresponse.com' },
  { slug: 'lenslock', name: 'LensLock', website: 'https://www.lenslock.com' },
  { slug: 'patrol-eyes', name: 'Patrol Eyes', website: 'https://www.patroleyes.com' },
]
