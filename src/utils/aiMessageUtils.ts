import { ToolCall } from '../componets/AI/ToolCallConfirmModal'
import { Message as ChatMessage } from '../models'

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
}

/**
 * 生成唯一事件 ID
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
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

  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'tool',
    content: msg.content,
    timestamp: new Date(msg.created_at),
    tool_calls,
    tool_call_id: msg.tool_call_id || undefined,
    name: msg.name || undefined,
    reasoning: msg.reasoning || undefined,
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

