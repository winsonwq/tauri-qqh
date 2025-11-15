import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Chat, ChatListItem, Message as ChatMessage } from '../models'
import { convertChatMessageToAIMessage, AIMessage } from '../utils/aiMessageUtils'
import { useMessage } from '../componets/Toast'

export function useChatManagement() {
  const message = useMessage()
  const [currentChat, setCurrentChat] = useState<Chat | null>(null)
  const [chatList, setChatList] = useState<ChatListItem[]>([])
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const historyDropdownRef = useRef<HTMLDivElement>(null)
  const [initialMessages, setInitialMessages] = useState<AIMessage[]>([])

  // 加载 chat 列表
  const loadChatList = useCallback(async () => {
    try {
      const chats = await invoke<ChatListItem[]>('get_all_chats')
      setChatList(chats)
    } catch (err) {
      console.error('加载 chat 列表失败:', err)
    }
  }, [])

  // 创建新 chat
  const handleCreateChat = useCallback(async () => {
    try {
      const newChat = await invoke<Chat>('create_chat', { title: '' })
      setCurrentChat(newChat)
      // 清空消息
      setInitialMessages([])
      await loadChatList()
      return newChat
    } catch (err) {
      console.error('创建 chat 失败:', err)
      message.error('创建对话失败')
      throw err
    }
  }, [loadChatList, message])

  // 切换 chat
  const handleSwitchChat = useCallback(
    async (chatId: string): Promise<AIMessage[]> => {
      try {
        const chat = await invoke<Chat | null>('get_chat', { chatId })
        if (!chat) {
          message.error('Chat 不存在')
          return []
        }

        setCurrentChat(chat)

        // 加载消息
        const dbMessages = await invoke<ChatMessage[]>('get_messages_by_chat', { chatId })

        // 转换消息格式
        const convertedMessages = dbMessages.map(convertChatMessageToAIMessage)

        // 更新 initialMessages，以便 AIPanel 可以获取到
        setInitialMessages(convertedMessages)

        setShowHistoryDropdown(false)
        return convertedMessages
      } catch (err) {
        console.error('切换 chat 失败:', err)
        message.error('切换对话失败')
        return []
      }
    },
    [message],
  )

  // 初始化：加载最后一个 chat，如果没有则创建新 chat
  useEffect(() => {
    const initChat = async () => {
      if (!currentChat) {
        // 先加载 chat 列表
        try {
          const chats = await invoke<ChatListItem[]>('get_all_chats')
          setChatList(chats)

          // 如果有 chat，加载最新的（第一个）
          if (chats.length > 0) {
            const chatId = chats[0].id
            try {
              const chat = await invoke<Chat | null>('get_chat', { chatId })
              if (chat) {
                setCurrentChat(chat)

                // 加载消息
                const dbMessages = await invoke<ChatMessage[]>('get_messages_by_chat', { chatId })

                // 转换消息格式
                const convertedMessages = dbMessages.map(convertChatMessageToAIMessage)
                setInitialMessages(convertedMessages)
                return convertedMessages
              }
            } catch (err) {
              console.error('加载 chat 失败:', err)
              // 如果加载失败，创建新 chat
              try {
                const newChat = await invoke<Chat>('create_chat', { title: '' })
                setCurrentChat(newChat)
                const updatedChats = await invoke<ChatListItem[]>('get_all_chats')
                setChatList(updatedChats)
              } catch (createErr) {
                console.error('创建 chat 失败:', createErr)
                message.error('创建对话失败')
              }
            }
          } else {
            // 如果没有 chat，创建新 chat
            try {
              const newChat = await invoke<Chat>('create_chat', { title: '' })
              setCurrentChat(newChat)
            } catch (err) {
              console.error('创建 chat 失败:', err)
              message.error('创建对话失败')
            }
          }
        } catch (err) {
          console.error('初始化 chat 失败:', err)
          // 如果加载失败，尝试创建新 chat
          try {
            const newChat = await invoke<Chat>('create_chat', { title: '' })
            setCurrentChat(newChat)
          } catch (createErr) {
            console.error('创建 chat 失败:', createErr)
            message.error('创建对话失败')
          }
        }
      }
    }
    initChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击外部关闭 dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(event.target as Node)
      ) {
        setShowHistoryDropdown(false)
      }
    }

    if (showHistoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showHistoryDropdown])

  return {
    currentChat,
    setCurrentChat,
    chatList,
    showHistoryDropdown,
    setShowHistoryDropdown,
    historyDropdownRef,
    loadChatList,
    handleCreateChat,
    handleSwitchChat,
    initialMessages,
  }
}

