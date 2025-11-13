export interface Chat {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatListItem {
  id: string
  title: string
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface Message {
  id: string
  chat_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls: string | null
  tool_call_id: string | null
  name: string | null
  reasoning: string | null
  created_at: string
}

