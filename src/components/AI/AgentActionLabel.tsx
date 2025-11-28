import React from 'react'
import { AgentAction, actionDisplayMap } from '../../agents/agentTypes'

interface AgentActionLabelProps {
  action: AgentAction
  isActive: boolean // 是否正在进行中（流式输出中）
}

/**
 * Agent 行为标签组件
 * 根据 isActive 状态显示进行时或过去时
 */
export const AgentActionLabel: React.FC<AgentActionLabelProps> = ({
  action,
  isActive,
}) => {
  const displayText = isActive
    ? actionDisplayMap[action].present
    : actionDisplayMap[action].past

  return (
    <div className="text-xs text-base-content/40">
      {displayText}
    </div>
  )
}

