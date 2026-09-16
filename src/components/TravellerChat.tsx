import { useEffect, useRef, useState } from 'react'
import { Button, Card, Descriptions, Divider, Drawer, Input, Space, Spin, Tag, Typography } from 'antd'
import {
  getLeAgency,
  getMyTraveller,
  streamBwcResearch,
  travellerChat,
  type LeAgency,
  type TravellerChatReply,
} from '../lib/api'
import { travellerSvg } from './travellerSprite'
import { useFullAccess } from '../lib/access'

const { Text } = Typography

/**
 * What he is actually doing, in words.
 *
 * Derived from the real query rather than narrated separately, so the sentence
 * can never describe something different from the search that ran. The query
 * itself stays on screen underneath - the description reads it, rather than
 * replacing it.
 */
function describeSearch(query: string) {
  const q = query.toLowerCase()
  if (/\bsite:.*(agenda|minutes|civicclerk|granicus|legistar|boarddocs)/.test(q)) {
    return 'Digging through their council minutes'
  }
  if (/(agenda|minutes|commissioners court|city council)/.test(q)) {
    return 'Reading council and commissioners-court records'
  }
  if (/(budget|appropriation|capital improvement|check register|purchase order)/.test(q)) {
    return 'Going through the adopted budget'
  }
  if (/(axon|watchguard|motorola|getac|utility|digital ally|reveal|coban)/.test(q)) {
    return 'Checking who the vendors have sold to'
  }
  if (/(grant|award|bja|cops office)/.test(q)) {
    return 'Chasing grant records'
  }
  if (/(footage|released|shooting|incident)/.test(q)) {
    return 'Looking for footage they have released'
  }
  if (/(policy|general order|manual|powerdms|lexipol|sop)/.test(q)) {
    return 'Hunting for their camera policy'
  }
  if (/\bsite:/.test(q)) {
    return 'Reading their own website'
  }
  return 'Casting about the open web'
}

type Position = { ori: string; name: string; state: string; county: string; lat: number; lon: number }

/**
 * Chat with the traveller.
 *
 * A separate component for a specific reason: the map renders roughly 14,600
 * Leaflet markers, and every keystroke here is a state change. Kept inside
 * AgencyMap, typing a single character re-rendered the whole page and rebuilt
 * every marker icon, which froze the tab solid. Out here its state cannot
 * reach the map at all.
 */
export default function TravellerChat({
  open,
  onClose,
  at,
  working,
  onMoved,
  onOpenBriefing,
}: {
  open: boolean
  onClose: () => void
  at: Position | null
  working: boolean
  onMoved: (moved: NonNullable<TravellerChatReply['moved']>) => void
  onOpenBriefing: (ori: string, name: string) => void
}) {
  const fullAccess = useFullAccess()
  const [log, setLog] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // The searches he is running right now, newest last. Real queries streamed
  // from the model, not a scripted list on a timer.
  const [searches, setSearches] = useState<string[]>([])
  // The full record for whatever he is standing on, so the panel can show the
  // agency's card rather than making you close it and click the pin.
  const [agency, setAgency] = useState<LeAgency | null>(null)
  // Whether the stored conversation has been fetched. Once per mount: after
  // that the thread here is the truth and the server only trails it.
  const hydrated = useRef(false)

  // Pick the conversation back up where it was left. The server keeps the last
  // stretch of it per person, so a reload does not open on an empty thread.
  useEffect(() => {
    if (!open || hydrated.current) return
    hydrated.current = true
    let cancelled = false
    getMyTraveller()
      .then((mine) => {
        if (cancelled || !mine.chat?.length) return
        setLog((current) =>
          current.length
            ? current
            : mine.chat.map((line) => ({ role: line.role, content: line.content })),
        )
      })
      .catch(() => {
        /* nothing remembered is the same as a fresh start */
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !at?.ori) return
    setAgency(null)
    let cancelled = false
    getLeAgency(at.ori)
      .then((next) => {
        if (cancelled) return
        setAgency(next)
        // He arrived somewhere new, so say so in the thread. Otherwise the card
        // above silently swaps to a different agency and the conversation reads
        // as though it is still about the last one.
        setLog((current) =>
          current.length && current[current.length - 1]?.content !== `Arrived at ${next.agencyName}.`
            ? [...current, { role: 'assistant' as const, content: `Arrived at ${next.agencyName}.` }]
            : current,
        )
      })
      .catch(() => {
        if (!cancelled) setAgency(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, at?.ori])

  const research = async () => {
    if (!at?.ori || busy) return
    setBusy(true)
    setSearches([])
    try {
      await streamBwcResearch(at.ori, {
        onSearch: (query) => setSearches((current) => [...current, query]),
        onDone: (result) => {
          setLog((current) => [
            ...current,
            {
              role: 'assistant' as const,
              content:
                result.status === 'unknown'
                  ? `I had a proper look at ${result.name} - ${result.searches} searches - and nobody has published either way. A records request would settle it.`
                  : `${result.name}: ${result.status.replace(/_/g, ' ')}${
                      result.vendor ? `, ${result.vendor}` : ''
                    }${result.contractEnd ? `, contract to ${result.contractEnd}` : ''}.` +
                    `${result.quote ? `\n\n"${result.quote}"` : ''}\n\n${result.sourceUrl}`,
            },
          ])
          if (at.ori) void getLeAgency(at.ori).then(setAgency).catch(() => {})
        },
        onFailed: (message) =>
          setLog((current) => [
            ...current,
            { role: 'assistant' as const, content: `I could not get anywhere: ${message}` },
          ]),
      })
    } finally {
      setSearches([])
      setBusy(false)
    }
  }

  const ask = async () => {
    const question = draft.trim()
    if (!question || !at || busy) return
    const next = [...log, { role: 'user' as const, content: question }]
    setLog(next)
    setDraft('')
    setBusy(true)
    try {
      // Asking him to research something is handled as a stream, so the
      // searches show up while he works rather than a minute of silence.
      const wantsResearch = /\b(research|look into|dig|find out|check)\b/i.test(question)
      const targetOri = at.ori
      if (wantsResearch && targetOri) {
        setSearches([])
        let settled = false
        await streamBwcResearch(targetOri, {
          onSearch: (query) => setSearches((current) => [...current, query]),
          onDone: (result) => {
            settled = true
            const said =
              result.status === 'unknown'
                ? `I had a proper look at ${result.name} - ${result.searches} searches - and nobody has published either way. A records request would settle it.`
                : `${result.name}: ${result.status.replace(/_/g, ' ')}${
                    result.vendor ? `, ${result.vendor}` : ''
                  }${result.contractEnd ? `, contract to ${result.contractEnd}` : ''}.` +
                  `${result.quote ? `\n\n"${result.quote}"` : ''}\n\n${result.sourceUrl}`
            setLog([...next, { role: 'assistant' as const, content: said }])
          },
          onFailed: (msg) => {
            settled = true
            setLog([...next, { role: 'assistant' as const, content: `I could not get anywhere: ${msg}` }])
          },
        })
        if (!settled) {
          setLog([...next, { role: 'assistant' as const, content: 'I lost the trail there.' }])
        }
        setSearches([])
        return
      }

      const answer = await travellerChat({ messages: next, lat: at.lat, lon: at.lon, ori: at.ori })
      setLog([...next, { role: 'assistant' as const, content: answer.reply }])
      if (answer.moved) onMoved(answer.moved)
    } catch (error) {
      setLog([
        ...next,
        {
          role: 'assistant' as const,
          content:
            error instanceof Error
              ? `I could not reach anyone: ${error.message}`
              : 'Something went wrong on the way.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      title={
        <Space align="start" size={12}>
          {/* Him, in the corner, so it is obvious who is talking. */}
          <span
            aria-hidden
            style={{ flex: '0 0 auto', marginTop: 2 }}
            dangerouslySetInnerHTML={{ __html: travellerSvg(28) }}
          />
          <span style={{ lineHeight: 1.35 }}>
            <div>Your traveller</div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {at ? `${working ? 'working at' : 'standing at'} ${at.name}` : 'not on the map yet'}
            </Text>
          </span>
        </Space>
      }
      placement="right"
      width={400}
      open={open}
      onClose={onClose}
      // false renders it where this component sits in the tree - inside the map
      // card - so it slides in over the right of the map rather than the whole
      // page. The point is to keep looking at the map while he talks.
      getContainer={false}
      style={{ position: 'absolute' }}
      rootStyle={{ position: 'absolute' }}
      mask={false}
      // Kept mounted so a long answer is not thrown away by closing the drawer,
      // and so the conversation is still there when it is reopened.
      destroyOnClose={false}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {agency ? (
          <Card size="small" className="section-card">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space size={8} wrap>
                <Text strong>{agency.agencyName}</Text>
                {/* Our own verdict first, and marked as ours - it is the one
                    we stand behind, unlike a status pooled from four outside
                    sources of very different strength. */}
                {agency.surveillance?.bwc?.trustedResearched === 'has_bwc' ? (
                  <Tag color="error">already has BWC — verified</Tag>
                ) : agency.surveillance?.bwc?.trustedResearched === 'no_bwc' ? (
                  <Tag color="success">no BWC — verified</Tag>
                ) : agency.surveillance?.bwc?.status === 'yes' ? (
                  <Tag color="error">has cameras</Tag>
                ) : agency.surveillance?.bwc?.status === 'no' ? (
                  <Tag color="success">no cameras</Tag>
                ) : (
                  <Tag color="warning">cameras unknown</Tag>
                )}
                {agency.crm?.matched ? <Tag>{agency.crm.stage || 'in HubSpot'}</Tag> : null}
              </Space>

              <Descriptions size="small" column={1} colon={false}>
                <Descriptions.Item label="Where">
                  {[agency.county ? `${agency.county} County` : '', agency.state]
                    .filter(Boolean)
                    .join(', ')}
                </Descriptions.Item>
                <Descriptions.Item label="Officers">
                  {agency.employment?.swornOfficers ?? 'not reported'}
                </Descriptions.Item>
                {agency.contacts?.chiefName ? (
                  <Descriptions.Item label="Chief">
                    {`${agency.contacts.chiefTitle || ''} ${agency.contacts.chiefName}`.trim()}
                  </Descriptions.Item>
                ) : null}
                {agency.contacts?.phone ? (
                  <Descriptions.Item label="Phone">
                    <a href={`tel:${agency.contacts.phone}`}>{agency.contacts.phone}</a>
                  </Descriptions.Item>
                ) : null}
                {agency.contacts?.email ? (
                  <Descriptions.Item label="Email">
                    <a href={`mailto:${agency.contacts.email}`}>{agency.contacts.email}</a>
                  </Descriptions.Item>
                ) : null}
                {agency.surveillance?.bwc?.vendor ? (
                  <Descriptions.Item label="Vendor">
                    {agency.surveillance.bwc.vendor}
                  </Descriptions.Item>
                ) : null}
                {agency.surveillance?.bwc?.contractEnd ? (
                  <Descriptions.Item label="Contract ends">
                    {String(agency.surveillance.bwc.contractEnd).slice(0, 10)}
                  </Descriptions.Item>
                ) : null}
              </Descriptions>

              <Space wrap size={8}>
                {/* Both of these research the agency on the spot, which is
                    billed like a run - so the same accounts see them. */}
                {fullAccess ? (
                  <>
                    <Button type="primary" size="small" loading={busy} onClick={() => void research()}>
                      Research cameras
                    </Button>
                    <Button size="small" onClick={() => onOpenBriefing(agency.ori, agency.agencyName)}>
                      Full briefing
                    </Button>
                  </>
                ) : null}
                {agency.contacts?.website ? (
                  <Button
                    size="small"
                    href={agency.contacts.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </Button>
                ) : null}
              </Space>

              {agency.surveillance?.bwc?.evidenceUrl ? (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Source:{' '}
                  <a href={agency.surveillance.bwc.evidenceUrl} target="_blank" rel="noreferrer">
                    {agency.surveillance.bwc.evidenceUrl.slice(0, 58)}
                  </a>
                </Text>
              ) : null}
            </Space>
          </Card>
        ) : null}

        <Divider style={{ margin: '4px 0' }} />

        <Text type="secondary" style={{ fontSize: 12 }}>
          He answers from the agencies actually nearest him in the database, not from memory. Ask
          him what is nearby, or tell him where to go - "head to Fort Worth".
        </Text>

        {log.map((line, index) =>
          line.role === 'user' ? (
            <Card key={index} size="small" className="section-card" style={{ marginLeft: 40 }}>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{line.content}</Text>
            </Card>
          ) : (
            // He sits beside what he says, so a long thread reads as a
            // conversation rather than a wall of alternating boxes.
            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span
                aria-hidden
                style={{ flex: '0 0 auto', marginTop: 2 }}
                dangerouslySetInnerHTML={{ __html: travellerSvg(26) }}
              />
              <Card size="small" className="section-card" style={{ flex: 1, marginRight: 24 }}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{line.content}</Text>
              </Card>
            </div>
          ),
        )}
        {searches.map((query, index) => {
          const latest = index === searches.length - 1
          return (
            <div
              key={`q${index}`}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: latest ? 1 : 0.5 }}
            >
              <span
                aria-hidden
                style={{ flex: '0 0 auto', marginTop: 2 }}
                dangerouslySetInnerHTML={{ __html: travellerSvg(26) }}
              />
              <Card size="small" className="section-card" style={{ flex: 1, marginRight: 24 }}>
                <Text>{describeSearch(query)}</Text>
                <div style={{ marginTop: 4 }}>
                  <Text code style={{ fontSize: 10.5 }}>
                    {query}
                  </Text>
                </div>
              </Card>
            </div>
          )
        })}

        {busy ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              aria-hidden
              style={{ flex: '0 0 auto', opacity: 0.5 }}
              dangerouslySetInnerHTML={{ __html: travellerSvg(26) }}
            />
            <Space size={8}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {searches.length ? 'Still looking...' : 'Setting off...'}
              </Text>
            </Space>
          </div>
        ) : null}

        <Input.TextArea
          rows={2}
          value={draft}
          disabled={!at}
          placeholder={at ? 'Ask the traveller...' : 'He is not on the map yet'}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            if (event.shiftKey) return
            event.preventDefault()
            void ask()
          }}
        />
        <Button type="primary" loading={busy} disabled={!at} onClick={() => void ask()}>
          Ask
        </Button>
      </Space>
    </Drawer>
  )
}
