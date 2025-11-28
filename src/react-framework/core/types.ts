/**
 * ReAct Framework 核心类型定义
 */

/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * ReAct Agent 元数据，用于判断是否需要继续执行
 */
export interface AgentMeta {
  shouldContinue: boolean // 是否需要继续执行
  reason?: string // 选择这个行动的原因
}

/**
 * ReAct 循环阶段
 */
export type ReActPhase = 'idle' | 'thought' | 'action' | 'observation'

/**
 * 工具信息接口
 */
export interface ToolInfo {
  name: string
  description: string
}

/**
 * AI 消息接口（与 agent-framework 兼容）
 */
export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string // tool name
  reasoning?: string // thinking/reasoning 内容
  pendingToolCalls?: ToolCall[] // 待确认的工具调用
  agentType?: string // agent 类型（兼容 agent-framework）
  action?: string // agent 行为类型（兼容 agent-framework）
}

/**
 * AI 调用结果
 */
export interface AICallResult {
  content: string
  toolCalls?: ToolCall[]
  reasoning?: string
}

