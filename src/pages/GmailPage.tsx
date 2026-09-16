import { Space, Typography } from 'antd'
import GmailPanel from '../components/GmailPanel'

const { Title, Text } = Typography

/** Their own inbox, one click from the map. */
export default function GmailPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ marginBottom: 4 }}>
          Gmail
        </Title>
        <Text type="secondary">
          Your own inbox. Follow-up emails sent from the map go out from here, and replies land here.
        </Text>
      </div>
      <GmailPanel />
    </Space>
  )
}
