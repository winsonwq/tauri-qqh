import { useState, useEffect, useRef, useCallback } from 'react'
import { AIMessage } from '../utils/aiMessageUtils'

export function useStickyMessages(
  messages: AIMessage[],
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  chatBarHeight: number,
) {
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 注册消息元素的 ref
  const setMessageRef = useCallback((messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element)
    } else {
      messageRefs.current.delete(messageId)
    }
  }, [])

  // 检测 sticky 状态：只保留最后一个进入 sticky 状态的 user 消息
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === 'user')
    if (userMessages.length === 0) {
      setStickyMessageId(null)
      console.log('[AIPanel] Sticky Message ID: null (no user messages)')
      return
    }

    // 检测哪些消息在视口顶部
    const checkStickyMessages = () => {
      const stickyIds: string[] = []
      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return

      // 获取滚动容器的位置
      const containerRect = scrollContainer.getBoundingClientRect()
      const containerTop = containerRect.top

      messageRefs.current.forEach((element, messageId) => {
        const message = messages.find((m) => m.id === messageId)
        if (message && message.role === 'user') {
          const rect = element.getBoundingClientRect()
          // 如果消息的顶部在滚动容器顶部或上方，且底部在滚动容器内，则认为它应该 sticky
          if (rect.top <= containerTop && rect.bottom > containerTop) {
            stickyIds.push(messageId)
          }
        }
      })

      // 只保留最后一个 sticky 的消息（按消息顺序）
      if (stickyIds.length > 0) {
        const sortedStickyIds = stickyIds.sort((a, b) => {
          const indexA = messages.findIndex((m) => m.id === a)
          const indexB = messages.findIndex((m) => m.id === b)
          return indexA - indexB
        })
        const newStickyId = sortedStickyIds[sortedStickyIds.length - 1]
        if (newStickyId !== stickyMessageId) {
          setStickyMessageId(newStickyId)
          console.log('[AIPanel] Sticky Message ID updated to:', newStickyId)
        }
      } else if (stickyMessageId !== null) {
        setStickyMessageId(null)
        console.log('[AIPanel] Sticky Message ID updated to: null (no sticky messages)')
      }
    }

    // 使用 scroll 事件来检测
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', checkStickyMessages)
      // 初始检查
      setTimeout(checkStickyMessages, 0)

      return () => {
        scrollContainer.removeEventListener('scroll', checkStickyMessages)
      }
    }
  }, [messages, chatBarHeight, stickyMessageId, scrollContainerRef])

  return {
    stickyMessageId,
    setMessageRef,
  }
}

