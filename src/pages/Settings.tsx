import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Spin, message } from 'antd'
import { getCompanyContext, updateCompanyContext, type CompanyContext } from '../lib/api'

export default function Settings() {
  const [form] = Form.useForm<CompanyContext>()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')

      try {
        const companyContext = await getCompanyContext()
        form.setFieldsValue(companyContext)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load company context.')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [form])

  const handleSave = async (values: CompanyContext) => {
    setIsSaving(true)
    setError('')

    try {
      const updated = await updateCompanyContext(values)
      form.setFieldsValue(updated)
      message.success('Company context saved')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save company context.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Hub settings</h1>
        <p className="page-subtitle">
          Configure company context, defaults, and workflow preferences.
        </p>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to save settings" description={error} /> : null}

      <Card className="section-card" title="Trusted Tech Profile">
        {isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item label="Company name" name="companyName" rules={[{ required: true, message: 'Company name is required.' }]}>
              <Input placeholder="Trusted Tech" />
            </Form.Item>
            <Form.Item label="Company summary" name="companySummary">
              <Input.TextArea rows={3} placeholder="What Trusted Tech does and why the hub exists." />
            </Form.Item>
            <Form.Item label="Mission" name="mission">
              <Input.TextArea rows={3} placeholder="How the hub should help the company operate." />
            </Form.Item>
            <Form.Item label="Website" name="website">
              <Input placeholder="https://trustedtech.com" />
            </Form.Item>
            <Form.Item label="Target customers" name="targetCustomers">
              <Select mode="tags" placeholder="Add customer segments" />
            </Form.Item>
            <Form.Item label="Service lines" name="serviceLines">
              <Select mode="tags" placeholder="Add service lines" />
            </Form.Item>
            <Form.Item label="Active products" name="activeProducts">
              <Select mode="tags" placeholder="Add active products" />
            </Form.Item>
            <Form.Item label="Research priorities" name="researchPriorities">
              <Select mode="tags" placeholder="Add research priorities" />
            </Form.Item>
            <Form.Item label="Positioning notes" name="positioningNotes">
              <Input.TextArea rows={4} placeholder="Anything agents should know about Trusted Tech positioning." />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              Save company context
            </Button>
          </Form>
        )}
      </Card>
    </div>
  )
}
