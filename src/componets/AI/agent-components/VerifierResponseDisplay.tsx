import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ComponentProps } from '../ComponentRegistry'
import { parsePartialJson } from '../../../utils/partialJsonParser'
import { VerifierResponse, Todo } from '../../../agents/agentTypes'
import { markdownComponents } from '../MarkdownComponents'
import TodoList from './TodoList'

interface VerifierResponseDisplayProps {
  props: ComponentProps
}

const VerifierResponseDisplay: React.FC<VerifierResponseDisplayProps> = ({
  props,
}) => {
  const { content } = props
  const existingConfig = (props as any).config
  // 使用 useMemo 稳定 plannerTodos 的引用
  const plannerTodos = useMemo(() => {
    return existingConfig?.plannerTodos as Todo[] | undefined
  }, [existingConfig?.plannerTodos])

  // 解析 JSON
  const parsed = useMemo(() => {
    try {
      return parsePartialJson<VerifierResponse>(content)
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: null as VerifierResponse | null,
        isValid: false,
      }
    }
  }, [content])

  const { data } = parsed

  const todos: Todo[] = useMemo(() => {
    if (!data || !data.tasks || !Array.isArray(data.tasks)) {
      return []
    }
    return data.tasks.map((task) => {
      const status: Todo['status'] = task.completed ? 'completed' : 'failed'
      let description = task.id || '任务'
      if (plannerTodos && Array.isArray(plannerTodos)) {
        const plannerTodo = plannerTodos.find((t) => t.id === task.id)
        if (plannerTodo && plannerTodo.description) {
          description = plannerTodo.description
        }
      }
      // 安全地处理 task.feedback：如果是对象，转换为 JSON 字符串；如果是字符串，直接使用
      let result: string | undefined = undefined
      if (task.feedback) {
        if (typeof task.feedback === 'string') {
          result = task.feedback
        } else if (typeof task.feedback === 'object') {
          try {
            result = JSON.stringify(task.feedback, null, 2)
          } catch {
            result = String(task.feedback)
          }
        } else {
          result = String(task.feedback)
        }
      }
      return {
        id: task.id,
        description,
        status,
        result,
        priority: 0,
      }
    })
  }, [data, plannerTodos])

  // 检查是否有有效数据
  const overallFeedback = data?.overallFeedback
  // 安全地处理 overallFeedback：如果是对象，转换为 JSON 字符串；如果是字符串，直接使用
  const overallFeedbackText = useMemo(() => {
    if (!overallFeedback) return ''
    if (typeof overallFeedback === 'string') {
      return overallFeedback
    }
    if (typeof overallFeedback === 'object') {
      // 如果是对象，尝试转换为 JSON 字符串
      try {
        return JSON.stringify(overallFeedback, null, 2)
      } catch {
        return String(overallFeedback)
      }
    }
    return String(overallFeedback)
  }, [overallFeedback])
  
  const hasData =
    (overallFeedbackText.trim().length > 0) ||
    todos.length > 0 ||
    data?.allCompleted !== undefined

  // 如果没有有效数据，不显示
  // 注意：流式传输时，即使 JSON 不完整，如果有部分数据也应该显示
  if (!hasData) {
    return null
  }

  return (
    <div className="verifier-response stream-json-display space-y-4">
      {overallFeedbackText.trim().length > 0 && (
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {overallFeedbackText}
          </ReactMarkdown>
        </div>
      )}

      {todos.length > 0 && (
        <TodoList 
          todos={todos} 
          title={`任务验证结果 (${todos.length})`}
          collapseCompleted={false}
        />
      )}
    </div>
  )
}

export default VerifierResponseDisplay
