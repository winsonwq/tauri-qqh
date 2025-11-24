import React, { useState } from 'react'
import { HiCheckCircle, HiXCircle, HiArrowRight, HiChevronDown, HiChevronUp } from 'react-icons/hi2'
import { Todo } from '../core/types'
import Tooltip from './Tooltip'

// 简单的圆圈图标组件
const CircleIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`w-4 h-4 rounded-full border-1 flex-shrink-0 ${className}`} />
)

// 执行中的圆圈图标（圆圈内带右箭头）
const ExecutingIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`w-4 h-4 rounded-full border-1 border-base-content/40 flex-shrink-0 flex items-center justify-center ${className}`}>
    <HiArrowRight className="w-3 h-3 text-base-content/70" />
  </div>
)

interface TodoListProps {
  todos: Todo[]
  title?: string
  collapseCompleted?: boolean // 是否折叠已完成的任务，默认为 true
}

const TodoList: React.FC<TodoListProps> = ({ todos, title, collapseCompleted = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapseCompleted)

  if (!Array.isArray(todos) || todos.length === 0) {
    return null
  }

  const displayTitle = title || `任务列表 (${todos.length})`

  // 分离已完成的任务和未完成的任务
  const completedTodos = todos.filter(todo => todo.status === 'completed')
  const visibleTodos = todos.filter(todo => todo.status !== 'completed')
  
  // 如果有已完成的任务且允许折叠，则显示折叠按钮
  const shouldCollapse = collapseCompleted && completedTodos.length > 0

  // 渲染单个 todo item
  const renderTodoItem = (todo: Todo, index: number, originalIndex?: number) => {
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
      StatusIcon = ExecutingIcon
      iconColor = ''
      textColor = 'text-base-content'
    } else {
      StatusIcon = CircleIcon
      iconColor = 'border-base-content/40'
      textColor = 'text-base-content'
    }

    return (
      <div
        key={todo.id || originalIndex || index}
        className="todo-item flex items-center gap-2 py-1"
      >
        {status === 'pending' ? (
          <CircleIcon className={`${iconColor}`} />
        ) : status === 'executing' ? (
          <ExecutingIcon className={iconColor} />
        ) : (
          <StatusIcon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
        )}
        {/* 任务描述 */}
        <Tooltip
          content={
            <div className="max-w-xs p-2">
              <div className="text-xs font-medium mb-1">
                {todo.description || todo.id || `任务 ${(originalIndex ?? index) + 1}`}
              </div>
              {todo.result && (
                <div className="text-xs opacity-90">
                  {typeof todo.result === 'string' 
                    ? todo.result 
                    : typeof todo.result === 'object'
                    ? JSON.stringify(todo.result, null, 2)
                    : String(todo.result)}
                </div>
              )}
            </div>
          }
          position="top"
          className="w-full min-w-0"
        >
          <div className={`text-sm ${textColor} truncate block`}>
            {todo.description || todo.id || `任务 ${(originalIndex ?? index) + 1}`}
          </div>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="todos-section border border-base-300 rounded-lg p-2 bg-base-200">
      <div className="text-xs font-semibold text-base-content/70 mb-2">
        {displayTitle}
      </div>
      <div>
        {/* 折叠的部分：所有已完成的任务 */}
        {shouldCollapse && (
          <>
            {!isCollapsed && (
              <div className="collapsed-todos">
                {completedTodos.map((todo, index) => {
                  // 找到原始索引
                  const originalIndex = todos.findIndex(t => t.id === todo.id)
                  return renderTodoItem(todo, index, originalIndex)
                })}
              </div>
            )}
            <div
              className="collapse-toggle flex items-center gap-2 py-1 cursor-pointer hover:bg-base-300/50 rounded px-1 -mx-1"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <HiChevronDown className="w-4 h-4 text-base-content/60" />
              ) : (
                <HiChevronUp className="w-4 h-4 text-base-content/60" />
              )}
              <span className="text-xs text-base-content/60">
                {isCollapsed 
                  ? `已折叠 ${completedTodos.length} 个已完成的任务` 
                  : `展开 ${completedTodos.length} 个已完成的任务`}
              </span>
            </div>
          </>
        )}

        {/* 显示的部分：未完成的任务（pending, executing, failed）和当前任务 */}
        {visibleTodos.map((todo, index) => {
          // 找到原始索引
          const originalIndex = todos.findIndex(t => t.id === todo.id)
          return renderTodoItem(todo, index, originalIndex)
        })}
        
        {/* 如果不折叠已完成的任务，直接显示所有已完成的任务 */}
        {!shouldCollapse && completedTodos.map((todo, index) => {
          // 找到原始索引
          const originalIndex = todos.findIndex(t => t.id === todo.id)
          return renderTodoItem(todo, index, originalIndex)
        })}
      </div>
    </div>
  )
}

export default TodoList

