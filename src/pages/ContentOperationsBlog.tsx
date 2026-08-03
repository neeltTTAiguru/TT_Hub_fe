import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Space, Spin, Table, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import {
  contentOperationsAssetUrl,
  getContentOperationsBlogPosts,
  type ContentOperationsRun,
} from '../lib/api'
import MarkdownArticle from '../components/MarkdownArticle'
import trustedTechnologyPrimaryLogo from '../assets/trusted-technology-primary-logo.png'

const { Text } = Typography

function articleHeadings(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^##\s+(.+)$/)?.[1])
    .filter((heading): heading is string => Boolean(heading))
    .map((heading) => ({
      label: heading.replace(/\*\*/g, ''),
      id: heading
        .replace(/\*\*/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    }))
}

export default function ContentOperationsBlog() {
  const { slug } = useParams()
  const [posts, setPosts] = useState<ContentOperationsRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const articleExportRef = useRef<HTMLDivElement>(null)
  const selectedSlug = slug || ''

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getContentOperationsBlogPosts()
        setPosts(result)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load the test blog.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const selected = posts.find((post) => post.testPublication.slug === selectedSlug)
  const selectedDescription = String(
    selected?.brief?.metaDescription ||
    selected?.selectedOpportunity?.rationale ||
    'Practical guidance from Trusted Technology.',
  )
  const headings = selected ? articleHeadings(selected.article) : []
  const downloadArticle = () => {
    if (!selected?.article) return
    const url = URL.createObjectURL(new Blob([selected.article], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${selected.testPublication.slug || 'trusted-tech-article'}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
  const downloadPdf = async () => {
    if (!selected || !articleExportRef.current) return
    setDownloadingPdf(true)
    setError('')
    const articleElement = articleExportRef.current
    try {
      const measurementClone = articleElement.cloneNode(true) as HTMLDivElement
      measurementClone.removeAttribute('id')
      measurementClone.classList.add('pdf-exporting')
      measurementClone.style.position = 'fixed'
      measurementClone.style.left = '-10000px'
      measurementClone.style.top = '0'
      measurementClone.style.visibility = 'hidden'
      measurementClone.style.pointerEvents = 'none'
      document.body.appendChild(measurementClone)
      const continuousPageHeight = Math.min(
        200,
        Math.max(11, (measurementClone.scrollHeight / 96) + 0.1),
      )
      measurementClone.remove()

      const { default: html2pdf } = await import('html2pdf.js')
      const pdfBlob = await html2pdf()
        .set({
          margin: 0,
          filename: `${selected.testPublication.slug || 'trusted-tech-article'}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#f7f7f3',
            logging: false,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDocument: Document) => {
              clonedDocument
                .getElementById('content-article-export')
                ?.classList.add('pdf-exporting')
            },
          },
          jsPDF: {
            unit: 'in',
            format: [8.5, continuousPageHeight],
            orientation: 'portrait',
          },
        })
        .from(articleElement)
        .toPdf()
        .outputPdf('blob')
      if (pdfBlob.size < 100_000) {
        throw new Error('The PDF renderer returned an incomplete file. Nothing was downloaded.')
      }
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `${selected.testPublication.slug || 'trusted-tech-article'}.pdf`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download the PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="page content-blog">
      <div className="page-header">
        <div>
          <Space wrap>
            <h1 className="page-title">Content Operations Test Blog</h1>
            <Tag color="gold">Local publish validation</Tag>
          </Space>
          <p className="page-subtitle">
            Preview approved articles using the same handoff that will later create WordPress drafts.
          </p>
        </div>
        <Link to="/assistants/content-operations"><Button>Back to pipeline</Button></Link>
      </div>

      <Alert
        type="info"
        showIcon
        message="This is not WordPress"
        description="Posts here validate title, slug, article body, metadata, and publish-state handling locally. No external site is changed."
      />

      {error ? <Alert type="error" message="Test blog unavailable" description={error} /> : null}
      {loading ? <Spin size="large" /> : null}

      {!loading && !posts.length ? (
        <Card className="section-card"><Empty description="Approve an article and publish it to the test blog first." /></Card>
      ) : null}

      {posts.length && !selectedSlug ? (
        <Card className="section-card content-library-card" title="Generated article library">
          <Table
            rowKey="runId"
            pagination={{ pageSize: 10 }}
            dataSource={posts}
            columns={[
              {
                title: 'Article Topic',
                key: 'topic',
                render: (_, post) => (
                  <div>
                    <Text strong>{post.testPublication.title}</Text>
                    <div><Text type="secondary">{new Date(post.testPublication.publishedAt || '').toLocaleDateString()}</Text></div>
                  </div>
                ),
              },
              {
                title: 'Description',
                key: 'description',
                render: (_, post) => (
                  <Text>
                    {String(
                      post.brief?.metaDescription ||
                      post.selectedOpportunity?.rationale ||
                      'Generated Trusted Technology article.',
                    )}
                  </Text>
                ),
              },
              {
                title: 'View Article',
                key: 'view',
                width: 150,
                render: (_, post) => (
                  <Link to={`/assistants/content-operations/blog/${post.testPublication.slug}`}>
                    <Button type="primary">View Article</Button>
                  </Link>
                ),
              },
            ]}
          />
        </Card>
      ) : null}

      {posts.length && selectedSlug ? (
        <>
          {selected ? (
            <article className="content-blog-post">
              <div className="content-blog-toolbar">
                <Space wrap>
                  <Tag color="green">Published to test blog</Tag>
                  <Text type="secondary">
                    {selected.article.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                  </Text>
                  <Text type="secondary">{Math.max(1, Math.ceil(selected.article.split(/\s+/).length / 220))} min read</Text>
                </Space>
                <Space wrap>
                  <Link to="/assistants/content-operations/blog"><Button>All articles</Button></Link>
                  <Button onClick={downloadArticle}>Download Markdown</Button>
                  <Button
                    type="primary"
                    loading={downloadingPdf}
                    onClick={() => void downloadPdf()}
                  >
                    Download PDF
                  </Button>
                </Space>
              </div>

              <div
                className="content-blog-export"
                ref={articleExportRef}
                id="content-article-export"
              >
                <header className="article-hero">
                <div className="article-hero-copy">
                  <div className="article-eyebrow">
                    <span>Trusted Tech Knowledge Center</span>
                    <span className="article-eyebrow-dot" />
                    <span>Field Guide</span>
                  </div>
                  <h1>{selected.testPublication.title}</h1>
                  <p>{selectedDescription}</p>
                  <div className="article-byline">
                    <img
                      className="article-author-logo"
                      src={trustedTechnologyPrimaryLogo}
                      alt="Trusted Technology Solutions"
                    />
                    <span>
                      <small>
                        Published {new Date(selected.testPublication.publishedAt || '').toLocaleDateString(
                          undefined,
                          { month: 'long', day: 'numeric', year: 'numeric' },
                        )}
                      </small>
                    </span>
                  </div>
                </div>
                {selected.heroImage ? (
                  <figure
                    className="article-hero-image"
                    style={{
                      backgroundImage: `url("${contentOperationsAssetUrl(selected.heroImage.assetId)}")`,
                    }}
                    role="img"
                    aria-label={selected.heroImage.altText}
                  >
                    <img
                      src={contentOperationsAssetUrl(selected.heroImage.assetId)}
                      alt={selected.heroImage.altText}
                      crossOrigin="anonymous"
                      className="article-hero-accessible-image"
                    />
                    {selected.heroImage.caption ? <figcaption>{selected.heroImage.caption}</figcaption> : null}
                  </figure>
                ) : (
                  <div className="article-hero-visual" aria-hidden="true">
                    <span className="article-visual-label">TRUSTED TECH</span>
                    <span className="article-visual-line" />
                    <strong>Clear guidance.<br />Built for the field.</strong>
                    <span className="article-visual-number">01</span>
                  </div>
                )}
                </header>

                <div className="article-layout">
                <aside className="article-sidebar">
                  <div className="article-toc">
                    <span className="article-toc-title">In this article</span>
                    {headings.length ? headings.map((heading, index) => (
                      <a href={`#${heading.id}`} key={heading.id}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        {heading.label}
                      </a>
                    )) : <Text type="secondary">Article sections</Text>}
                  </div>
                  <div className="article-sidebar-cta">
                    <span>Explore the T500 system</span>
                    <p>Body-worn cameras and digital evidence workflows designed for public safety.</p>
                    <a href="https://trustedtechnology.ai" target="_blank" rel="noreferrer">Visit Trusted Tech →</a>
                  </div>
                </aside>

                <main className="article-reading-column">
                  <div className="article-intro-card">
                    <span>Article overview</span>
                    <p>{selectedDescription}</p>
                  </div>
                  <MarkdownArticle markdown={selected.article} hideFirstHeading />
                  <footer className="article-end-cta">
                    <span>Trusted Technology</span>
                    <h2>Technology that supports the work behind the badge.</h2>
                    <p>Explore the T500 body-worn camera system and Trusted Vault evidence workflows.</p>
                    <a href="https://trustedtechnology.ai" target="_blank" rel="noreferrer">Learn more about Trusted Tech →</a>
                  </footer>
                </main>
                </div>
              </div>
            </article>
          ) : (
            <Alert
              type="error"
              showIcon
              message="Article not found"
              description="This article is not available in the generated article library."
              action={<Link to="/assistants/content-operations/blog"><Button>View all articles</Button></Link>}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
