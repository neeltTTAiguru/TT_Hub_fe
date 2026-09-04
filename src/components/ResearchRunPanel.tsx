import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  downloadRunWorkbook,
  previewResearchRun,
  startResearchRun,
  stopResearchRun,
  type LeAgencyQuery,
  type ResearchRunPreview,
  type ResearchRunState,
} from '../lib/api'
import { TRAVELLER_SPRITE, travellerSvg } from './travellerSprite'

const { Text } = Typography

/**
 * Every report comes back with these three, and they are not optional. They are
 * shown rather than configured on purpose: a run that returns cameras for one
 * agency and a phone number for the next is not a dataset, it is a pile.
 */
const REQUIRED_FIELDS = [
  {
    label: 'Body-worn cameras: yes or no',
    detail: 'With the reasoning written out and the source it came from, so a "no" can be argued with.',
  },
  {
    label: 'A decision maker and their email',
    detail: 'Sheriff, chief, deputy or whoever signs off - name, title and address, each with the page it came from.',
  },
  {
    label: 'The agency phone number',
    detail: 'The main published line, not a 911 dispatch number.',
  },
]

/** What the traveller actually opens, in the order it tries them. */
const SEARCH_PLAN = [
  "The agency's own site - policy manual, transparency page, records requests",
  'The money trail - council and commissioners minutes, budgets, cooperative contracts',
  'Paperwork that only exists if they own cameras - retention schedules, open-records rulings, job adverts',
  'Released body camera footage in the news',
  'Local news and vendor press releases',
  'Staff directory and contact page, for the decision maker and the phone number',
]

const CAMERA_OPTIONS = [
  { value: 'any', label: 'Any camera status' },
  { value: 'unknown', label: 'Camera status unknown only' },
  { value: 'true', label: 'Known to have cameras' },
  { value: 'false', label: 'Known to have none' },
] as const

type CameraChoice = (typeof CAMERA_OPTIONS)[number]['value']

export default function ResearchRunPanel({
  mapFilters,
  states,
  agencyTypes,
  run,
  onRunChanged,
}: {
  mapFilters: LeAgencyQuery
  states: string[]
  agencyTypes: string[]
  run: ResearchRunState | null
  onRunChanged: () => void
}) {
  const [brief, setBrief] = useState('')
  const [skipResearched, setSkipResearched] = useState(true)
  // Off by default so the run's count is the same number the map is showing.
  // An agency with no coordinate is still researchable, so this is a choice you
  // make rather than a silent exclusion - the label carries the count.
  const [includeOffMap, setIncludeOffMap] = useState(false)
  const [preview, setPreview] = useState<ResearchRunPreview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [starting, setStarting] = useState(false)

  // The run keeps its own targeting rather than borrowing the map's. You often
  // want to look at one state while queueing a different, larger scope for
  // overnight - and a run that silently re-scoped itself when you panned the
  // map would be worse than one that made you set it twice.
  const [runStates, setRunStates] = useState<string[]>(mapFilters.state ? [mapFilters.state] : [])
  const [runTypes, setRunTypes] = useState<string[]>(
    mapFilters.agencyType ? [mapFilters.agencyType] : [],
  )
  const [minOfficers, setMinOfficers] = useState<number | null>(null)
  const [maxOfficers, setMaxOfficers] = useState<number | null>(mapFilters.maxOfficers ?? null)
  const [nameSearch, setNameSearch] = useState(mapFilters.search ?? '')
  const [camera, setCamera] = useState<CameraChoice>('any')

  const runQuery = useMemo<LeAgencyQuery>(() => {
    const query: LeAgencyQuery = {}
    if (runStates.length) query.state = runStates.join(',')
    if (runTypes.length) query.agencyType = runTypes.join(',')
    if (minOfficers !== null) query.minOfficers = minOfficers
    if (maxOfficers !== null) query.maxOfficers = maxOfficers
    if (nameSearch.trim()) query.search = nameSearch.trim()
    if (camera === 'unknown') query.bwc = 'unknown'
    if (camera === 'true') query.bwc = true
    if (camera === 'false') query.bwc = false
    return query
  }, [runStates, runTypes, minOfficers, maxOfficers, nameSearch, camera])

  // A live count while you tune, so you are never sizing a run blind. Debounced
  // because every keystroke in the name box would otherwise be a full count
  // over twenty thousand documents.
  const [live, setLive] = useState<ResearchRunPreview | null>(null)
  const [counting, setCounting] = useState(false)
  useEffect(() => {
    let cancelled = false
    setCounting(true)
    const timer = setTimeout(() => {
      previewResearchRun(runQuery, { skipResearched, includeOffMap })
        .then((result) => {
          if (!cancelled) setLive(result)
        })
        .catch(() => {
          if (!cancelled) setLive(null)
        })
        .finally(() => {
          if (!cancelled) setCounting(false)
        })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [runQuery, skipResearched, includeOffMap])

  const matchesMap =
    (mapFilters.state ? [mapFilters.state] : []).join(',') === runStates.join(',') &&
    (mapFilters.agencyType ? [mapFilters.agencyType] : []).join(',') === runTypes.join(',') &&
    (mapFilters.maxOfficers ?? null) === maxOfficers &&
    (mapFilters.search ?? '') === nameSearch &&
    minOfficers === null &&
    camera === 'any'

  const useMapFilters = () => {
    setRunStates(mapFilters.state ? [mapFilters.state] : [])
    setRunTypes(mapFilters.agencyType ? [mapFilters.agencyType] : [])
    setMinOfficers(null)
    setMaxOfficers(mapFilters.maxOfficers ?? null)
    setNameSearch(mapFilters.search ?? '')
    setCamera('any')
  }

  const review = () => {
    setReviewing(true)
    previewResearchRun(runQuery, { skipResearched, includeOffMap })
      .then(setPreview)
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not price this run.')
      })
      .finally(() => setReviewing(false))
  }

  const isLive = run?.status === 'running' || run?.status === 'stopping'

  const start = (limit?: number) => {
    setStarting(true)
    startResearchRun(runQuery, { skipResearched, includeOffMap, brief, limit })
      .then(() => {
        setPreview(null)
        message.success(
          limit === 1
            ? 'Testing on one agency. Watch the traveller on the map.'
            : 'Run started. It keeps going if you close the tab.',
        )
        onRunChanged()
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not start the run.')
      })
      .finally(() => setStarting(false))
  }

  const stop = () => {
    stopResearchRun()
      .then(() => {
        message.success('Stopping after this agency.')
        onRunChanged()
      })
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not stop the run.')
      })
  }

  // The banner's download is by run id, so it returns what that run covered
  // rather than whatever the form is set to now.
  const [downloadingRun, setDownloadingRun] = useState(false)
  const downloadRun = () => {
    if (!run) return
    setDownloadingRun(true)
    downloadRunWorkbook(run.id)
      .then((name) => message.success(`Downloaded ${name}`))
      .catch((err: unknown) => {
        message.error(err instanceof Error ? err.message : 'Could not build the spreadsheet.')
      })
      .finally(() => setDownloadingRun(false))
  }


  const label = (text: string) => (
    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
      {text}
    </Text>
  )

  return (
    <>
      <Card
        className="section-card"
        title={
          <Space size={10} align="center">
            <span
              aria-hidden
              style={{ display: 'inline-block', lineHeight: 0 }}
              dangerouslySetInnerHTML={{ __html: travellerSvg(20, TRAVELLER_SPRITE, false) }}
            />
            <span>Research run</span>
          </Space>
        }
        extra={
          matchesMap ? null : (
            <Button size="small" onClick={useMapFilters}>
              Match the map
            </Button>
          )
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {run ? (
            <Alert
              type={
                run.status === 'failed' ? 'error' : isLive ? 'info' : run.status === 'done' ? 'success' : 'warning'
              }
              showIcon
              message={
                <Space wrap size={12} align="center">
                  <Text strong>
                    {isLive
                      ? run.status === 'stopping'
                        ? 'Stopping after this agency'
                        : `Walking - ${run.current?.name || 'moving'}`
                      : run.status === 'done'
                        ? 'Run finished'
                        : run.status === 'stopped'
                          ? 'Run stopped'
                          : 'Run failed'}
                  </Text>
                  <Text type="secondary">
                    {(run.completed + run.failed).toLocaleString()} of {run.total.toLocaleString()}
                  </Text>
                  {isLive ? (
                    <Button size="small" danger onClick={stop}>
                      Stop
                    </Button>
                  ) : null}
                  <Button size="small" loading={downloadingRun} onClick={downloadRun}>
                    Download spreadsheet
                  </Button>
                </Space>
              }
              description={
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Progress
                    percent={run.total ? Math.round(((run.completed + run.failed) / run.total) * 100) : 0}
                    size="small"
                    status={isLive ? 'active' : run.status === 'failed' ? 'exception' : 'normal'}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Of {(run.completed + run.failed).toLocaleString()} visited:{' '}
                    {run.foundCameras.toLocaleString()} have cameras,{' '}
                    {run.foundPhones.toLocaleString()} have a phone,{' '}
                    {run.foundEmails.toLocaleString()} have an email -{' '}
                    {run.searches.toLocaleString()} searches
                    {run.failed ? ` - ${run.failed.toLocaleString()} failed` : ''}
                  </Text>
                  {run.filtersLabel ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Targeting: {run.filtersLabel}
                    </Text>
                  ) : null}
                  {run.lastError ? (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      Last error: {run.lastError}
                    </Text>
                  ) : null}
                </Space>
              }
            />
          ) : null}

          <Text type="secondary" style={{ fontSize: 12 }}>
            The traveller walks every agency this run targets and files one report each. The run
            lives on the server, so it carries on after you close the tab, and everyone with the hub
            open watches the same traveller. Targeting is set here, separately from the map, so you
            can queue a run while looking at somewhere else.
          </Text>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              What is this run for?
            </Text>
            <Input.TextArea
              rows={3}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Optional. Anything Hermes should weight or look out for - a vendor whose contracts are expiring, a grant round, a sheriff who just took office."
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              The three fields below are collected on every run regardless. This only steers what
              else the traveller pays attention to.
            </Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              On every report
            </Text>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {REQUIRED_FIELDS.map((field, index) => (
                <Space key={field.label} size={10} align="start">
                  <Tag style={{ marginTop: 1 }}>{index + 1}</Tag>
                  <span>
                    <Text strong>{field.label}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {field.detail}
                    </Text>
                  </span>
                </Space>
              ))}
            </Space>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 10 }}>
              Who this run targets
            </Text>
            <Space wrap size={12} align="start">
              <div>
                {label('States')}
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  maxTagCount="responsive"
                  placeholder="All states"
                  style={{ width: 240 }}
                  value={runStates}
                  onChange={setRunStates}
                  options={states.map((code) => ({ value: code, label: code }))}
                />
              </div>
              <div>
                {label('Agency types')}
                <Select
                  mode="multiple"
                  allowClear
                  maxTagCount="responsive"
                  placeholder="All agency types"
                  style={{ width: 240 }}
                  value={runTypes}
                  onChange={setRunTypes}
                  options={agencyTypes.map((type) => ({ value: type, label: type }))}
                />
              </div>
              <div>
                {label('Sworn officers')}
                <Space size={6}>
                  <InputNumber
                    min={0}
                    style={{ width: 100 }}
                    placeholder="Min"
                    value={minOfficers}
                    onChange={(value) => setMinOfficers(value ?? null)}
                  />
                  <Text type="secondary">to</Text>
                  <InputNumber
                    min={0}
                    style={{ width: 100 }}
                    placeholder="Max"
                    value={maxOfficers}
                    onChange={(value) => setMaxOfficers(value ?? null)}
                  />
                </Space>
              </div>
              <div>
                {label('Camera status')}
                <Select
                  style={{ width: 220 }}
                  value={camera}
                  onChange={setCamera}
                  options={CAMERA_OPTIONS.map((option) => ({ ...option }))}
                />
              </div>
              <div>
                {label('Agency name contains')}
                <Input
                  allowClear
                  style={{ width: 220 }}
                  placeholder="Any name"
                  value={nameSearch}
                  onChange={(event) => setNameSearch(event.target.value)}
                />
              </div>
            </Space>
            {minOfficers !== null || maxOfficers !== null ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Setting a size range excludes the agencies that never reported an officer count.
                Clear both to include them.
              </Text>
            ) : null}
          </div>

          <Space direction="vertical" size={6}>
            <Checkbox
              checked={skipResearched}
              onChange={(event) => setSkipResearched(event.target.checked)}
            >
              Skip agencies already researched
            </Checkbox>
            <Checkbox
              checked={includeOffMap}
              onChange={(event) => setIncludeOffMap(event.target.checked)}
            >
              Also include agencies that are not on the map
              {live?.offMap ? ` (${live.offMap.toLocaleString()})` : ''}
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                No published coordinate, so the traveller cannot walk to them - but they still have
                a website, a chief and a phone number. Leave this off and the count below is exactly
                what the map is showing.
              </Text>
            </Checkbox>
          </Space>

          <Space wrap>
            <Button type="primary" loading={reviewing} onClick={review} disabled={isLive}>
              Run research
            </Button>
            <Button loading={starting} onClick={() => start(1)} disabled={isLive}>
              Test on one agency
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isLive
                ? 'A run is already going. Stop it before starting another.'
                : counting
                ? 'Counting...'
                : live === null
                  ? 'You get the scope and the cost first. Nothing starts until you confirm.'
                  : `${live.queue.toLocaleString()} agencies in scope. You get the full cost before anything starts.`}
            </Text>
          </Space>
        </Space>
      </Card>

      <Modal
        title="Before this run starts"
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => setPreview(null)}>
            Close
          </Button>,
          <Button key="test" loading={starting} onClick={() => start(1)}>
            Test on one agency
          </Button>,
          <Button key="start" type="primary" loading={starting} onClick={() => start()}>
            Start run
          </Button>,
        ]}
      >
        {preview ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="Start run spends money"
              description={`This queues ${preview.queue.toLocaleString()} agencies and begins immediately. It runs on the server, so closing the tab will not stop it - use Stop for that. Test on one agency first: same targeting, same prompt, one agency of it, for about $${preview.perAgency.high.toFixed(2)}.`}
            />

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Agencies in this run">
                <Text strong>{preview.queue.toLocaleString()}</Text>
                {preview.alreadyDone ? (
                  <Text type="secondary">
                    {' '}
                    - {preview.matched.toLocaleString()} match the filters,{' '}
                    {preview.alreadyDone.toLocaleString()} already researched
                    {skipResearched ? ' and skipped' : ' and included again'}
                  </Text>
                ) : null}
              </Descriptions.Item>
              <Descriptions.Item label="Estimated cost">
                <Text strong>
                  ${preview.cost.low.toLocaleString()} - ${preview.cost.high.toLocaleString()}
                </Text>
                <Text type="secondary">
                  {' '}
                  (${preview.perAgency.low.toFixed(2)} - ${preview.perAgency.high.toFixed(2)} each,{' '}
                  {preview.searchesPerAgency.low}-{preview.searchesPerAgency.high} searches)
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Estimated time">
                {preview.hours.concurrent3.toLocaleString()} hours at three at a time, or{' '}
                {preview.hours.serial.toLocaleString()} one after another
              </Descriptions.Item>
              <Descriptions.Item label="Missing contacts today">
                {preview.needEmail.toLocaleString()} without an email,{' '}
                {preview.needPhone.toLocaleString()} without a phone number
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                What you get back
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                One Excel workbook, one row per agency, with the camera verdict and its reasoning,
                the decision maker and their email, the phone number, and the source URL and date
                behind each claim. A second sheet records what this run targeted and how it went.
                The download appears on the run itself once it is going, so what you get is what
                that run covered.
              </Text>
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                What the traveller searches, per agency
              </Text>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {SEARCH_PLAN.map((line, index) => (
                  <Text key={line} type="secondary" style={{ fontSize: 12 }}>
                    {index + 1}. {line}
                  </Text>
                ))}
              </Space>
            </div>

            {brief.trim() ? (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Plus your brief
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {brief.trim()}
                </Text>
              </div>
            ) : null}

            {preview.offMap ? (
              <Alert
                type={preview.includeOffMap ? 'warning' : 'info'}
                showIcon
                message={
                  preview.includeOffMap
                    ? `${preview.offMap.toLocaleString()} of these are not on the map`
                    : `${preview.offMap.toLocaleString()} more match your filters but are not on the map`
                }
                description={
                  preview.includeOffMap
                    ? 'They have no published coordinate, so they will be researched but the traveller cannot walk to them.'
                    : 'They have no published coordinate and are excluded, so this run covers exactly what the map is showing.'
                }
              />
            ) : null}
          </Space>
        ) : null}
      </Modal>
    </>
  )
}
