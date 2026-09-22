import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Layout,
  Menu,
  message,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd'
import { getAntdTheme } from './theme'
import GmailPage from './pages/GmailPage'
import { GmailGlyph } from './components/GmailPanel'
import CalendarPage from './pages/CalendarPage'
import { CalendarGlyph } from './components/CalendarPanel'
import { FullAccessProvider, MemberViewProvider, ViewAsProvider, useViewAs, type ViewAs } from './lib/access'
import Orchestrator from './pages/Orchestrator'
import TrustedTechAssistant from './pages/TrustedTechAssistant'
import CompetitorAnalyst from './pages/CompetitorAnalyst'
import TrustedTechHubSpotAssistant from './pages/TrustedTechHubSpotAssistant'
import TrustedTechYouTrackAssistant from './pages/TrustedTechYouTrackAssistant'
import EmailCampaignBuilder from './pages/EmailCampaignBuilder'
import TrustedTechAhrefsAssistant from './pages/TrustedTechAhrefsAssistant'
import CompanyFiles from './pages/CompanyFiles'
import ProductImages from './pages/ProductImages'
import AgencyMap from './pages/AgencyMap'
import ContentOperations from './pages/ContentOperations'
import ContentOperationsPublish from './pages/ContentOperationsPublish'
import ContentOperationsSeo from './pages/ContentOperationsSeo'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import { getMyAccess, previewHubMember, setAccessTokenProvider, setViewAsEmail, type MemberView } from './lib/api'
import trustedTechnologyPrimaryLogo from './assets/trusted-technology-primary-logo.png'
import orchestratorLogo from './assets/agent-logos/hermes.png'
import brainLogo from './assets/agent-logos/brain.svg'
import hubspotLogo from './assets/agent-logos/hubspot.svg'
import youtrackLogo from './assets/agent-logos/youtrack.svg'
import brevoLogo from './assets/agent-logos/brevo.svg'
import competitorAnalystLogo from './assets/agent-logos/competitor-analyst.svg'
import contentGeneratorLogo from './assets/agent-logos/content-generator.svg'
import agencyMapLogo from './assets/agent-logos/agency-map.svg'
import './styles/app.css'

const orchestratorIcon = (
  <img src={orchestratorLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const brainIcon = (
  <img src={brainLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const hubspotIcon = (
  <img src={hubspotLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const youtrackIcon = (
  <img src={youtrackLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const brevoIcon = (
  <img src={brevoLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const competitorAnalystIcon = (
  <img src={competitorAnalystLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const contentGeneratorIcon = (
  <img src={contentGeneratorLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const agencyMapIcon = (
  <img src={agencyMapLogo} alt="" aria-hidden="true" className="agent-icon" />
)

const gmailIcon = (
  <span className="agent-icon" style={{ color: '#c5221f' }}>
    <GmailGlyph size={18} />
  </span>
)

const calendarIcon = (
  <span className="agent-icon" style={{ color: '#1a73e8' }}>
    <CalendarGlyph size={18} />
  </span>
)




const { Header, Sider, Content } = Layout
const { Text, Title } = Typography
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE
function getAuthAuthorizationParams(extra?: Record<string, string>) {
  return {
    ...(auth0Audience ? { audience: auth0Audience } : {}),
    scope: 'openid profile email',
    ...extra,
  }
}

const baseNavItems = [
  {
    key: '/orchestrator',
    title: 'Hermes Operations',
    icon: orchestratorIcon,
    label: <Link to="/orchestrator">Hermes Operations</Link>,
  },
  {
    key: 'brain',
    title: 'Brain',
    icon: brainIcon,
    label: 'Brain',
    children: [
      {
        key: '/trusted-tech-assistant',
        label: <Link to="/trusted-tech-assistant">Talk to Brain</Link>,
      },
      {
        key: '/company-files',
        label: <Link to="/company-files">Company Files</Link>,
      },
      {
        key: '/product-images',
        label: <Link to="/product-images">Product Images</Link>,
      },
    ],
  },
  {
    key: '/competitor-analyst',
    title: 'Competitor Analyst',
    icon: competitorAnalystIcon,
    label: <Link to="/competitor-analyst">Competitor Analyst</Link>,
  },
  {
    key: '/hubspot-assistant',
    title: 'Hubspot',
    icon: hubspotIcon,
    label: <Link to="/hubspot-assistant">Hubspot</Link>,
  },
  {
    key: '/youtrack-assistant',
    title: 'YouTrack',
    icon: youtrackIcon,
    label: <Link to="/youtrack-assistant">YouTrack</Link>,
  },
  {
    key: '/email-builder',
    title: 'Brevo',
    icon: brevoIcon,
    label: <Link to="/email-builder">Brevo</Link>,
  },
  {
    key: '/assistants/content-operations',
    title: 'Content Generator',
    icon: contentGeneratorIcon,
    label: <Link to="/assistants/content-operations">Content Generator</Link>,
  },
  {
    key: '/gmail',
    title: 'Gmail',
    icon: gmailIcon,
    label: <Link to="/gmail">Gmail</Link>,
  },
  {
    key: '/calendar',
    title: 'Calendar',
    icon: calendarIcon,
    label: <Link to="/calendar">Calendar</Link>,
  },
  {
    key: '/agency-map',
    title: 'Agency Map',
    icon: agencyMapIcon,
    label: <Link to="/agency-map">Agency Map</Link>,
  },
]


/**
 * What an account that is not on the backend's full-access list keeps.
 *
 * The real gate is requireFeatureAccess on the API - hiding a link stops
 * nobody, and the pages behind these routes would 403 anyway. This is here so a
 * restricted account sees a hub that works rather than a sidebar of dead ends.
 *
 * Keys, not paths: they are matched against the nav items, and the Brain group
 * is a parent key with children, so leaving it out removes the whole section.
 */
const RESTRICTED_NAV_KEYS = ['/gmail', '/calendar', '/agency-map']

// Kept out of the sidebar without being deleted. The page, its route and its
// saved chats all still work — /competitor-analyst reaches it directly — so
// putting it back is removing a key from this list.
const HIDDEN_NAV_KEYS = ['/competitor-analyst']

const NAV_ORDER_STORAGE_KEY = 'smarthub.navOrder'

/**
 * Sidebar order is a personal preference, so it lives in this browser rather
 * than on the account. Reads are guarded because storage throws outright in
 * some contexts (private windows, blocked site data).
 */
function loadNavOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : []
  } catch {
    return []
  }
}

function saveNavOrder(order: string[]) {
  try {
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(order))
  } catch {
    // Storage unavailable; the order simply will not persist.
  }
}

/**
 * Applies a saved order to the nav.
 *
 * Anything not in the saved order is spliced in beside the neighbours it
 * shipped with, so a nav item added in a later release lands where it was meant
 * to for someone who reordered their sidebar months ago. Appending instead put
 * every new item at the bottom, which silently discards the placement the item
 * was added for -- Hermes Operations ships above Brain, not below Agency Map.
 */
function applyNavOrder<T extends { key: string }>(items: T[], order: string[]): T[] {
  const byKey = new Map(items.map((item) => [item.key, item]))
  const result = order.map((key) => byKey.get(key)).filter((item): item is T => Boolean(item))
  const placed = new Set(result.map((item) => item.key))

  items.forEach((item, naturalIndex) => {
    if (placed.has(item.key)) return
    // The nearest earlier natural neighbour that already has a spot decides
    // where this one goes. With no such neighbour the item is naturally first,
    // so it goes to the top.
    let at = 0
    for (let i = naturalIndex - 1; i >= 0; i -= 1) {
      const anchor = result.findIndex((entry) => entry.key === items[i].key)
      if (anchor >= 0) {
        at = anchor + 1
        break
      }
    }
    result.splice(at, 0, item)
    placed.add(item.key)
  })

  return result
}

function AppShell({
  isDark,
  onToggle,
  fullAccess,
}: {
  isDark: boolean
  onToggle: () => void
  fullAccess: boolean
}) {
  const location = useLocation()
  const { user, logout } = useAuth0()
  const viewAs = useViewAs()
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [navOrder, setNavOrder] = useState<string[]>(() => loadNavOrder())
  const [reordering, setReordering] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null)

  const visibleNavItems = baseNavItems.filter(
    (item) =>
      !HIDDEN_NAV_KEYS.includes(item.key) && (fullAccess || RESTRICTED_NAV_KEYS.includes(item.key)),
  )
  const navItems = applyNavOrder(visibleNavItems, navOrder)

  /** Reorders `from` to sit before or after `to`, then persists the result. */
  const moveNavItem = (from: string, to: string, after: boolean) => {
    if (!from || from === to) return
    const keys = navItems.map((item) => item.key)
    const fromIndex = keys.indexOf(from)
    if (fromIndex < 0) return
    keys.splice(fromIndex, 1)
    const targetIndex = keys.indexOf(to)
    if (targetIndex < 0) return
    keys.splice(after ? targetIndex + 1 : targetIndex, 0, from)
    setNavOrder(keys)
    saveNavOrder(keys)
  }

  /** Keyboard/click fallback: HTML5 drag is easy to break, arrows are not. */
  const nudgeNavItem = (key: string, delta: number) => {
    const keys = navItems.map((item) => item.key)
    const index = keys.indexOf(key)
    const next = index + delta
    if (index < 0 || next < 0 || next >= keys.length) return
    ;[keys[index], keys[next]] = [keys[next], keys[index]]
    setNavOrder(keys)
    saveNavOrder(keys)
  }

  const endDrag = () => {
    setDragKey(null)
    setDropTarget(null)
  }

  // Brain is a submenu now, so its children have to be considered too or a
  // route under it never highlights.
  const navKeys: string[] = navItems.flatMap((item) => {
    const children = (item as { children?: Array<{ key: string }> }).children
    return Array.isArray(children) ? children.map((child) => child.key) : [item.key]
  })
  // Longest match wins. The article tools are nested under one another
  // (/assistants/content-operations and /assistants/content-operations/seo), so
  // a first-match search highlights Write while you are standing on Surfer SEO.
  const selectedNavKey = navKeys
    .filter((key) => location.pathname === key || location.pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0]
  // Landing on one of the article tools with its section shut means the other
  // three are invisible until you think to open it. The section holding the
  // current page starts open.
  const openNavKey = navItems.find((item) => {
    const children = (item as { children?: Array<{ key: string }> }).children
    return Array.isArray(children) && children.some((child) => child.key === selectedNavKey)
  })?.key

  return (
    <Layout className="app-shell">
      <Sider
        className="app-sider"
        width={220}
        breakpoint="lg"
        collapsedWidth={0}
        collapsed={navCollapsed}
        // Controlled so the header's toggle and the breakpoint drive the same
        // state. Left uncontrolled, the sider collapses to zero width below lg
        // with no trigger, and the agent list becomes unreachable.
        onBreakpoint={setNavCollapsed}
        trigger={null}
      >
        <div style={{ padding: 20 }}>
          <div className="brand">
            <img
              className="brand-logo"
              src={trustedTechnologyPrimaryLogo}
              alt="Trusted Technology Solutions"
            />
            <div className="brand-subtitle">Trusted Tech Central</div>
          </div>
        </div>
        {reordering ? (
          // Drag lives outside AntD's Menu on purpose: rc-menu preventDefaults
          // mousedown to manage focus, which cancels dragstart, so handlers
          // attached inside a menu item never fire.
          <div className="app-nav-reorder" role="list">
            {navItems.map((item) => {
              const isDragging = dragKey === item.key
              const isTarget = dropTarget?.key === item.key
              return (
                <div
                  key={item.key}
                  role="listitem"
                  className={[
                    'app-nav-row',
                    'app-nav-reorder-item',
                    'is-reordering',
                    isDragging ? 'is-dragging' : '',
                    isTarget && !dropTarget?.after ? 'drop-before' : '',
                    isTarget && dropTarget?.after ? 'drop-after' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable
                  onDragStart={(event) => {
                    setDragKey(item.key)
                    event.dataTransfer.effectAllowed = 'move'
                    // Firefox refuses to start a drag with no data set.
                    event.dataTransfer.setData('text/plain', item.key)
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (!dragKey || dragKey === item.key) return
                    const box = event.currentTarget.getBoundingClientRect()
                    const after = event.clientY > box.top + box.height / 2
                    setDropTarget((current) =>
                      current?.key === item.key && current.after === after
                        ? current
                        : { key: item.key, after },
                    )
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node)) return
                    setDropTarget((current) => (current?.key === item.key ? null : current))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const source = dragKey || event.dataTransfer.getData('text/plain')
                    if (source) {
                      const box = event.currentTarget.getBoundingClientRect()
                      moveNavItem(source, item.key, event.clientY > box.top + box.height / 2)
                    }
                    endDrag()
                  }}
                >
                  <span className="app-nav-grip" aria-hidden="true">
                    <svg width="8" height="14" viewBox="0 0 8 14">
                      <circle cx="2" cy="3" r="1.1" fill="currentColor" />
                      <circle cx="6" cy="3" r="1.1" fill="currentColor" />
                      <circle cx="2" cy="7" r="1.1" fill="currentColor" />
                      <circle cx="6" cy="7" r="1.1" fill="currentColor" />
                      <circle cx="2" cy="11" r="1.1" fill="currentColor" />
                      <circle cx="6" cy="11" r="1.1" fill="currentColor" />
                    </svg>
                  </span>
                  {item.icon}
                  <span className="app-nav-label">{item.title}</span>
                  <span className="app-nav-nudge">
                    <button
                      type="button"
                      aria-label={`Move ${item.title} up`}
                      disabled={navItems[0]?.key === item.key}
                      onClick={() => nudgeNavItem(item.key, -1)}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2 6.5 L5 3.5 L8 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${item.title} down`}
                      disabled={navItems[navItems.length - 1]?.key === item.key}
                      onClick={() => nudgeNavItem(item.key, 1)}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <Menu
            mode="inline"
            items={navItems}
            selectedKeys={selectedNavKey ? [selectedNavKey] : []}
            defaultOpenKeys={openNavKey ? [openNavKey] : undefined}
          />
        )}

        <div className="app-nav-tools">
          <button
            type="button"
            className={`app-nav-tool${reordering ? ' is-active' : ''}`}
            onClick={() => {
              setReordering((on) => !on)
              endDrag()
            }}
          >
            {reordering ? 'Done' : 'Reorder'}
          </button>
          {reordering && navOrder.length ? (
            <button
              type="button"
              className="app-nav-tool"
              onClick={() => {
                setNavOrder([])
                saveNavOrder([])
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </Sider>

      <Layout>
        <Header className="app-header">
          <span className="app-header-brand">
            <button
              type="button"
              className="app-nav-toggle"
              aria-label={navCollapsed ? 'Show agents' : 'Hide agents'}
              aria-expanded={!navCollapsed}
              onClick={() => setNavCollapsed((current) => !current)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <Text strong>Trusted Tech Central</Text>
          </span>
          <div className="theme-toggle">
            {user?.name ? <Text type="secondary">Signed in as {user.name}</Text> : null}
            <span>{isDark ? 'Dark' : 'Light'} mode</span>
            <Switch checked={isDark} onChange={onToggle} />
            {fullAccess ? (
              <Link to="/settings">
                <Button type="primary">Settings</Button>
              </Link>
            ) : null}
            <Button
              onClick={() =>
                logout({
                  logoutParams: {
                    returnTo: window.location.origin,
                  },
                })
              }
            >
              Log out
            </Button>
          </div>
        </Header>
        <Content className="app-content">
          {fullAccess ? (
            <Routes>
              <Route path="/" element={<Navigate to="/trusted-tech-assistant" replace />} />
              <Route path="/orchestrator" element={<Orchestrator />} />
              <Route path="/trusted-tech-assistant" element={<TrustedTechAssistant />} />
              <Route path="/competitor-analyst" element={<CompetitorAnalyst />} />
              <Route path="/hubspot-assistant" element={<TrustedTechHubSpotAssistant />} />
              <Route path="/youtrack-assistant" element={<TrustedTechYouTrackAssistant />} />
              <Route path="/email-builder" element={<EmailCampaignBuilder />} />
              <Route path="/ahrefs-assistant" element={<TrustedTechAhrefsAssistant />} />
              <Route path="/company-files" element={<CompanyFiles />} />
              <Route path="/product-images" element={<ProductImages />} />
              <Route path="/agency-map" element={<AgencyMap key={viewAs.member?.email ?? 'me'} />} />
              <Route path="/gmail" element={<GmailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/assistants/content-operations" element={<ContentOperations />} />
              <Route path="/assistants/content-operations/seo" element={<ContentOperationsSeo />} />
              <Route path="/assistants/content-operations/publish" element={<ContentOperationsPublish />} />
              <Route path="/assistants/content-operations/blog/*" element={<Navigate to="/assistants/content-operations" replace />} />
              <Route path="/assistants/wordpress-draft-test" element={<Navigate to="/assistants/content-operations" replace />} />
              <Route path="/assistants/wordpress-draft-editor" element={<Navigate to="/assistants/content-operations" replace />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          ) : (
            // Anything else redirects rather than 404s: a restricted account can
            // arrive on a bookmark or a shared link to a page it no longer has,
            // and landing on the map is a better answer than "not found".
            <Routes>
              <Route path="/agency-map" element={<AgencyMap />} />
              <Route path="/gmail" element={<GmailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="*" element={<Navigate to="/agency-map" replace />} />
            </Routes>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}

function getInitialTheme(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem('theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function LoginScreen() {
  const { loginWithRedirect } = useAuth0()
  const [authError, setAuthError] = useState('')

  const startAuth = async (mode: 'login' | 'signup') => {
    try {
      setAuthError('')
      await loginWithRedirect({
        appState: {
          returnTo: '/',
        },
        authorizationParams: {
          ...getAuthAuthorizationParams(mode === 'signup' ? { screen_hint: 'signup' } : undefined),
        },
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Auth0 login failed to start.')
    }
  }

  const authButtonStyle: React.CSSProperties = {
    minWidth: 184,
    height: 62,
    padding: '0 30px',
    borderRadius: 16,
    border: '1px solid var(--app-border)',
    background: 'var(--app-primary)',
    color: '#fff',
    fontSize: 22,
    fontWeight: 600,
    textDecoration: 'none',
  }
  const secondaryAuthButtonStyle: React.CSSProperties = {
    ...authButtonStyle,
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
  }

  return (
    <div className="auth-screen">
      <Card className="auth-card">
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Title level={1} className="auth-title">
            Trusted Tech Central
          </Title>
          <Text type="secondary" className="auth-copy">
            Sign in with Auth0 to access Trusted Tech products and protected workflows.
          </Text>
          <div className="auth-actions">
            <Button
              type="primary"
              size="large"
              style={authButtonStyle}
              onClick={() => void startAuth('login')}
            >
              Log in
            </Button>
            <Button
              size="large"
              style={secondaryAuthButtonStyle}
              onClick={() => void startAuth('signup')}
            >
              Create account
            </Button>
          </div>
          {authError ? (
            <Alert type="error" showIcon message="Auth0 redirect failed" description={authError} />
          ) : null}
        </Space>
      </Card>
    </div>
  )
}

function LoginLauncher({ mode }: { mode: 'login' | 'signup' }) {
  const { loginWithRedirect } = useAuth0()
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let isMounted = true

    const start = async () => {
      try {
        await loginWithRedirect({
          appState: {
            returnTo: '/',
          },
          authorizationParams: {
            ...getAuthAuthorizationParams(mode === 'signup' ? { screen_hint: 'signup' } : undefined),
          },
        })
      } catch (error) {
        if (isMounted) {
          setAuthError(error instanceof Error ? error.message : 'Auth0 login failed to start.')
        }
      }
    }

    void start()

    return () => {
      isMounted = false
    }
  }, [loginWithRedirect, mode])

  return (
    <div className="auth-screen">
      <Card className="auth-card">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={2} style={{ margin: 0 }}>
            {mode === 'signup' ? 'Creating your account' : 'Redirecting to login'}
          </Title>
          {authError ? (
            <>
              <Alert type="error" showIcon message="Auth0 redirect failed" description={authError} />
              <a href="/" style={{ color: 'var(--app-primary-strong)' }}>
                Back to login page
              </a>
            </>
          ) : (
            <>
              <Spin size="large" />
              <Text type="secondary">
                Sending you to Auth0 now...
              </Text>
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}

function CallbackScreen() {
  const { error, isAuthenticated, isLoading } = useAuth0()

  // A domain rule turning someone away is not a malfunction, and "Auth0
  // callback failed" reads like one - sending a contractor to look for a broken
  // deploy when the answer is that they used a personal address. Auth0 hands
  // back the action's own message here, so show that instead of framing it.
  const denied = (error as { error?: string } | undefined)?.error === 'access_denied'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: 'min(100%, 480px)' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={2} style={{ margin: 0 }}>
            Completing sign in
          </Title>
          {error ? (
            <Alert
              type={denied ? 'warning' : 'error'}
              showIcon
              message={denied ? 'You do not have access' : 'Auth0 callback failed'}
              description={error.message}
            />
          ) : isAuthenticated ? (
            <Text type="secondary">Login complete. Loading the app...</Text>
          ) : (
            <>
              <Spin size="large" />
              <Text type="secondary">
                {isLoading ? 'Finishing the Auth0 callback...' : 'Waiting for Auth0 session...'}
              </Text>
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}

function AuthenticatedApp({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const { getAccessTokenSilently } = useAuth0()
  const [isTokenProviderReady, setIsTokenProviderReady] = useState(false)
  // null while unanswered. Starting at `false` would flash the restricted hub
  // at everyone on every load; starting at `true` would flash the full one at
  // people who are not allowed it, which is the worse of the two.
  const [fullAccess, setFullAccess] = useState<boolean | null>(null)
  const [memberView, setMemberView] = useState<MemberView | null>(null)
  // The map's Views menu: a full-access account looking through one member's
  // rules. Their view and the header that scopes the feeds are switched
  // together, once their rules have arrived, so the map never remounts on a
  // half-applied view.
  const [viewAs, setViewAs] = useState<{ member: ViewAs['member']; view: MemberView } | null>(null)
  const [viewAsPending, setViewAsPending] = useState(false)
  const viewAsRequest = useRef(0)

  const selectViewAs = useCallback((email: string | null) => {
    const ticket = ++viewAsRequest.current
    if (!email) {
      setViewAsEmail(null)
      setViewAs(null)
      setViewAsPending(false)
      return
    }
    setViewAsPending(true)
    previewHubMember(email)
      .then((preview) => {
        if (ticket !== viewAsRequest.current) return
        setViewAsEmail(email)
        setViewAs({ member: { email, name: '' }, view: preview.view })
      })
      .catch((error) => {
        if (ticket !== viewAsRequest.current) return
        message.error(error instanceof Error ? error.message : 'Could not load that view.')
      })
      .finally(() => {
        if (ticket === viewAsRequest.current) setViewAsPending(false)
      })
  }, [])

  const viewAsValue = useMemo<ViewAs>(
    () => ({ member: viewAs?.member ?? null, pending: viewAsPending, select: selectViewAs }),
    [viewAs, viewAsPending, selectViewAs],
  )

  useEffect(() => {
    setAccessTokenProvider((forceRefresh = false) =>
      getAccessTokenSilently({
        cacheMode: forceRefresh ? 'off' : undefined,
        authorizationParams: getAuthAuthorizationParams(),
      }),
    )
    // The API client must not render until its Auth0 token provider is installed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTokenProviderReady(true)

    return () => {
      setAccessTokenProvider(null)
      setViewAsEmail(null)
      setIsTokenProviderReady(false)
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!isTokenProviderReady) return
    let cancelled = false

    getMyAccess()
      .then((access) => {
        if (cancelled) return
        setFullAccess(Boolean(access.fullAccess))
        setMemberView(access.member ?? null)
      })
      .catch(() => {
        // Fails closed. If the server will not say, the map and Gmail are what
        // this session gets - and those two pages fetch their own data, so a
        // blip here shows a working hub rather than an empty one.
        if (!cancelled) setFullAccess(false)
      })

    return () => {
      cancelled = true
    }
  }, [isTokenProviderReady])

  if (!isTokenProviderReady || fullAccess === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Text>Preparing secure API access...</Text>
      </div>
    )
  }

  return (
    <FullAccessProvider value={fullAccess}>
      <MemberViewProvider value={fullAccess && viewAs ? viewAs.view : memberView}>
        <ViewAsProvider value={viewAsValue}>
          <AppShell isDark={isDark} onToggle={onToggle} fullAccess={fullAccess} />
        </ViewAsProvider>
      </MemberViewProvider>
    </FullAccessProvider>
  )
}

/**
 * Auth0 turned this person away, and said why.
 *
 * A denial comes back to the redirect_uri - which is the site root, not
 * /callback - carrying ?error=access_denied. Without this the app fell through
 * to the login card, and clicking "Log in" bounced straight off the same rule
 * with the same silent result: an unreadable loop that looks like a hang.
 *
 * The way out has to clear the Auth0 session, not just the local one. While
 * that session stands, every retry is answered by the same account and denied
 * the same way - which is the loop itself.
 */
function AuthDeniedScreen({ description }: { description: string }) {
  const { logout } = useAuth0()

  return (
    <div className="auth-screen">
      <Card className="auth-card">
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Title level={1} className="auth-title">
            You do not have access
          </Title>
          <Alert
            type="warning"
            showIcon
            message="Auth0 refused this sign in"
            description={description || 'No reason was given.'}
          />
          <Text type="secondary" className="auth-copy">
            If this is your work account, ask an administrator to check it. Otherwise sign out and
            try a different one.
          </Text>
          <div className="auth-actions">
            <Button
              type="primary"
              size="large"
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
            >
              Sign out and try another account
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  )
}

function AppRouterGate({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth0()

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Text>Loading authentication...</Text>
      </div>
    )
  }

  if (isAuthenticated) {
    return <AuthenticatedApp isDark={isDark} onToggle={onToggle} />
  }

  // Before any path check: Auth0 sends a refusal to the redirect_uri, which is
  // the site root. Routing on pathname alone put this on the login card, where
  // the only offered action was the one that had just failed.
  const authFailure = new URLSearchParams(location.search).get('error')
  if (authFailure) {
    return (
      <AuthDeniedScreen
        description={new URLSearchParams(location.search).get('error_description') || ''}
      />
    )
  }

  if (location.pathname === '/login') {
    return <LoginLauncher mode="login" />
  }

  if (location.pathname === '/signup') {
    return <LoginLauncher mode="signup" />
  }

  if (location.pathname === '/callback') {
    return <CallbackScreen />
  }

  return <LoginScreen />
}

export default function App() {
  const [isDark, setIsDark] = useState(getInitialTheme)

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [isDark])

  const themeConfig = useMemo(() => getAntdTheme(isDark), [isDark])

  return (
    <ConfigProvider theme={themeConfig}>
      <BrowserRouter>
        <AppRouterGate isDark={isDark} onToggle={() => setIsDark(!isDark)} />
      </BrowserRouter>
    </ConfigProvider>
  )
}
