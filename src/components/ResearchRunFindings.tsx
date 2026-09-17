import { useEffect, useMemo, useState } from 'react'
import { Alert, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  getResearchRunFindings,
  type ResearchRunFindingRow,
  type ResearchRunFindings as Findings,
} from '../lib/api'

const { Text } = Typography

const VERDICTS: ResearchRunFindingRow['cameras'][] = ['Yes', 'No', 'Planned', 'Unknown', 'Not researched']

const verdictColor = (verdict: ResearchRunFindingRow['cameras']) =>
  verdict === 'Yes' ? 'red' : verdict === 'No' ? 'green' : verdict === 'Planned' ? 'orange' : verdict === 'Unknown' ? 'gold' : 'default'

const when = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '')

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/** A link that survives a value the traveller left blank. */
const link = (href: string, text?: string) =>
  href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {text || href.replace(/^https?:\/\//, '').slice(0, 60)}
    </a>
  ) : null

/**
 * A run's findings as a table, for anyone who can see the map.
 *
 * This is the spreadsheet on screen - same rows, same columns, from the same
 * endpoint family - so someone who is not allowed the download still reads
 * exactly what it would say. Sort, filter and search are the whole point: the
 * question is nearly always "which of these have cameras and a phone number",
 * not "show me everything".
 */
export default function ResearchRunFindings({
  runId,
  open,
  onClose,
}: {
  runId: string | null
  open: boolean
  onClose: () => void
}) {
  const [findings, setFindings] = useState<Findings | null>(null)
  // Keyed by run so an old run's failure is not shown against a new run while
  // it loads, without needing to reset state inside the effect.
  const [failure, setFailure] = useState<{ runId: string; message: string } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || !runId) return
    let cancelled = false
    getResearchRunFindings(runId)
      .then((result) => {
        if (!cancelled) setFindings(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFailure({ runId, message: err instanceof Error ? err.message : 'Could not load the results.' })
      })
    return () => {
      cancelled = true
    }
  }, [open, runId])

  const error = failure && failure.runId === runId ? failure.message : ''
  const loaded = findings && findings.id === runId ? findings : null
  const loading = Boolean(open && runId && !loaded && !error)

  const rows = useMemo(() => {
    const all = loaded?.rows ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return all
    return all.filter((row) =>
      [row.agency, row.county, row.state, row.type, row.chief, row.email, row.phone, row.vendor, row.ori]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [loaded, search])

  const counts = useMemo(() => {
    const all = loaded?.rows ?? []
    return {
      yes: all.filter((row) => row.cameras === 'Yes').length,
      no: all.filter((row) => row.cameras === 'No').length,
      unknown: all.filter((row) => row.cameras === 'Unknown').length,
      phones: all.filter((row) => row.phone).length,
      emails: all.filter((row) => row.email).length,
    }
  }, [loaded])

  const columns: ColumnsType<ResearchRunFindingRow> = [
    {
      title: 'Agency',
      dataIndex: 'agency',
      key: 'agency',
      fixed: 'left',
      width: 240,
      sorter: (a, b) => compareText(a.agency, b.agency),
      render: (_, row) => (
        <span>
          <Text strong>{row.agency}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[row.type, row.county].filter(Boolean).join(' - ')}
          </Text>
        </span>
      ),
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      width: 70,
      sorter: (a, b) => compareText(a.state, b.state),
      filters: Array.from(new Set((loaded?.rows ?? []).map((row) => row.state)))
        .filter(Boolean)
        .sort()
        .map((state) => ({ text: state, value: state })),
      onFilter: (value, row) => row.state === value,
    },
    {
      title: 'Cameras',
      dataIndex: 'cameras',
      key: 'cameras',
      width: 130,
      sorter: (a, b) => VERDICTS.indexOf(a.cameras) - VERDICTS.indexOf(b.cameras),
      filters: VERDICTS.map((verdict) => ({ text: verdict, value: verdict })),
      onFilter: (value, row) => row.cameras === value,
      render: (_, row) => (
        <span>
          <Tag color={verdictColor(row.cameras)}>{row.cameras}</Tag>
          {row.confidence ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.confidence}
            </Text>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 140,
      sorter: (a, b) => compareText(a.vendor, b.vendor),
      render: (_, row) => (
        <span>
          {row.vendor}
          {row.contractEnd ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              to {row.contractEnd}
            </Text>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Decision maker',
      dataIndex: 'chief',
      key: 'chief',
      width: 200,
      sorter: (a, b) => compareText(a.chief, b.chief),
      render: (_, row) => (
        <span>
          {row.chief}
          {row.chiefTitle ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {row.chiefTitle}
            </Text>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 220,
      sorter: (a, b) => compareText(a.email, b.email),
      filters: [
        { text: 'Has an email', value: 'yes' },
        { text: 'No email', value: 'no' },
      ],
      onFilter: (value, row) => (value === 'yes' ? Boolean(row.email) : !row.email),
      render: (_, row) => (row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : null),
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      filters: [
        { text: 'Has a phone', value: 'yes' },
        { text: 'No phone', value: 'no' },
      ],
      onFilter: (value, row) => (value === 'yes' ? Boolean(row.phone) : !row.phone),
      render: (_, row) => (row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : null),
    },
    {
      title: 'Website',
      dataIndex: 'website',
      key: 'website',
      width: 180,
      ellipsis: true,
      render: (_, row) => link(row.website),
    },
    {
      title: 'Officers',
      dataIndex: 'officers',
      key: 'officers',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.officers ?? -1) - (b.officers ?? -1),
      render: (_, row) => (row.officers === null ? '' : row.officers.toLocaleString()),
    },
    {
      title: 'Added by this run',
      dataIndex: 'addedBy',
      key: 'addedBy',
      width: 170,
      sorter: (a, b) => compareText(a.addedBy, b.addedBy),
    },
    {
      title: 'Researched',
      dataIndex: 'cameraAsOf',
      key: 'cameraAsOf',
      width: 110,
      sorter: (a, b) => new Date(a.cameraAsOf || 0).getTime() - new Date(b.cameraAsOf || 0).getTime(),
      render: (_, row) => when(row.cameraAsOf),
    },
  ]

  return (
    <Modal
      title={
        loaded
          ? `Research results - ${loaded.rows.length.toLocaleString()} ${
              loaded.rows.length === 1 ? 'agency' : 'agencies'
            }`
          : 'Research results'
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(1400px, 96vw)"
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {error ? <Alert type="error" showIcon message={error} /> : null}

        {loaded ? (
          <Space wrap size={8}>
            <Tag color="red">{counts.yes.toLocaleString()} have cameras</Tag>
            <Tag color="green">{counts.no.toLocaleString()} confirmed none</Tag>
            <Tag color="gold">{counts.unknown.toLocaleString()} unknown</Tag>
            <Tag>{counts.phones.toLocaleString()} with a phone</Tag>
            <Tag>{counts.emails.toLocaleString()} with an email</Tag>
            {loaded.filtersLabel ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Targeting: {loaded.filtersLabel}
              </Text>
            ) : null}
            {loaded.status === 'running' || loaded.status === 'stopping' ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Still running - {loaded.completed + loaded.failed} of {loaded.total} so far.
              </Text>
            ) : null}
          </Space>
        ) : null}

        <Input.Search
          allowClear
          placeholder="Search agency, county, state, chief, email, phone, vendor"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 480 }}
        />

        <Table<ResearchRunFindingRow>
          rowKey={(row, index) => `${row.ori || row.agency}-${index}`}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1700, y: 'calc(100vh - 340px)' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total.toLocaleString()} rows` }}
          expandable={{
            rowExpandable: (row) => Boolean(row.reasoning || row.caveat || row.cameraUrl || row.contactUrl),
            expandedRowRender: (row) => (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {row.caveat ? <Text type="warning">{row.caveat}</Text> : null}
                {row.reasoning ? <Text>{row.reasoning}</Text> : null}
                {row.cameraUrl ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Camera source: {link(row.cameraUrl)}
                  </Text>
                ) : null}
                {row.contactUrl ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Contact source: {link(row.contactUrl)}
                  </Text>
                ) : null}
              </Space>
            ),
          }}
        />
      </Space>
    </Modal>
  )
}
