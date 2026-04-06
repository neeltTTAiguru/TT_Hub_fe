import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import {
  Button,
  Card,
  ConfigProvider,
  Layout,
  Menu,
  Space,
  Switch,
  Typography,
} from 'antd'
import { getAntdTheme } from './theme'
import HubOverview from './pages/HubOverview'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import './styles/app.css'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography

const navItems = [
  { key: '/', label: <Link to="/">Hub Overview</Link> },
  { key: '/market-research', label: <Link to="/market-research">Market Researcher</Link> },
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
            <Route path="/market-research" element={<Dashboard />} />
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
          <Button type="primary" size="large" onClick={() => loginWithRedirect()}>
            Log in
          </Button>
        </Space>
      </Card>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth0()
  const [isDark, setIsDark] = useState(getInitialTheme)

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [isDark])

  const themeConfig = useMemo(() => getAntdTheme(isDark), [isDark])

  if (isLoading) {
    return (
      <ConfigProvider theme={themeConfig}>
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Text>Loading authentication...</Text>
        </div>
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider theme={themeConfig}>
      <BrowserRouter>
        {isAuthenticated ? (
          <AppShell isDark={isDark} onToggle={() => setIsDark(!isDark)} />
        ) : (
          <LoginScreen />
        )}
      </BrowserRouter>
    </ConfigProvider>
  )
}
