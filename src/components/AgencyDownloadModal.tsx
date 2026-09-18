import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Modal, Space, Typography } from 'antd'
import type { LeAgencyFeature } from '../lib/api'

const { Text } = Typography

/**
 * Download the map as a spreadsheet, one row per agency, picked by legend row.
 *
 * Built for feeding an enrichment tool (PromptLoop) rather than for reading:
 * every column is a plain value, the website and agency name sit up front as
 * the lookup inputs, and the email column is there even when blank so the
 * filled-in sheet comes back in the same shape it left. What is on the map is
 * what downloads - the state, type and size filters already applied to the
 * pins apply to the rows, so "download Unknown" means the Unknown pins you
 * can see, not every unknown agency in the country.
 */
export type DownloadCategory = {
  key: string
  label: string
  color: string
  count: number
}

export type DownloadRow = { category: string; feature: LeAgencyFeature }

const COLUMNS: Array<{ header: string; value: (row: DownloadRow, label: string) => string | number | null | undefined }> = [
  { header: 'Agency', value: (r) => r.feature.properties.name },
  { header: 'Website', value: (r) => r.feature.properties.website },
  { header: 'Email', value: (r) => r.feature.properties.email },
  { header: 'Phone', value: (r) => r.feature.properties.phone },
  { header: 'Chief name', value: (r) => r.feature.properties.chiefName },
  { header: 'Chief title', value: (r) => r.feature.properties.chiefTitle },
  { header: 'State', value: (r) => r.feature.properties.state },
  { header: 'County', value: (r) => r.feature.properties.county },
  { header: 'City', value: (r) => r.feature.properties.addressCity },
  { header: 'Street address', value: (r) => r.feature.properties.streetAddress },
  { header: 'Agency type', value: (r) => r.feature.properties.agencyType },
  { header: 'Sworn officers', value: (r) => r.feature.properties.swornOfficers },
  { header: 'Map category', value: (_r, label) => label },
  { header: 'BWC status', value: (r) => r.feature.properties.bwcStatus },
  { header: 'Trusted research', value: (r) => r.feature.properties.bwcTrusted },
  { header: 'BWC vendor', value: (r) => r.feature.properties.bwcVendor },
  { header: 'HubSpot stage', value: (r) => (r.feature.properties.inPipeline ? r.feature.properties.stage : '') },
  { header: 'Calls logged', value: (r) => r.feature.properties.callCount ?? 0 },
  { header: 'Last call outcome', value: (r) => r.feature.properties.lastCallOutcome },
  { header: 'ORI', value: (r) => r.feature.properties.ori },
]

/** A CSV cell. Quoted whenever the value could be read as structure. */
const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildAgencyCsv(rows: DownloadRow[], labels: Record<string, string>) {
  const lines = [COLUMNS.map((column) => cell(column.header)).join(',')]
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => cell(column.value(row, labels[row.category] ?? row.category))).join(','))
  }
  return lines.join('\r\n')
}

export default function AgencyDownloadModal({
  open,
  onClose,
  categories,
  rows,
  initialSelected,
}: {
  open: boolean
  onClose: () => void
  categories: DownloadCategory[]
  rows: DownloadRow[]
  // The legend rows currently shown on the map; the natural default.
  initialSelected: string[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))

  // Re-seed from the legend each time it opens, so the dialog starts on what
  // the map is showing rather than whatever was ticked last time.
  useEffect(() => {
    if (open) setSelected(new Set(initialSelected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const labels = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.key, category.label])),
    [categories],
  )
  const chosen = useMemo(() => rows.filter((row) => selected.has(row.category)), [rows, selected])

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const download = () => {
    // A BOM so Excel opens accented agency names correctly instead of as
    // mojibake; every other reader ignores it.
    const blob = new Blob([`﻿${buildAgencyCsv(chosen, labels)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    const which = categories
      .filter((category) => selected.has(category.key))
      .map((category) => category.key)
      .join('-')
    link.href = url
    link.download = `agencies-${which || 'none'}-${stamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <Modal
      title="Download agencies"
      open={open}
      onCancel={onClose}
      onOk={download}
      okText={`Download ${chosen.length.toLocaleString()} ${chosen.length === 1 ? 'agency' : 'agencies'}`}
      okButtonProps={{ disabled: chosen.length === 0 }}
      width={480}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Pick the legend rows to include. The map&rsquo;s current state, type and size filters
          apply, so the rows match the pins you can see. Comes down as a CSV with website,
          chief and email columns ready for enrichment.
        </Text>
        <Space direction="vertical" size={8}>
          {categories.map((category) => (
            <Space
              key={category.key}
              size={6}
              onClick={() => toggle(category.key)}
              role="checkbox"
              aria-checked={selected.has(category.key)}
              aria-label={category.label}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <Checkbox checked={selected.has(category.key)} onChange={() => {}} style={{ pointerEvents: 'none' }} />
              <span
                style={{
                  display: 'inline-block',
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  border: `1px solid ${category.color}`,
                  background: category.color,
                  verticalAlign: 'middle',
                }}
              />
              <Text>
                {category.label} ({category.count.toLocaleString()})
              </Text>
            </Space>
          ))}
        </Space>
      </Space>
    </Modal>
  )
}
