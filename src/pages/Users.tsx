import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import { createUser, getUsers, type User } from '../lib/api'

type UserFormValues = {
  name: string
  email: string
  role: string
  status: User['status']
}

const statusColors: Record<User['status'], string> = {
  active: 'green',
  invited: 'gold',
  inactive: 'default',
}

export default function Users() {
  const [form] = Form.useForm<UserFormValues>()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setIsLoading(true)
    setError('')

    try {
      const nextUsers = await getUsers()
      setUsers(nextUsers)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreateUser = async (values: UserFormValues) => {
    setIsSaving(true)
    setError('')

    try {
      const createdUser = await createUser(values)
      setUsers((currentUsers) => [createdUser, ...currentUsers])
      setIsModalOpen(false)
      form.resetFields()
      message.success('User added')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to add user.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            View the current team and add new users to the hub.
          </p>
        </div>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          Add New User
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to manage users" description={error} /> : null}

      <Card className="section-card">
        <Table<User>
          rowKey="_id"
          loading={isLoading}
          dataSource={users}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 720 }}
          locale={{
            emptyText: 'No users yet. Add the first user to get started.',
          }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              key: 'name',
            },
            {
              title: 'Email',
              dataIndex: 'email',
              key: 'email',
            },
            {
              title: 'Role',
              dataIndex: 'role',
              key: 'role',
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (status: User['status']) => (
                <Tag color={statusColors[status]}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Tag>
              ),
            },
            {
              title: 'Added',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (value: string) => new Date(value).toLocaleDateString(),
            },
          ]}
        />
      </Card>

      <Modal
        title="Add new user"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false)
          form.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            role: 'Member',
            status: 'active',
          }}
          onFinish={handleCreateUser}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required.' }]}
          >
            <Input placeholder="Jordan Lee" />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required.' },
              { type: 'email', message: 'Enter a valid email address.' },
            ]}
          >
            <Input placeholder="jordan@trustedtech.com" />
          </Form.Item>
          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: 'Role is required.' }]}
          >
            <Input placeholder="Member" />
          </Form.Item>
          <Form.Item
            label="Status"
            name="status"
            rules={[{ required: true, message: 'Status is required.' }]}
          >
            <Select
              options={[
                { value: 'active', label: 'Active' },
                { value: 'invited', label: 'Invited' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </Form.Item>
          <Space>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              Create user
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
