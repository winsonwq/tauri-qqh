import React from 'react'
import { HiPlus, HiClock } from 'react-icons/hi2'
import { FaMagic } from 'react-icons/fa'
import Tooltip from '../Tooltip'
import { Chat, ChatListItem } from '../../models'
import { formatTime } from '../../utils/aiMessageUtils'

interface ChatBarProps {
  currentChat: Chat | null
  chatList: ChatListItem[]
  showHistoryDropdown: boolean
  historyDropdownRef: React.RefObject<HTMLDivElement | null>
  messagesCount: number
  onToggleHistory: () => void
  onCreateChat: () => void
  onSwitchChat: (chatId: string) => void
  onSummarizeTitle: () => void
}

export const ChatBar: React.FC<ChatBarProps> = ({
  currentChat,
  chatList,
  showHistoryDropdown,
  historyDropdownRef,
  messagesCount,
  onToggleHistory,
  onCreateChat,
  onSwitchChat,
  onSummarizeTitle,
}) => {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-200">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {currentChat?.title || '新对话'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {currentChat && messagesCount > 0 && (
          <Tooltip content="使用 AI 生成标题" position="bottom">
            <button
              className="btn btn-xs btn-ghost btn-square"
              onClick={onSummarizeTitle}
            >
              <FaMagic className="h-4 w-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip content="新建对话" position="bottom">
          <button className="btn btn-xs btn-ghost btn-square" onClick={onCreateChat}>
            <HiPlus className="h-4 w-4" />
          </button>
        </Tooltip>
        <div className="relative" ref={historyDropdownRef}>
          <Tooltip content="历史记录" position="bottom">
            <button
              className="btn btn-xs btn-ghost btn-square"
              onClick={onToggleHistory}
            >
              <HiClock className="h-4 w-4" />
            </button>
          </Tooltip>
          {showHistoryDropdown && (
            <ul className="absolute right-0 top-full mt-1 bg-base-100 rounded-box z-[100] w-64 p-2 shadow-lg border border-base-300 max-h-96 overflow-y-auto">
              {chatList.length === 0 ? (
                <li className="px-4 py-2 text-sm text-base-content/50">暂无历史记录</li>
              ) : (
                chatList.map((chat) => (
                  <li key={chat.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded hover:bg-base-200 transition-colors ${
                        currentChat?.id === chat.id ? 'bg-base-200' : ''
                      }`}
                      onClick={() => onSwitchChat(chat.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{chat.title}</div>
                        {chat.last_message_at && (
                          <div className="text-xs text-base-content/60">
                            {formatTime(chat.last_message_at)}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

