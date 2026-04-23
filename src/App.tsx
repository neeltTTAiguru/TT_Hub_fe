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
import RfpResponseAgent from './pages/RfpResponseAgent'
import LinkedInSurfer from './pages/LinkedInSurfer'
import TrustedTechAssistant from './pages/TrustedTechAssistant'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import Users from './pages/Users'
import { setAccessTokenProvider } from './lib/api'
import './styles/app.css'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography

const navItems = [
  { key: '/', label: <Link to="/">Hub Overview</Link> },
  { key: '/trusted-tech-assistant', label: <Link to="/trusted-tech-assistant">Trusted Tech Assistant</Link> },
  { key: '/market-research', label: <Link to="/market-research">Market Researcher</Link> },
  { key: '/sam-gov-monitor', label: <Link to="/sam-gov-monitor">SAM.gov Monitor</Link> },
  { key: '/rfp-response-agent', label: <Link to="/rfp-response-agent">RFP Response Agent</Link> },
  { key: '/linkedin-surfer', label: <Link to="/linkedin-surfer">LinkedIn Surfer</Link> },
  { key: '/reports', label: <Link to="/reports">Reports</Link> },
  { key: '/users', label: <Link to="/users">Users</Link> },
  { key: '/settings', label: <Link to="/settings">Settings</Link> },
]

function AppShell({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const location = useLocation()
  const { user, logout } = useAuth0()

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={220} breakpoint="lg" collapsedWidth={0}>
        <div style={{ padding: 20 }}>
          <div className="brand">
            <div className="brand-mark">T</div>
            <div>
              <div>OpenClaw Hub</div>
              <div className="brand-subtitle">Trusted Tech</div>
            </div>
          </div>
        </div>
        <Menu
          mode="inline"
          items={navItems}
          selectedKeys={[location.pathname]}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Text strong>Trusted Tech Operating Hub</Text>
          <div className="theme-toggle">
            {user?.name ? <Text type="secondary">Signed in as {user.name}</Text> : null}
            <span>{isDark ? 'Dark' : 'Light'} mode</span>
            <Switch checked={isDark} onChange={onToggle} />
            <Button type="primary">New Workflow</Button>
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
            <Route path="/market-research" element={<Dashboard />} />
            <Route path="/sam-gov-monitor" element={<SamGovMonitor />} />
            <Route path="/rfp-response-agent" element={<RfpResponseAgent />} />
            <Route path="/linkedin-surfer" element={<LinkedInSurfer />} />
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
  const authButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
    height: 48,
    padding: '0 20px',
    borderRadius: 16,
    border: '1px solid var(--app-border)',
    background: 'var(--app-primary)',
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  }
  const secondaryAuthButtonStyle: React.CSSProperties = {
    ...authButtonStyle,
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
  }

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
            OpenClaw Hub
          </Title>
          <Text type="secondary">
            Sign in with Auth0 to access Trusted Tech products and protected workflows.
          </Text>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/login" style={authButtonStyle}>
              Log in
            </a>
            <a href="/signup" style={secondaryAuthButtonStyle}>
              Create account
            </a>
          </div>
          <Text type="secondary">
            If this still does not redirect, check that Auth0 allows `http://localhost:5173` in callback, logout, and web origin settings.
          </Text>
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
            ...(mode === 'signup' ? { screen_hint: 'signup' } : {}),
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

function AuthTokenBridge() {
  const { getAccessTokenSilently, isAuthenticated, isLoading } = useAuth0()

  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setAccessTokenProvider(null)
      return
    }

    setAccessTokenProvider(() => getAccessTokenSilently())

    return () => {
      setAccessTokenProvider(null)
    }
  }, [getAccessTokenSilently, isAuthenticated, isLoading])

  return null
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
    return <AppShell isDark={isDark} onToggle={onToggle} />
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
        <AuthTokenBridge />
        <AppRouterGate isDark={isDark} onToggle={() => setIsDark(!isDark)} />
      </BrowserRouter>
    </ConfigProvider>
  )
}
