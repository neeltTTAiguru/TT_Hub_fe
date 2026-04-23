import { useMemo, useState } from 'react'
import { Alert, Button, Card, Input, List, Space, Tag, Typography } from 'antd'
import ChatMessageContent from '../components/ChatMessageContent'
import {
  captureLinkedInPosts,
  getLinkedInScreenshot,
  openLinkedInSession,
  type LinkedInPostCaptureResponse,
} from '../lib/api'

const { Text, Link, Title } = Typography

const defaultPageUrl = 'https://www.linkedin.com/company/axon/posts/'

export default function LinkedInSurfer() {
  const [pageUrl, setPageUrl] = useState(defaultPageUrl)
  const [keyword, setKeyword] = useState('body camera')
  const [isOpeningSession, setIsOpeningSession] = useState(false)
  const [isFetchingPosts, setIsFetchingPosts] = useState(false)
  const [error, setError] = useState('')
  const [screenshotError, setScreenshotError] = useState('')
  const [runEvents, setRunEvents] = useState<string[]>([
    'Open a LinkedIn session in the OpenClaw browser, sign in there, then fetch posts from a specific page.',
  ])
  const [result, setResult] = useState<LinkedInPostCaptureResponse | null>(null)
  const [openedPage, setOpenedPage] = useState<{ title: string; url: string; readyState: string } | null>(null)
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('')
  const [isRefreshingScreenshot, setIsRefreshingScreenshot] = useState(false)

  const postCountLabel = useMemo(() => {
    if (!result) return 'No posts captured yet'
    return `${result.posts.length} post${result.posts.length === 1 ? '' : 's'} captured`
  }, [result])

  const pushEvent = (message: string) => {
    setRunEvents((current) => [message, ...current].slice(0, 8))
  }

  const refreshScreenshot = async (message?: string) => {
    setIsRefreshingScreenshot(true)
    setScreenshotError('')

    try {
      const screenshot = await getLinkedInScreenshot()
      setScreenshotDataUrl(screenshot.dataUrl)
      if (message) {
        pushEvent(message)
      }
    } catch (screenshotError) {
      const text =
        screenshotError instanceof Error ? screenshotError.message : 'Failed to capture browser screenshot.'
      setScreenshotError(text)
      pushEvent(`Screenshot failed: ${text}`)
    } finally {
      setIsRefreshingScreenshot(false)
    }
  }

  const handleOpenSession = async () => {
    setIsOpeningSession(true)
    setError('')
    pushEvent('Opening LinkedIn in the OpenClaw browser for login...')

    try {
      const response = await openLinkedInSession({
        url: 'https://www.linkedin.com/feed/',
      })
      setOpenedPage(response.page)
      pushEvent(`LinkedIn opened in browser: ${response.page.url || 'feed'}`)
      pushEvent('Log in in the OpenClaw browser window, then come back here and fetch posts.')
      await refreshScreenshot('Captured current browser view.')
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : 'Failed to open LinkedIn session.'
      setError(message)
      pushEvent(`LinkedIn session failed: ${message}`)
    } finally {
      setIsOpeningSession(false)
    }
  }

  const handleFetchPosts = async () => {
    if (!pageUrl.trim() || !keyword.trim() || isFetchingPosts) {
      return
    }

    setIsFetchingPosts(true)
    setError('')
    setResult(null)
    pushEvent(`Opening ${pageUrl.trim()} in the OpenClaw browser...`)
    pushEvent(`Scanning visible posts for "${keyword.trim()}"...`)

    try {
      const response = await captureLinkedInPosts({
        url: pageUrl.trim(),
        keyword: keyword.trim(),
      })
      setResult(response)
      pushEvent(`Capture complete. Found ${response.posts.length} matching posts.`)
      await refreshScreenshot('Updated browser screenshot after capture.')
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to capture LinkedIn posts.'
      setError(message)
      pushEvent(`Capture failed: ${message}`)
    } finally {
      setIsFetchingPosts(false)
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">LinkedIn Surfer</h1>
        <p className="page-subtitle">
          Open LinkedIn in the OpenClaw browser, sign in there, then fetch visible posts from the exact page you want.
        </p>
      </div>

      <Card
        className="section-card linkedin-run-card"
        title="LinkedIn Browser Session"
        extra={
          <Space>
            <Button onClick={() => void refreshScreenshot('Refreshed browser screenshot.')} loading={isRefreshingScreenshot}>
              Refresh Screenshot
            </Button>
            <Button type="primary" onClick={() => void handleOpenSession()} loading={isOpeningSession}>
              Connect LinkedIn
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">
            This opens LinkedIn in the local OpenClaw browser so the user can log in directly there. After login, use the capture form below.
          </Text>
          {screenshotError ? (
            <Alert
              type="warning"
              showIcon
              message="Browser screenshot unavailable"
              description={screenshotError}
            />
          ) : null}
          {openedPage ? (
            <div className="linkedin-run-preview">
              <Text strong>Browser session opened</Text>
              <Text type="secondary">{openedPage.title || 'LinkedIn'}</Text>
              <Text copyable>{openedPage.url}</Text>
            </div>
          ) : null}
          {screenshotDataUrl ? (
            <div className="linkedin-run-preview">
              <Text strong>Live Browser View</Text>
              <img className="linkedin-browser-shot" src={screenshotDataUrl} alt="OpenClaw browser screenshot" />
            </div>
          ) : null}
        </Space>
      </Card>

      <Card className="section-card" title="Capture Posts From A Specific Page">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {error ? <Alert type="error" showIcon message="LinkedIn Surfer failed" description={error} /> : null}

          <Input
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder="https://www.linkedin.com/company/example/posts/"
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Keyword to match inside visible posts"
          />

          <Space wrap>
            <Button type="primary" onClick={() => void handleFetchPosts()} loading={isFetchingPosts}>
              Fetch Posts
            </Button>
            <Button onClick={() => setPageUrl(defaultPageUrl)}>Use Example Page</Button>
          </Space>

          <div className="linkedin-run-preview">
            <Text strong>Live run status</Text>
            <List
              size="small"
              dataSource={runEvents}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </div>
        </Space>
      </Card>

      <Card
        className="section-card"
        title="Captured Posts"
        extra={<Tag color={result?.posts.length ? 'green' : 'default'}>{postCountLabel}</Tag>}
      >
        {result ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className="linkedin-run-preview">
              <Text strong>{result.title || 'LinkedIn page'}</Text>
              {result.url ? (
                <Link href={result.url} target="_blank" rel="noreferrer">
                  Open source page
                </Link>
              ) : null}
              <Text type="secondary">Matched keyword: {result.keyword}</Text>
            </div>

            {result.screenshotDataUrl ? (
              <div className="linkedin-run-preview">
                <Text strong>Matched Post Screenshot</Text>
                <img
                  className="linkedin-browser-shot"
                  src={result.screenshotDataUrl}
                  alt="Matched LinkedIn post screenshot"
                />
              </div>
            ) : null}

            <List
              dataSource={result.posts}
              renderItem={(post, index) => (
                <List.Item key={`${post.author}-${index}`}>
                  <div className="linkedin-run-snippet">
                    <Title level={5} style={{ margin: 0 }}>
                      {post.author || 'Unknown author'}
                    </Title>
                    <ChatMessageContent content={post.text} />
                  </div>
                </List.Item>
              )}
            />
          </Space>
        ) : (
          <Text type="secondary">
            No posts captured yet. Open LinkedIn, log in, then fetch a specific page.
          </Text>
        )}
      </Card>
    </div>
  )
}
