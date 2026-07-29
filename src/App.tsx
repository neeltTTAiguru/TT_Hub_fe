import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Layout,
  Menu,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd'
import { getAntdTheme } from './theme'
import HubOverview from './pages/HubOverview'
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import SamGovMonitor from './pages/SamGovMonitor'
import PoliceGrantIntelligenceAgent from './pages/PoliceGrantIntelligenceAgent'
import GrantApplicationAgent from './pages/GrantApplicationAgent'
import RfpResponseCrm from './pages/RfpResponseCrm'
import RfpResponseAgent from './pages/RfpResponseAgent'
import LinkedInSurfer from './pages/LinkedInSurfer'
import TwitterSurfer from './pages/TwitterSurfer'
import TrustedTechAssistant from './pages/TrustedTechAssistant'
import TrustedTechHubSpotAssistant from './pages/TrustedTechHubSpotAssistant'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import Users from './pages/Users'
import { setAccessTokenProvider } from './lib/api'
import './styles/app.css'

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
  { key: '/trusted-tech-assistant', label: <Link to="/trusted-tech-assistant">Trusted Tech Assistant</Link> },
  { key: '/hubspot-assistant', label: <Link to="/hubspot-assistant">Trusted Tech HubSpot Assistant</Link> },
]

function AppShell({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { user, logout } = useAuth0()
  const selectedNavKey = baseNavItems.find((item) =>
    item.key === '/'
      ? location.pathname === '/'
      : location.pathname === item.key || location.pathname.startsWith(`${item.key}/`),
  )?.key

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={220} breakpoint="lg" collapsedWidth={0}>
        <div style={{ padding: 20 }}>
          <div className="brand">
            <div className="brand-mark">T</div>
            <div>
              <div>Trusted Tech Smart Hub</div>
              <div className="brand-subtitle">Trusted Tech</div>
            </div>
          </div>
        </div>
        <Menu
          mode="inline"
          items={baseNavItems}
          selectedKeys={selectedNavKey ? [selectedNavKey] : []}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Text strong>Trusted Tech Smart Hub</Text>
          <div className="theme-toggle">
            {user?.name ? <Text type="secondary">Signed in as {user.name}</Text> : null}
            <span>{isDark ? 'Dark' : 'Light'} mode</span>
            <Switch checked={isDark} onChange={onToggle} />
            <Link to="/settings">
              <Button type="primary">Settings</Button>
            </Link>
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
          <Routes>
            <Route path="/" element={<HubOverview />} />
            <Route path="/trusted-tech-assistant" element={<TrustedTechAssistant />} />
            <Route path="/hubspot-assistant" element={<TrustedTechHubSpotAssistant />} />
            <Route path="/market-research" element={<Dashboard />} />
            <Route path="/sam-gov-monitor" element={<SamGovMonitor />} />
            <Route path="/police-grants" element={<PoliceGrantIntelligenceAgent />} />
            <Route path="/police-grants/:applicationUserId" element={<PoliceGrantIntelligenceAgent />} />
            <Route path="/grant-applications" element={<GrantApplicationAgent />} />
            <Route path="/grant-applications/:applicationUserId" element={<GrantApplicationAgent />} />
            <Route path="/rfp-response-agent" element={<RfpResponseCrm />} />
            <Route path="/rfp-response-agent/:rfpId" element={<RfpResponseAgent />} />
            <Route path="/linkedin-surfer" element={<LinkedInSurfer />} />
            <Route path="/twitter-surfer" element={<TwitterSurfer />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
            Trusted Tech Smart Hub
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
              type="error"
              showIcon
              message="Auth0 callback failed"
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

  useEffect(() => {
    setAccessTokenProvider((forceRefresh = false) =>
      getAccessTokenSilently({
        cacheMode: forceRefresh ? 'off' : undefined,
        authorizationParams: getAuthAuthorizationParams(),
      }),
    )
    setIsTokenProviderReady(true)

    return () => {
      setAccessTokenProvider(null)
      setIsTokenProviderReady(false)
    }
  }, [getAccessTokenSilently])

  if (!isTokenProviderReady) {
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

  return <AppShell isDark={isDark} onToggle={onToggle} />
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
