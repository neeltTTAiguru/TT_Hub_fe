import { useState } from 'react'
import { Button, Empty, List, Popover, Space, Tag, Typography } from 'antd'
import type { TravellerPerson } from '../lib/api'
import { TRAVELLER_SPRITE, travellerSvg } from './travellerSprite'

const { Text } = Typography

/** "just now", "12 min ago", "3 days ago" - enough to tell present from absent. */
function ago(value: string | null) {
  if (!value) return ''
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 2) return 'here now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Everyone's traveller, as a list.
 *
 * The markers alone are not enough to find people: across the whole country a
 * figure standing in rural Montana is invisible until you happen to zoom
 * there. This is the roster - who has one, where he is, whether he is
 * working, and a row to click to fly straight to him. Full-access accounts
 * only; it is rendered by the page under that gate.
 */
export default function TravellerRoster({
  me,
  others,
  onFly,
}: {
  me: TravellerPerson | null
  others: TravellerPerson[]
  onFly: (at: NonNullable<TravellerPerson['at']>) => void
}) {
  const [open, setOpen] = useState(false)

  // Mine first, then whoever was here most recently.
  const people = [
    ...(me ? [me] : []),
    ...[...others].sort(
      (a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime(),
    ),
  ]

  const content = (
    <div style={{ width: 340, maxHeight: 420, overflowY: 'auto' }}>
      {people.length ? (
        <List
          size="small"
          dataSource={people}
          renderItem={(person) => (
            <List.Item
              style={{ cursor: person.at ? 'pointer' : 'default', paddingLeft: 4, paddingRight: 4 }}
              onClick={() => {
                if (!person.at) return
                setOpen(false)
                onFly(person.at)
              }}
            >
              <Space direction="vertical" size={0} style={{ width: '100%' }}>
                <Space size={6}>
                  <Text strong>{person.mine ? 'You' : person.displayName}</Text>
                  {person.working ? <Tag color="processing">researching</Tag> : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {ago(person.lastSeenAt)}
                  </Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {person.at
                    ? `${person.at.name}${person.at.state ? `, ${person.at.state}` : ''}`
                    : 'not on the map yet'}
                </Text>
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody has opened the map yet." />
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      title="Travellers"
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Button
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}
        icon={
          <span
            aria-hidden
            style={{ display: 'inline-block', lineHeight: 0, verticalAlign: 'middle' }}
            dangerouslySetInnerHTML={{ __html: travellerSvg(16, TRAVELLER_SPRITE, false) }}
          />
        }
      >
        Travellers ({people.length})
      </Button>
    </Popover>
  )
}
