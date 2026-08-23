import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Space, Table, Tag, Typography, message } from 'antd'
import {
  deleteCompanyFile,
  getCompanyFiles,
  uploadCompanyFile,
  type CompanyFile,
} from '../lib/api'

const { Text } = Typography

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export default function CompanyFiles() {
  const [files, setFiles] = useState<CompanyFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Drag events fire for every child element, so a plain boolean flickers.
  const dragDepth = useRef(0)

  const load = useCallback(() => {
    setLoading(true)
    getCompanyFiles()
      .then((rows) => { setFiles(rows); setError('') })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load company files.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const send = async (incoming: File[]) => {
    if (!incoming.length) return
    setUploading(true)
    setError('')
    let added = 0
    let replaced = 0
    for (const file of incoming) {
      try {
        const result = await uploadCompanyFile(file)
        if (result.replaced) replaced += 1
        else added += 1
      } catch (cause) {
        // Report the file that failed rather than abandoning the whole batch.
        message.error(`${file.name}: ${cause instanceof Error ? cause.message : 'upload failed'}`)
      }
    }
    setUploading(false)
    if (added || replaced) {
      message.success([
        added ? `${added} file(s) added` : '',
        replaced ? `${replaced} updated in place` : '',
      ].filter(Boolean).join(' · '))
    }
    load()
  }

  const remove = async (row: CompanyFile) => {
    try {
      const { deletedRecords } = await deleteCompanyFile(row.id)
      message.success(`Removed ${row.title}${deletedRecords ? ` and ${deletedRecords} derived record(s)` : ''}`)
      load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not delete that file.')
    }
  }

  const dropzone = (
    <div
      className={`company-files-dropzone${dragActive ? ' company-files-dropzone-active' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragActive(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault()
        dragDepth.current -= 1
        if (dragDepth.current <= 0) { dragDepth.current = 0; setDragActive(false) }
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragActive(false)
        void send(Array.from(event.dataTransfer.files || []))
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.md"
        style={{ display: 'none' }}
        onChange={(event) => {
          void send(Array.from(event.target.files || []))
          event.target.value = ''
        }}
      />
      <Space direction="vertical" size={6} align="center">
        <Text strong>{uploading ? 'Uploading…' : 'Drop RFPs and company documents here'}</Text>
        <Text type="secondary">PDF, Word (.docx) or text — up to 25 MB each</Text>
      </Space>
    </div>
  )

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Company Files</h1>
        <p className="page-subtitle">
          Documents Hermes reads when it needs to know how Trusted Technology writes, sells, and
          describes its products. Text is extracted on upload; the original is kept.
        </p>
      </div>

      {error ? <Alert type="error" showIcon message="Company files unavailable" description={error} /> : null}

      <Card className="section-card" title="Upload" extra={<Button onClick={load} disabled={loading}>Refresh</Button>}>
        {dropzone}
      </Card>

      <Card className="section-card" title="Library" extra={<Tag color="gold">{files.length} file(s)</Tag>}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={files}
          pagination={false}
          locale={{ emptyText: <Empty description="Nothing uploaded yet." /> }}
          columns={[
            {
              title: 'Document',
              dataIndex: 'title',
              render: (value: string, row: CompanyFile) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{value}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{row.originalFilename}</Text>
                </Space>
              ),
            },
            {
              title: 'Size',
              dataIndex: 'sizeBytes',
              width: 110,
              render: (value: number) => formatSize(value),
            },
            {
              title: 'Pages',
              dataIndex: 'pageCount',
              width: 90,
              render: (value: number) => value || '—',
            },
            {
              title: 'Knowledge records',
              dataIndex: 'recordCount',
              width: 170,
              render: (value: number) => (
                value
                  ? <Tag color="green">{value} in every prompt</Tag>
                  : <Tag>Text stored, not distilled</Tag>
              ),
            },
            {
              title: 'Added',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => new Date(value).toLocaleDateString(),
            },
            {
              title: '',
              width: 90,
              render: (_: unknown, row: CompanyFile) => (
                <Button size="small" danger onClick={() => void remove(row)}>Remove</Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
