import React from 'react'
import { HiCheckCircle, HiXCircle, HiExclamationCircle } from 'react-icons/hi2'
import { Todo } from '../../../agents/agentTypes'
import Tooltip from '../../Tooltip'

// 简单的圆圈图标组件
const CircleIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`w-4 h-4 rounded-full border-1 flex-shrink-0 ${className}`} />
)

interface TodoListProps {
  todos: Todo[]
  title?: string
}

const TodoList: React.FC<TodoListProps> = ({ todos, title }) => {
  if (!Array.isArray(todos) || todos.length === 0) {
    return null
  }

  const displayTitle = title || `任务列表 (${todos.length})`

  return (
    <div className="todos-section border border-base-300 rounded-lg p-2 bg-base-100">
      <div className="text-xs font-semibold text-base-content/70 mb-2">
        {displayTitle}
      </div>
      <div>
        {todos.map((todo, index) => {
          if (!todo || typeof todo !== 'object') return null

          const status = todo.status || 'pending'

          // 根据状态选择图标和样式
          let StatusIcon: React.ComponentType<{ className?: string }>
          let iconColor: string
          let textColor: string

          if (status === 'completed') {
            StatusIcon = HiCheckCircle
            iconColor = 'text-success'
            textColor = 'text-base-content/60 line-through'
          } else if (status === 'failed') {
            StatusIcon = HiXCircle
            iconColor = 'text-error'
            textColor = 'text-base-content'
          } else if (status === 'executing') {
            StatusIcon = HiExclamationCircle
            iconColor = 'text-warning'
            textColor = 'text-base-content'
          } else {
            StatusIcon = CircleIcon
            iconColor = 'border-base-content/40'
            textColor = 'text-base-content'
          }

          return (
            <div
              key={todo.id || index}
              className="todo-item flex items-center gap-2 py-1"
            >
              {status === 'pending' ? (
                <CircleIcon className={`${iconColor}`} />
              ) : (
                <StatusIcon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
              )}
              {/* 任务描述 */}
              <Tooltip
                content={
                  <div className="max-w-xs p-2">
                    <div className="text-xs font-medium mb-1">
                      {todo.description || todo.id || `任务 ${index + 1}`}
                    </div>
                    {todo.result && (
                      <div className="text-xs opacity-90">{todo.result}</div>
                    )}
                  </div>
                }
                position="top"
                className="w-full min-w-0"
              >
                <div className={`text-sm ${textColor} truncate block`}>
                  {todo.description || todo.id || `任务 ${index + 1}`}
                </div>
              </Tooltip>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TodoList
