import { ToolCall } from '../components/AI/ToolCallConfirmModal'
import { Message as ChatMessage } from '../models'
import { AgentType, AgentAction } from '../agents/agentTypes'
import { parsePartialJson } from './partialJsonParser'

export interface CacheControl {
  type: 'ephemeral'
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
  pendingToolCalls?: ToolCall[] // 待确认的工具调用
  agentType?: AgentType // agent 类型（planner/executor/verifier）
  action?: AgentAction // agent 行为类型
  cache_control?: CacheControl // 缓存控制（用于 OpenRouter 等支持 prompt caching 的提供商）
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
 * 自动为 tool 消息添加 cache_control（用于 OpenRouter prompt caching）
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

  // 为 tool 消息自动添加 cache_control
  // 即使消息来自数据库，也需要在发送给 AI 时添加缓存标记
  const cache_control = msg.role === 'tool' 
    ? { type: 'ephemeral' as const } 
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
    cache_control,
  }
}

/**
 * 将 AIMessage 数组转换为 API 消息格式
 * 会验证 tool 消息的 tool_call_id 是否在之前的 assistant 消息中有对应的 tool_calls
 * 并为 tool 消息自动添加 cache_control（用于 OpenRouter 等支持 prompt caching 的提供商）
 */
export function convertAIMessagesToChatMessages(messages: AIMessage[]) {
  // 按顺序收集有效的 tool_call IDs（只收集在当前消息之前的）
  const validToolCallIds = new Set<string>()
  const result: Array<{
    role: string
    content: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
    name?: string
    cache_control?: CacheControl
  }> = []
  
  for (const m of messages) {
    // 过滤角色
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool') {
      continue
    }
    
    // 对于 assistant 消息，先收集其 tool_calls 的 ID（无论 content 是否为空）
    if (m.role === 'assistant' && m.tool_calls) {
      for (const toolCall of m.tool_calls) {
        if (toolCall.id) {
          validToolCallIds.add(toolCall.id)
        }
      }
    }
    
    // 对于 tool 角色的消息，验证其 tool_call_id 是否在之前的消息中有对应的 tool_calls
    if (m.role === 'tool' && m.tool_call_id) {
      if (!validToolCallIds.has(m.tool_call_id)) {
        console.warn(
          `[convertAIMessagesToChatMessages] 过滤掉无效的 tool 消息: tool_call_id=${m.tool_call_id} 在之前的消息中没有对应的 tool_calls`
        )
        continue
      }
    }
    
    // 过滤掉 content 为空或只包含空白字符的消息
    // 注意：assistant 消息即使 content 为空，如果有 tool_calls 也需要保留
    const hasContent = m.content && m.content.trim().length > 0
    const hasToolCalls = m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0
    
    if (!hasContent && !hasToolCalls) {
      continue
    }
    
    // 为 tool 消息自动添加 cache_control
    // 根据 OpenRouter 最佳实践，工具结果应该使用 ephemeral 缓存
    const cache_control = m.role === 'tool' ? { type: 'ephemeral' as const } : undefined
    
    result.push({
      role: m.role,
      content: m.content || '', // 如果没有 content，使用空字符串
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id,
      name: m.name,
      cache_control,
    })
  }
  
  return result
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

