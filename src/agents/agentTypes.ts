/**
 * Agent 类型定义
 */

export type AgentType = 'planner' | 'executor' | 'verifier'

/**
 * Agent 行为类型
 */
export type AgentAction = 
  | 'thinking'      // 思考中
  | 'planning'       // 规划中
  | 'calling_tool'   // 调用工具中
  | 'exploring'      // 探索中
  | 'verifying'      // 验证中
  | 'summarizing'    // 总结中

/**
 * 行为显示文本映射（进行时/过去时）
 */
export const actionDisplayMap: Record<AgentAction, { present: string; past: string }> = {
  thinking: { present: '思考中', past: '已思考' },
  planning: { present: '规划中', past: '已规划' },
  calling_tool: { present: '调用工具中', past: '已调用工具' },
  exploring: { present: '探索中', past: '已探索' },
  verifying: { present: '验证中', past: '已验证' },
  summarizing: { present: '总结中', past: '已总结' },
}

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
  type?: 'component'
  component?: string
  needsMorePlanning: boolean
  todos: Todo[]
  summary: string
}

export interface VerifierResponse {
  type?: 'component'
  component?: string
  allCompleted: boolean
  tasks: Array<{
    id: string
    completed: boolean
    feedback: string
  }>
  overallFeedback: string
}

