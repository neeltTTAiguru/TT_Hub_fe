import { Space, Typography } from 'antd'
import CalendarPanel from '../components/CalendarPanel'

const { Title, Text } = Typography

/** Their own calendar, on the Google connection they made for Gmail. */
export default function CalendarPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ marginBottom: 4 }}>
          Calendar
        </Title>
        <Text type="secondary">
          Your own Google Calendar. Add, move and cancel events here; guests are invited by Google as you.
        </Text>
      </div>
      <CalendarPanel />
    </Space>
  )
}
