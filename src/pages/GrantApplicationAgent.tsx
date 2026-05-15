import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import {
  createUser,
  deleteUser,
  getGrantOpportunities,
  getUsers,
  searchGrantOpportunities,
  type GrantOpportunity,
  type User,
} from '../lib/api'

const { Paragraph, Text } = Typography
const { TextArea } = Input

type ApplicationUserFormValues = {
  name: string
  email: string
  title: string
  userType: User['userType']
  agencyName: string
  agencyType: string
  city: string
  state: string
  grantProjectFocus: string
  knownNeeds: string
  grantRequirements: string
}

const userTypeLabels: Record<User['userType'], string> = {
  trusted_employee: 'Trusted employee',
  police_officer: 'Police officer',
  firefighter: 'Firefighter',
  agency_admin: 'Agency admin',
  non_trusted_employee: 'External reviewer',
}

function splitTerms(value: string) {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
}

export default function GrantApplicationAgent() {
  const navigate = useNavigate()
  const { applicationUserId } = useParams()
  const [applicationForm] = Form.useForm<ApplicationUserFormValues>()
  const [applicationUsers, setApplicationUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [opportunities, setOpportunities] = useState<GrantOpportunity[]>([])
  const [state, setState] = useState('')
  const [agencyType, setAgencyType] = useState('small police department')
  const [projectType, setProjectType] = useState('body cameras and digital evidence storage')
  const [keywords, setKeywords] = useState('body camera, digital evidence, law enforcement technology')
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false)
  const [isLoadingApplications, setIsLoadingApplications] = useState(true)
  const [isSavingApplicationUser, setIsSavingApplicationUser] = useState(false)
  const [isDeletingApplications, setIsDeletingApplications] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [applicationSearchText, setApplicationSearchText] = useState('')
  const [selectedApplicationKeys, setSelectedApplicationKeys] = useState<string[]>([])
  const [searchError, setSearchError] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [crmError, setCrmError] = useState('')

  const selectedUser = useMemo(
    () => applicationUsers.find((user) => user._id === selectedUserId) ?? null,
    [applicationUsers, selectedUserId],
  )
  const isApplicationWorkspace = Boolean(applicationUserId)
  const visibleApplicationUsers = useMemo(() => {
    const query = applicationSearchText.trim().toLowerCase()

    if (!query) {
      return applicationUsers
    }

    return applicationUsers.filter((user) =>
      [
        user.name,
        user.email,
        user.agencyName,
        user.agencyType,
        user.city,
        user.state,
        user.grantProjectFocus,
        user.title,
      ].join(' ').toLowerCase().includes(query),
    )
  }, [applicationSearchText, applicationUsers])

  const selectedApplications = useMemo(
    () => applicationUsers.filter((user) => selectedApplicationKeys.includes(user._id)),
    [applicationUsers, selectedApplicationKeys],
  )

  useEffect(() => {
    const load = async () => {
      setIsLoadingApplications(true)

      try {
        const [nextOpportunities, nextUsers] = await Promise.all([
          getGrantOpportunities(),
          getUsers(),
        ])

        setOpportunities(nextOpportunities)
        setApplicationUsers(nextUsers)
        setSelectedUserId((current) => applicationUserId || current || '')
      } catch {
        // The chat workspace will surface backend auth/API errors. This panel can start empty.
      } finally {
        setIsLoadingApplications(false)
      }
    }

    void load()
  }, [applicationUserId])

  const handleCreateApplicationUser = async (values: ApplicationUserFormValues) => {
    setIsSavingApplicationUser(true)
    setCrmError('')

    try {
      const createdUser = await createUser({
        name: values.name,
        email: values.email,
        role: 'Grant applicant',
        title: values.title,
        userType: values.userType,
        onboardingFlow: values.userType === 'firefighter' || values.userType === 'police_officer'
          ? 'public_safety'
          : 'restricted_guest',
        agencyName: values.agencyName,
        agencyType: values.agencyType,
        city: values.city,
        state: values.state?.toUpperCase(),
        accessScope: 'grant_drafting_only',
        grantProjectFocus: values.grantProjectFocus,
        targetGrantTypes: ['public safety', 'technology modernization'],
        status: 'active',
        promptVariables: {
          agencyName: values.agencyName,
          agencyType: values.agencyType,
          location: [values.city, values.state?.toUpperCase()].filter(Boolean).join(', '),
          roleContext: values.title || userTypeLabels[values.userType],
          projectFocus: values.grantProjectFocus,
          knownNeeds: values.knownNeeds,
          grantRequirements: values.grantRequirements,
        },
      })

      setApplicationUsers((currentUsers) => [createdUser, ...currentUsers])
      setSelectedUserId(createdUser._id)
      setState(createdUser.state)
      setAgencyType(createdUser.agencyType || agencyType)
      setProjectType(createdUser.grantProjectFocus || projectType)
      setIsApplicationModalOpen(false)
      applicationForm.resetFields()
      message.success('Application user created')
      navigate(`/police-grants/${createdUser._id}`)
    } catch (error) {
      setCrmError(error instanceof Error ? error.message : 'Failed to create application user.')
    } finally {
      setIsSavingApplicationUser(false)
    }
  }

  const handleSearch = async () => {
    if (isSearching) {
      return
    }

    setIsSearching(true)
    setSearchError('')
    setSearchNotice('')

    try {
      const result = await searchGrantOpportunities({
        state,
        agencyType,
        projectType,
        keywords: splitTerms(keywords),
      })

      setOpportunities(result.opportunities)
      setSearchNotice(
        `OpenClaw scanned ${result.sources.length} source pages and saved ${result.opportunities.length} likely grant opportunities.`,
      )
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Grant search failed.')
    } finally {
      setIsSearching(false)
    }
  }

  const deleteSelectedApplications = async () => {
    if (!selectedApplications.length) {
      return
    }

    setIsDeletingApplications(true)
    setCrmError('')

    try {
      const results = await Promise.allSettled(
        selectedApplications.map((user) => deleteUser(user._id)),
      )
      const deletedIds = selectedApplications
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((user) => user._id)

      setApplicationUsers((currentUsers) => currentUsers.filter((user) => !deletedIds.includes(user._id)))
      setSelectedApplicationKeys((currentKeys) => currentKeys.filter((key) => !deletedIds.includes(key)))

      if (selectedUserId && deletedIds.includes(selectedUserId)) {
        setSelectedUserId('')
      }

      const failedCount = results.length - deletedIds.length
      if (failedCount) {
        setCrmError(`${failedCount} selected grant application${failedCount === 1 ? '' : 's'} could not be deleted.`)
      } else {
        message.success('Selected grant applications deleted')
      }
    } catch (error) {
      setCrmError(error instanceof Error ? error.message : 'Failed to delete selected grant applications.')
    } finally {
      setIsDeletingApplications(false)
    }
  }

  const buildGrantContext = () => {
    const selectedUserContext = selectedUser
      ? [
          'Selected grant application user:',
          `Name: ${selectedUser.name}`,
          `Role: ${selectedUser.title || userTypeLabels[selectedUser.userType]}`,
          `Agency: ${selectedUser.agencyName || 'Unknown'}`,
          `Agency type: ${selectedUser.agencyType || 'Unknown'}`,
          `Location: ${[selectedUser.city, selectedUser.state].filter(Boolean).join(', ') || 'Unknown'}`,
          `Project focus: ${selectedUser.grantProjectFocus || 'Unknown'}`,
          `Known needs: ${selectedUser.promptVariables?.knownNeeds || 'Unknown'}`,
          `Grant requirements: ${selectedUser.promptVariables?.grantRequirements || 'Not provided yet'}`,
        ].join('\n')
      : ''

    if (!opportunities.length) {
      return selectedUserContext
    }

    const grantLines = opportunities.slice(0, 8).map((opportunity) =>
      [
        `Title: ${opportunity.title}`,
        `Source: ${opportunity.sourceAgency || 'Unknown'}`,
        `Fit score: ${opportunity.fitScore}`,
        `Deadline: ${opportunity.deadline || 'Unknown'}`,
        `Award: ${opportunity.awardRange || 'Unknown'}`,
        `Eligibility: ${opportunity.eligibility || 'Unknown'}`,
        `Match: ${opportunity.matchRequired || 'Unknown'}`,
        `Link: ${opportunity.applicationUrl || opportunity.sourceUrl}`,
        `Summary: ${opportunity.summary || 'No summary captured.'}`,
      ].join('\n'),
    )

    return [
      selectedUserContext,
      `Saved grant opportunities from OpenClaw Browser discovery:\n\n${grantLines.join('\n\n')}`,
    ].filter(Boolean).join('\n\n')
  }

  const crmPanel = (
    <>
      <div className="grant-application-stats">
        <Card className="section-card">
          <Text type="secondary">Applications</Text>
          <Typography.Title level={3}>{applicationUsers.length}</Typography.Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Police</Text>
          <Typography.Title level={3}>
            {applicationUsers.filter((user) => user.userType === 'police_officer').length}
          </Typography.Title>
        </Card>
        <Card className="section-card">
          <Text type="secondary">Fire / EMS</Text>
          <Typography.Title level={3}>
            {applicationUsers.filter((user) => user.userType === 'firefighter').length}
          </Typography.Title>
        </Card>
      </div>

      <Card className="section-card grant-crm-card" title="Grant Application Pipeline">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {crmError ? <Alert type="error" showIcon message="Unable to create application user" description={crmError} /> : null}

          <div className="grant-application-toolbar">
            <Input.Search
              placeholder="Search applicant, agency, state, or grant focus"
              allowClear
              value={applicationSearchText}
              onChange={(event) => setApplicationSearchText(event.target.value)}
            />
            <Space wrap className="rfp-selection-actions">
              {selectedApplicationKeys.length ? (
                <>
                  <Tag color="blue">{selectedApplicationKeys.length} selected</Tag>
                  <Popconfirm
                    title="Delete selected grant applications?"
                    description="This removes the selected application profiles from your pipeline."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                    onConfirm={() => void deleteSelectedApplications()}
                  >
                    <Button danger loading={isDeletingApplications}>Delete</Button>
                  </Popconfirm>
                </>
              ) : null}
              <Button type="primary" onClick={() => setIsApplicationModalOpen(true)}>
                New Application User
              </Button>
            </Space>
          </div>

          {isLoadingApplications ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <Table<User>
              rowKey="_id"
              dataSource={visibleApplicationUsers}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 1080 }}
              rowClassName="grant-application-row"
              rowSelection={{
                selectedRowKeys: selectedApplicationKeys,
                onChange: (keys) => setSelectedApplicationKeys(keys.map(String)),
              }}
              locale={{ emptyText: 'No grant applications yet. Create the first application user.' }}
              columns={[
                {
                  title: 'Application',
                  dataIndex: 'name',
                  key: 'name',
                  width: 340,
                  render: (name: string, user) => (
                    <Space direction="vertical" size={4} className="rfp-opportunity-cell">
                      <Link to={`/police-grants/${user._id}`} className="rfp-opportunity-link">
                        <Text strong>{user.agencyName || name}</Text>
                      </Link>
                      <Text type="secondary" className="rfp-agency-text">
                        {name} · {user.email}
                      </Text>
                    </Space>
                  ),
                },
                {
                  title: 'Type',
                  dataIndex: 'userType',
                  key: 'userType',
                  width: 140,
                  render: (userType: User['userType']) => userTypeLabels[userType],
                },
                {
                  title: 'Location',
                  key: 'location',
                  width: 150,
                  render: (_, user) => [user.city, user.state].filter(Boolean).join(', ') || 'Unknown',
                },
                {
                  title: 'Grant Focus',
                  dataIndex: 'grantProjectFocus',
                  key: 'grantProjectFocus',
                  width: 260,
                  render: (focus: string) => focus || 'Not set',
                },
                {
                  title: 'Stage',
                  key: 'stage',
                  width: 130,
                  render: () => <Tag color="blue">Discovery</Tag>,
                },
                {
                  title: 'Updated',
                  dataIndex: 'updatedAt',
                  key: 'updatedAt',
                  width: 130,
                  render: (value: string) => new Date(value).toLocaleDateString(),
                },
                {
                  title: 'Action',
                  key: 'open',
                  width: 160,
                  render: (_, user) => (
                    <Button
                      type="primary"
                      className="rfp-open-button"
                      onClick={() => {
                        setSelectedUserId(user._id)
                        setState(user.state || state)
                        setAgencyType(user.agencyType || agencyType)
                        setProjectType(user.grantProjectFocus || projectType)
                        navigate(`/police-grants/${user._id}`)
                      }}
                    >
                      Open Intel
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Space>
      </Card>

      <Modal
        title="New application user"
        open={isApplicationModalOpen}
        onCancel={() => {
          setIsApplicationModalOpen(false)
          applicationForm.resetFields()
        }}
        footer={null}
        width={820}
        destroyOnHidden
      >
        <Form
          form={applicationForm}
          layout="vertical"
          initialValues={{
            userType: 'police_officer',
            agencyType: 'Police department',
            grantProjectFocus: 'Body cameras and digital evidence storage',
          }}
          onFinish={handleCreateApplicationUser}
        >
          <div className="admin-form-grid">
            <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required.' }]}>
              <Input placeholder="Alex Carter" />
            </Form.Item>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Email is required.' },
                { type: 'email', message: 'Enter a valid email address.' },
              ]}
            >
              <Input placeholder="alex@ashtoncity.gov" />
            </Form.Item>
            <Form.Item label="Role" name="title" rules={[{ required: true, message: 'Role is required.' }]}>
              <Input placeholder="Police officer" />
            </Form.Item>
            <Form.Item label="User type" name="userType" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'police_officer', label: 'Police officer' },
                  { value: 'firefighter', label: 'Firefighter' },
                  { value: 'agency_admin', label: 'Agency admin' },
                  { value: 'non_trusted_employee', label: 'External reviewer' },
                  { value: 'trusted_employee', label: 'Trusted employee' },
                ]}
              />
            </Form.Item>
            <Form.Item label="Agency" name="agencyName" rules={[{ required: true, message: 'Agency is required.' }]}>
              <Input placeholder="Ashton City PD" />
            </Form.Item>
            <Form.Item label="Agency type" name="agencyType" rules={[{ required: true }]}>
              <Input placeholder="Police department" />
            </Form.Item>
            <Form.Item label="City" name="city" rules={[{ required: true, message: 'City is required.' }]}>
              <Input placeholder="Ashton City" />
            </Form.Item>
            <Form.Item label="State" name="state" rules={[{ required: true, message: 'State is required.' }]}>
              <Input placeholder="TX" maxLength={2} />
            </Form.Item>
          </div>

          <Form.Item
            label="Grant project focus"
            name="grantProjectFocus"
            rules={[{ required: true, message: 'Grant project focus is required.' }]}
          >
            <Input placeholder="Body cameras and digital evidence storage" />
          </Form.Item>
          <Form.Item label="Known agency needs" name="knownNeeds">
            <TextArea rows={3} placeholder="Replace aging cameras, reduce evidence handling burden, improve transparency..." />
          </Form.Item>
          <Form.Item label="Grant requirements" name="grantRequirements">
            <TextArea rows={4} placeholder="Paste eligibility, narrative questions, match requirements, deadline, and required attachments." />
          </Form.Item>

          <Space>
            <Button onClick={() => setIsApplicationModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={isSavingApplicationUser}>
              Create application user
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  )

  const discoveryPanel = (
    <Card className="section-card" title="Grant Discovery">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Use OpenClaw Browser to scan public grant pages, save likely opportunities, and make them available to the drafting chat.
        </Text>

        {searchError ? <Alert type="error" showIcon message="Grant search failed" description={searchError} /> : null}
        {searchNotice ? <Alert type="success" showIcon message="Grant search complete" description={searchNotice} /> : null}

        <div className="grant-discovery-builder">
          <Input value={state} onChange={(event) => setState(event.target.value)} placeholder="State, e.g. Texas" />
          <Input value={agencyType} onChange={(event) => setAgencyType(event.target.value)} placeholder="Agency type" />
          <Input value={projectType} onChange={(event) => setProjectType(event.target.value)} placeholder="Project type" />
          <Input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Keywords, comma separated" />
          <Button type="primary" onClick={() => void handleSearch()} loading={isSearching}>
            Find Available Grants
          </Button>
        </div>

        <List
          locale={{ emptyText: 'No saved grant opportunities yet.' }}
          dataSource={opportunities.slice(0, 6)}
          renderItem={(opportunity) => (
            <List.Item>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space wrap>
                  <Text strong>{opportunity.title}</Text>
                  <Tag color={opportunity.fitScore >= 70 ? 'green' : opportunity.fitScore >= 50 ? 'gold' : 'default'}>
                    Fit {opportunity.fitScore}
                  </Tag>
                  {opportunity.deadline ? <Tag>{opportunity.deadline}</Tag> : null}
                </Space>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  {opportunity.summary || 'Captured from source page; review source text before final drafting.'}
                </Paragraph>
                <a href={opportunity.applicationUrl || opportunity.sourceUrl} target="_blank" rel="noreferrer">
                  {opportunity.sourceAgency || 'Grant source'}
                </a>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  )

  const workspaceHeader = selectedUser ? (
    <Card className="section-card grant-application-context">
      <div className="grant-application-context-row">
        <div>
          <Text type="secondary">Application Workspace</Text>
          <h2>{selectedUser.agencyName || selectedUser.name}</h2>
          <p>
            {selectedUser.title || userTypeLabels[selectedUser.userType]} ·{' '}
            {[selectedUser.city, selectedUser.state].filter(Boolean).join(', ') || 'Location not set'} ·{' '}
            {selectedUser.grantProjectFocus || 'Grant focus not set'}
          </p>
        </div>
        <Link to="/grant-applications">Back to CRM</Link>
      </div>
    </Card>
  ) : null

  return (
    <AgentChatWorkspace
      agentId="grant-application-agent"
      title={isApplicationWorkspace && selectedUser ? `${selectedUser.agencyName || selectedUser.name} Grant Application` : 'Grant Application Admin Panel'}
      subtitle={isApplicationWorkspace
        ? 'Find available grants and draft application responses for this applicant.'
        : 'Manage the application users you created for grant drafting.'}
      intro="Give the agent an agency, grant notice, product focus, or SAE discovery notes. It will assess grant fit, separate facts from assumptions, and draft editable application sections with missing-info placeholders."
      emptyPrompt='Try: "Draft a grant application packet for a small police department seeking body cameras and evidence storage. Here is the grant notice..."'
      showAgentOverview={false}
      showChatWorkspace={isApplicationWorkspace && Boolean(selectedUser)}
      chatTitle="Grant Application Drafting"
      renderBeforeChat={
        <>
          {isApplicationWorkspace ? workspaceHeader : crmPanel}
          {isApplicationWorkspace && selectedUser ? discoveryPanel : null}
        </>
      }
      buildMessageContext={buildGrantContext}
    />
  )
}
