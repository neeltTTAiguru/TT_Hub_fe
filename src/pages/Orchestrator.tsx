import { useEffect, useState } from 'react'
import { Alert, Button, Card, Space, Typography } from 'antd'
import { startHermesSession } from '../lib/api'

const { Paragraph, Text } = Typography

// The Hermes desktop UI is its own app (React + Tailwind, served by
// `hermes dashboard`), not something the Hub renders. It is embedded whole
// rather than reimplemented: the chat, sessions and terminal it ships are the
// point, and porting them into AntD would fork them.
//
// This MUST stay a same-origin path, never the dashboard's own origin. Framed
// cross-origin the Hermes SPA renders and then ignores every click -- its UI
// library walks parent windows to position popovers, and that throws
// SecurityError across an origin boundary, which leaves a page that looks alive
// and is not. In production the Hub's host routes these paths to the backend,
// which proxies the dashboard; in dev the Vite proxy does the same.
const HERMES_PATH = import.meta.env.VITE_HERMES_WEB_PATH || '/chat'

// The escape hatch opens the SAME proxied path in a top-level tab, rather than
// the dashboard's own address. In production the dashboard sits on a VPC-private
// address no browser can reach, so there is no direct URL to offer -- and a
// build-time default pointing at localhost sent the link to the reader's own
// machine. The proxied path is the one route that works from both dev and prod,
// and a real top-level window is where Hermes is happiest anyway.

// Set by the backend proxy on every response it pipes back from the dashboard.
// See the pre-flight check below for why the body cannot be trusted for this.
const PROXY_MARKER_HEADER = 'x-hermes-dashboard'

type State =
  | { status: 'checking' }
  | { status: 'up' }
  | { status: 'signin' }
  | { status: 'down'; reason: string }
  | { status: 'forbidden'; reason: string }

export default function Orchestrator() {
  const [state, setState] = useState<State>({ status: 'checking' })
  // Doubles as the iframe key, so Retry both re-runs the handshake and remounts
  // the frame -- re-rendering the same src alone would not reload it.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // 1. Mint the session cookie. The iframe cannot present a bearer token, so
      //    this is the only point where the Auth0 token is exchanged for
      //    something the frame's own requests can carry.
      const session = await startHermesSession()
      if (cancelled) return
      if (session.status === 'forbidden') {
        setState({ status: 'forbidden', reason: session.message })
        return
      }
      if (session.status === 'unavailable') {
        setState({ status: 'down', reason: session.message })
        return
      }

      // 2. Confirm what answers is actually Hermes. `response.ok` is not enough:
      //    a static host that serves index.html as its error document answers
      //    200 with the HUB's page, and framing that nests the Hub inside
      //    itself -- an empty white box, since the Hub has no route there.
      //
      //    This has to be judged on the marker header rather than the body. The
      //    body test this replaced looked for "Hermes Agent", which the Hub's
      //    own production index.html contains: the build inlines the bundle, and
      //    the bundle contains the source of the test. The check passed on the
      //    exact page it existed to reject.
      try {
        const response = await fetch(HERMES_PATH, { cache: 'no-store', credentials: 'include' })
        if (cancelled) return

        if (response.headers.get(PROXY_MARKER_HEADER) !== '1') {
          setState({
            status: 'down',
            reason:
              response.status === 401
                ? `${HERMES_PATH} rejected the Hub's dashboard session.`
                : `${HERMES_PATH} answered ${response.status}, but not through the Hermes proxy — it is not routed to the backend here.`,
          })
          return
        }

        // Hermes answered, but with its own sign-in rather than the dashboard.
        // Bound to a non-loopback address it runs its own OAuth gate, which is
        // separate from the Hub's allowlist -- passing one does not pass the
        // other. Same-origin, so the redirect Hermes followed is readable.
        const landed = new URL(response.url, window.location.origin).pathname
        if (!response.ok || landed.startsWith('/login') || landed.startsWith('/auth')) {
          setState({ status: 'signin' })
          return
        }

        setState({ status: 'up' })
      } catch {
        if (!cancelled) setState({ status: 'down', reason: `${HERMES_PATH} could not be reached.` })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = () => {
    setState({ status: 'checking' })
    setAttempt((value) => value + 1)
  }

  // Deliberately not framed. Hermes' OAuth gate hands off to an identity
  // provider, and providers refuse to be framed -- attempting the round trip in
  // the Orchestrator produces a blank frame with no error, so the sign-in is
  // sent to a top-level tab instead. The dashboard carries a `next=` back to
  // HERMES_PATH, and its cookie is set on the Hub's origin, so returning here
  // and hitting Retry picks the session up.
  if (state.status === 'signin') {
    return (
      <Card className="section-card" title="Orchestrator">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Sign in to the Hermes dashboard."
            description="The Hub has approved you, but the dashboard runs its own sign-in and has not seen you yet. These are two separate gates."
          />
          <Space>
            <Button type="primary" href={HERMES_PATH} target="_blank" rel="noreferrer">
              Sign in to Hermes ↗
            </Button>
            <Button onClick={retry}>I have signed in — retry</Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            It opens in a new tab on purpose: the identity provider refuses to render inside a
            frame, so the round trip cannot be completed here.
          </Text>
        </Space>
      </Card>
    )
  }

  if (state.status === 'down' || state.status === 'forbidden') {
    const refused = state.status === 'forbidden'
    return (
      <Card className="section-card" title="Orchestrator">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type={refused ? 'error' : 'warning'}
            showIcon
            message={refused ? 'You do not have access to the Hermes dashboard.' : 'The Hermes desktop UI is not reachable.'}
            description={state.reason}
          />
          {refused ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Access is granted per address in <Text code>HERMES_DASHBOARD_ALLOWED_EMAILS</Text> on
              the backend. It is deliberately empty by default — the dashboard is a terminal on the
              droplet, so it is granted explicitly rather than to everyone who can sign in.
            </Text>
          ) : (
            <>
              <Paragraph style={{ marginBottom: 0 }}>If you are running it locally, start it and retry:</Paragraph>
              <Text code copyable style={{ display: 'block', padding: '8px 12px' }}>
                hermes dashboard --port 9119 --host 127.0.0.1 --no-open
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                In production the Hub's host routes <Text code>{HERMES_PATH}</Text> to the backend,
                which proxies <Text code>HERMES_DASHBOARD_URL</Text>. It has to be reached through
                the Hub's own origin — a cross-origin embed renders but does not respond to input.
              </Text>
            </>
          )}
          <Button type="primary" onClick={retry}>
            Retry
          </Button>
        </Space>
      </Card>
    )
  }

  return (
    <div className="orchestrator-frame-wrap">
      <div className="orchestrator-frame-bar">
        <Text type="secondary" style={{ fontSize: 12 }}>
          Hermes · {HERMES_PATH}
        </Text>
        <Space size={4}>
          <Button size="small" type="text" onClick={retry}>
            Reload
          </Button>
          <Button size="small" type="text" href={HERMES_PATH} target="_blank" rel="noreferrer">
            Open in new tab ↗
          </Button>
        </Space>
      </div>
      {/* Deliberately NOT sandboxed. This is the operator's own Hermes, and it
          drives a terminal, websockets and same-origin storage; a sandbox
          permissive enough to allow all of that adds no security, while any gap
          in it produces a frame that draws but cannot be used. */}
      <iframe
        key={attempt}
        className="orchestrator-frame"
        src={HERMES_PATH}
        title="Hermes Orchestrator"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  )
}
