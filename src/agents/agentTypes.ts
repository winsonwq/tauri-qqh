/**
 * Agent 类型定义
 */

export type AgentType = 'planner' | 'executor' | 'verifier'

export interface AgentPrompt {
  type: AgentType
  content: string
}

export interface Todo {
  id: string
  description: string
  priority: number
  status: 'pending' | 'executing' | 'completed' | 'failed'
  result?: string
}

export interface PlannerResponse {
  needsMorePlanning: boolean
  todos: Todo[]
  summary: string
}

export interface VerifierResponse {
  allCompleted: boolean
  tasks: Array<{
    id: string
    completed: boolean
    feedback: string
  }>
  overallFeedback: string
}

