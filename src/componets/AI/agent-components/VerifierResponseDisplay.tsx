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
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        data: null as VerifierResponse | null,
        isValid: false,
      }
    }
    try {
      return parsePartialJson<VerifierResponse>(jsonMatch[0])
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: null as VerifierResponse | null,
        isValid: false,
      }
    }
  }, [content])

  const { data, isValid } = parsed

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
      return {
        id: task.id,
        description,
        status,
        result: task.feedback || undefined,
        priority: 0,
      }
    })
  }, [parsed, plannerTodos])

  // 如果没有有效数据，不显示（在所有 Hooks 调用之后）
  if (!data || !isValid) {
    return null
  }

  // 检查是否有有效数据
  const hasData =
    (data.overallFeedback && data.overallFeedback.trim().length > 0) ||
    todos.length > 0 ||
    data.allCompleted !== undefined

  if (!hasData) {
    return null
  }

  return (
    <div className="verifier-response stream-json-display space-y-4">
      <div className="summary-section prose prose-sm max-w-none text-base-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {data.overallFeedback}
        </ReactMarkdown>
      </div>

      {todos.length > 0 && (
        <TodoList todos={todos} title={`任务验证结果 (${todos.length})`} />
      )}
    </div>
  )
}

export default VerifierResponseDisplay
