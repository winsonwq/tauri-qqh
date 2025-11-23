import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { Message as ChatMessage } from '../models'
import { AgentType, AgentAction } from '../agents/agentTypes'
import { parsePartialJson } from './partialJsonParser'

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
  agentType?: AgentType // agent 类型（planner/executor/verifier）
  action?: AgentAction // agent 行为类型
}

/**
 * 生成唯一事件 ID
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * 从消息内容推断 agentType
 */
function inferAgentTypeFromContent(content: string): AgentType | undefined {
  if (!content || typeof content !== 'string') {
    return undefined
  }

  // 尝试提取 JSON 部分
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return undefined
  }

  try {
    // 尝试解析为 PlannerResponse
    const plannerData = parsePartialJson<{ todos?: any[]; needsMorePlanning?: boolean }>(jsonMatch[0])
    if (plannerData?.data && (plannerData.data.todos || plannerData.data.needsMorePlanning !== undefined)) {
      return 'planner'
    }

    // 尝试解析为 VerifierResponse
    const verifierData = parsePartialJson<{ tasks?: any[]; allCompleted?: boolean }>(jsonMatch[0])
    if (verifierData?.data && (verifierData.data.tasks || verifierData.data.allCompleted !== undefined)) {
      return 'verifier'
    }
  } catch {
    // 解析失败，返回 undefined
  }

  return undefined
}

/**
 * 将数据库消息格式转换为前端 AIMessage 格式
 */
export function convertChatMessageToAIMessage(msg: ChatMessage): AIMessage {
  let tool_calls: ToolCall[] | undefined
  if (msg.tool_calls) {
    try {
      tool_calls = JSON.parse(msg.tool_calls) as ToolCall[]
    } catch {
      tool_calls = undefined
    }
  }

  // 从内容推断 agentType（仅对 assistant 消息）
  const agentType = msg.role === 'assistant' 
    ? inferAgentTypeFromContent(msg.content)
    : undefined

  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'tool',
    content: msg.content,
    timestamp: new Date(msg.created_at),
    tool_calls,
    tool_call_id: msg.tool_call_id || undefined,
    name: msg.name || undefined,
    reasoning: msg.reasoning || undefined,
    agentType,
  }
}

/**
 * 将 AIMessage 数组转换为 API 消息格式
 */
export function convertAIMessagesToChatMessages(messages: AIMessage[]) {
  return messages
    .filter((m) => {
      // 过滤角色
      if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') {
        return false
      }
      // 过滤掉 content 为空或只包含空白字符的消息
      if (!m.content || m.content.trim().length === 0) {
        return false
      }
      return true
    })
    .map((m) => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id,
      name: m.name,
    }))
}

/**
 * 格式化时间显示
 */
export function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  try {
    const date = new Date(timeStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return '昨天'
    } else if (days < 7) {
      return `${days} 天前`
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  } catch {
    return ''
  }
}

