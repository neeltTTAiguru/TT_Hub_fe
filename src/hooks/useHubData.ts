import { useEffect, useState } from 'react'
import {
  getAgents,
  getCompanyContext,
  getCompetitors,
  getResearchRuns,
  type AgentSummary,
  type CompanyContext,
  type Competitor,
  type ResearchRun,
} from '../lib/api'

type HubDataState = {
  agents: AgentSummary[]
  companyContext: CompanyContext | null
  competitors: Competitor[]
  researchRuns: ResearchRun[]
  isLoading: boolean
  error: string
}

const initialState: HubDataState = {
  agents: [],
  companyContext: null,
  competitors: [],
  researchRuns: [],
  isLoading: true,
  error: '',
}

export function useHubData() {
  const [state, setState] = useState<HubDataState>(initialState)

  const load = async () => {
    setState((current) => ({ ...current, isLoading: true, error: '' }))

    try {
      const [agents, companyContext, competitors, researchRuns] = await Promise.all([
        getAgents(),
        getCompanyContext(),
        getCompetitors(),
        getResearchRuns(),
      ])

      setState({
        agents,
        companyContext,
        competitors,
        researchRuns,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load hub data.',
      }))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return {
    ...state,
    refresh: load,
  }
}
