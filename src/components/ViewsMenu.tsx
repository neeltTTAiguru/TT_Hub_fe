import { useEffect, useState } from 'react'
import { Button, Popover, Radio, Space, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { getCommandBoard, type HubMember } from '../lib/api'
import { useViewAs } from '../lib/access'

const { Text } = Typography

/** "Troy Broddrick", or the email's local part when the board has no name. */
function nameOf(member: Pick<HubMember, 'email' | 'name'>) {
  return member.name || member.email.split('@')[0]
}

/**
 * Look at the map as one member sees it.
 *
 * The command board sets what each restricted account gets; this is the
 * quickest way to check the result without signing in as them. Pick a person
 * and every feed is scoped as the server scopes it for them, with their
 * filter defaults and without the controls they do not have. "You" is the
 * whole map back. Full-access accounts only - nobody else has a choice.
 */
export default function ViewsMenu({ top = 50 }: { top?: number }) {
  const { member, pending, select } = useViewAs()
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<HubMember[]>([])

  useEffect(() => {
    let cancelled = false
    getCommandBoard()
      .then((board) => {
        if (cancelled) return
        // Only restricted accounts have a view of their own to look through;
        // a full-access colleague's map is this one.
        setPeople(
          board.members
            .filter((m) => !m.fullAccess)
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
        )
      })
      .catch(() => {
        if (!cancelled) setPeople([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const current = member ? people.find((p) => p.email === member.email) ?? member : null

  const content = (
    <div style={{ width: 220 }}>
      <Radio.Group
        value={member?.email ?? ''}
        disabled={pending}
        onChange={(event) => {
          const email = String(event.target.value || '')
          select(email || null)
          setOpen(false)
        }}
      >
        <Space direction="vertical" size={4}>
          <Radio value="">You</Radio>
          {people.map((person) => (
            <Radio key={person.email} value={person.email}>
              {nameOf(person)}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      {people.length ? null : (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Nobody else is on the command board yet.
        </Text>
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      title="View the map as"
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
    >
      <Button
        style={{ position: 'absolute', top, left: 54, zIndex: 1000 }}
        icon={<EyeOutlined />}
        loading={pending}
        type={member ? 'primary' : 'default'}
      >
        {current ? `Viewing as ${nameOf(current)}` : 'Views'}
      </Button>
    </Popover>
  )
}
