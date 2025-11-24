
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
  isCurrent?: boolean  // 标记当前正在处理的任务
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

export interface ExecutorResponse {
  type?: 'component'
  component?: string
  summary: string
  todos: Todo[]
  // 流程控制字段（由 AI 决定执行流程）
  taskCompleted?: boolean  // 当前任务是否已完成
  shouldContinue?: boolean  // 是否需要继续执行（如果任务未完成但需要更多轮次）
  nextAction?: 'continue' | 'complete' | 'skip' | 'retry'  // 下一步动作
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string // tool name
  reasoning?: string // thinking/reasoning 内容
  agentType?: AgentType // agent 类型（planner/executor/verifier）
  action?: AgentAction // agent 行为类型
}

