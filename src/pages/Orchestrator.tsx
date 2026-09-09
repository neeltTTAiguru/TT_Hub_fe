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

type State =
  | { status: 'checking' }
  | { status: 'up' }
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

      // 2. Confirm what answers is actually Hermes. `response.ok` alone is not
      //    enough: a static host that serves index.html as its error document
      //    answers 200 with the HUB's page, and framing that would nest the Hub
      //    inside itself.
      try {
        const response = await fetch(HERMES_PATH, { cache: 'no-store', credentials: 'include' })
        const isHermes = response.ok && /Hermes Agent/i.test(await response.text())
        if (!cancelled) {
          setState(
            isHermes
              ? { status: 'up' }
              : { status: 'down', reason: `${HERMES_PATH} did not return the Hermes dashboard.` },
          )
        }
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
