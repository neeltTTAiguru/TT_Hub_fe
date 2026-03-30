import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import {
  Button,
  ConfigProvider,
  Layout,
  Menu,
  Switch,
  Typography,
} from 'antd'
import { getAntdTheme } from './theme'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import './styles/app.css'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const navItems = [
  { key: '/', label: <Link to="/">Dashboard</Link> },
  { key: '/settings', label: <Link to="/settings">Settings</Link> },
]

function AppShell({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const location = useLocation()

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={220} breakpoint="lg" collapsedWidth={0}>
        <div style={{ padding: 20 }}>
          <div className="brand">
            <div className="brand-mark">T</div>
            <div>
              <div>Trusted CRM</div>
              <div className="brand-subtitle">Technology Solutions</div>
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
          <Text strong>Customer Relationship Management</Text>
          <div className="theme-toggle">
            <span>{isDark ? 'Dark' : 'Light'} mode</span>
            <Switch checked={isDark} onChange={onToggle} />
            <Button type="primary">New Lead</Button>
          </div>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
        <AppShell isDark={isDark} onToggle={() => setIsDark(!isDark)} />
      </BrowserRouter>
    </ConfigProvider>
  )
}
