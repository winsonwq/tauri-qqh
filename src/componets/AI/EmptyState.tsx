import React from 'react'

export const EmptyState: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full text-base-content/60 p-4">
      <div className="text-center">
        <p className="text-lg mb-2">开始对话</p>
        <p className="text-sm">输入消息开始与 AI 对话</p>
      </div>
    </div>
  )
}

