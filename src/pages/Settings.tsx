import { Card, Form, Input, Select } from 'antd'

export default function Settings() {
  return (
    <div className="page">
      <div>
        <h1 className="page-title">Workspace settings</h1>
        <p className="page-subtitle">
          Configure branding, notifications, and team defaults.
        </p>
      </div>

      <Card className="section-card" title="Organization">
        <Form layout="vertical">
          <Form.Item label="Company name" name="company">
            <Input placeholder="Trusted Technology Solutions" />
          </Form.Item>
          <Form.Item label="Default pipeline" name="pipeline">
            <Select
              placeholder="Select pipeline"
              options={[
                { value: 'enterprise', label: 'Enterprise' },
                { value: 'mid-market', label: 'Mid-market' },
                { value: 'smb', label: 'SMB' },
              ]}
            />
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
