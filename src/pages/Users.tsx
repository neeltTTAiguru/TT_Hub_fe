import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  createAdminUser,
  getAdminAccess,
  getAdminUsers,
  updateAdminUser,
  type User,
} from '../lib/api'

const { Text } = Typography

type AdminFormValues = {
  name: string
  email: string
  role: string
  title: string
  status: User['status']
  isAdmin: boolean
}

const statusColors: Record<User['status'], string> = {
  active: 'green',
  invited: 'gold',
  inactive: 'default',
}

function getInitialValues(user?: User): AdminFormValues {
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'Admin',
    title: user?.title ?? '',
    status: user?.status ?? 'active',
    isAdmin: user?.isAdmin ?? true,
  }
}

export default function Users() {
  const [form] = Form.useForm<AdminFormValues>()
  const [users, setUsers] = useState<User[]>([])
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | undefined>()
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setIsLoading(true)
    setError('')

    try {
      setUsers(await getAdminUsers())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const loadAdmin = async () => {
      setIsCheckingAccess(true)
      setError('')

      try {
        await getAdminAccess()
        setHasAdminAccess(true)
        await loadUsers()
      } catch (accessError) {
        setHasAdminAccess(false)
        setError(accessError instanceof Error ? accessError.message : 'Admin access is restricted.')
      } finally {
        setIsCheckingAccess(false)
      }
    }

    void loadAdmin()
  }, [])

  const openAdminModal = (user?: User) => {
    setEditingUser(user)
    form.setFieldsValue(getInitialValues(user))
    setIsModalOpen(true)
  }

  const closeAdminModal = () => {
    setIsModalOpen(false)
    setEditingUser(undefined)
    form.resetFields()
  }

  const handleSaveAdmin = async (values: AdminFormValues) => {
    setIsSaving(true)
    setError('')

    try {
      const payload = {
        ...values,
        userType: 'trusted_employee' as const,
        onboardingFlow: 'trusted_employee' as const,
        accessScope: 'internal' as const,
      }

      const savedUser = editingUser
        ? await updateAdminUser(editingUser._id, payload)
        : await createAdminUser(payload)

      setUsers((currentUsers) => {
        if (!editingUser) {
          return [savedUser, ...currentUsers]
        }

        return currentUsers.map((user) => (user._id === savedUser._id ? savedUser : user))
      })
      closeAdminModal()
      message.success(editingUser ? 'User updated' : 'Admin added')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save admin.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">
            View all users and control who can access Admin.
          </p>
        </div>
        <Button type="primary" onClick={() => openAdminModal()} disabled={!hasAdminAccess}>
          Add Admin
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message="Unable to manage users" description={error} /> : null}

      {isCheckingAccess ? (
        <Card className="section-card">
          <Text type="secondary">Checking admin access...</Text>
        </Card>
      ) : null}

      {!isCheckingAccess && hasAdminAccess ? (
        <Card className="section-card">
          <Table<User>
            rowKey="_id"
            loading={isLoading}
            dataSource={users}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1080 }}
            locale={{
              emptyText: 'No users yet.',
            }}
            columns={[
              {
                title: 'Name',
                dataIndex: 'name',
                key: 'name',
                render: (name: string, user) => (
                  <Space direction="vertical" size={0}>
                    <Text strong>{name}</Text>
                    <Text type="secondary">{user.email}</Text>
                  </Space>
                ),
              },
              {
                title: 'Role',
                dataIndex: 'role',
                key: 'role',
                render: (role: string, user) => user.title || role || 'Member',
              },
              {
                title: 'Agency',
                dataIndex: 'agencyName',
                key: 'agencyName',
                render: (agencyName: string, user) => agencyName || user.department || 'Trusted Tech',
              },
              {
                title: 'Access',
                dataIndex: 'accessScope',
                key: 'accessScope',
                render: (scope: User['accessScope']) => scope.replaceAll('_', ' '),
              },
              {
                title: 'Admin',
                dataIndex: 'isAdmin',
                key: 'isAdmin',
                render: (isAdmin: boolean) => (
                  isAdmin ? <Tag color="blue">Admin</Tag> : <Tag>Standard</Tag>
                ),
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
                title: 'Created',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (value: string) => new Date(value).toLocaleDateString(),
              },
              {
                title: '',
                key: 'actions',
                fixed: 'right',
                width: 110,
                render: (_, user) => (
                  <Button onClick={() => openAdminModal(user)}>
                    Edit
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      ) : null}

      <Modal
        title={editingUser ? 'Edit user' : 'Add admin'}
        open={isModalOpen}
        onCancel={closeAdminModal}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={getInitialValues(editingUser)}
          onFinish={handleSaveAdmin}
        >
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required.' }]}>
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
            <Input placeholder="jordan@trustedtechnology.ai" />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true, message: 'Role is required.' }]}>
            <Input placeholder="Admin" />
          </Form.Item>
          <Form.Item label="Title" name="title">
            <Input placeholder="Operations lead" />
          </Form.Item>
          <Form.Item label="Admin access" name="isAdmin" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Status" name="status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'active', label: 'Active' },
                { value: 'invited', label: 'Invited' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </Form.Item>
          <Space>
            <Button onClick={closeAdminModal}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              {editingUser ? 'Save user' : 'Add admin'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
