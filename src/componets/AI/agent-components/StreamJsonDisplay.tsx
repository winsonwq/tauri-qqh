import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ComponentProps } from '../ComponentRegistry'
import { parsePartialJson } from '../../../utils/partialJsonParser'
import { PlannerResponse, VerifierResponse, Todo } from '../../../agents/agentTypes'
import TodoList from './TodoList'
import { markdownComponents } from '../MarkdownComponents'

type ResponseType = 'planner' | 'verifier'

interface StreamJsonDisplayConfig {
  responseType: ResponseType
  containerClassName?: string
  renderSummary?: (summary: string) => React.ReactNode
  renderFeedback?: (feedback: string) => React.ReactNode
  transformTodos?: (data: Partial<PlannerResponse | VerifierResponse>) => Todo[]
  renderExtraContent?: (data: Partial<PlannerResponse | VerifierResponse>, isValid: boolean) => React.ReactNode
  plannerTodos?: Todo[] // Planner 的原始 todos，用于 verifier 匹配任务说明
}

interface StreamJsonDisplayProps {
  props: ComponentProps & { config?: StreamJsonDisplayConfig }
}

const StreamJsonDisplay: React.FC<StreamJsonDisplayProps> = ({ props }) => {
  const { content, config } = props as { content: string; config?: StreamJsonDisplayConfig }
  
  if (!config) {
    return (
      <div className="stream-json-display bg-base-200 rounded-lg p-4 border border-base-300">
        <div className="text-sm text-error">配置错误：缺少 config</div>
      </div>
    )
  }

  const { responseType, containerClassName, renderSummary, renderFeedback, transformTodos, renderExtraContent, plannerTodos } = config

  // 始终尝试解析 JSON，即使不完整
  const parsed = useMemo(() => {
    // 尝试提取 JSON 部分
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // 如果没有找到 JSON 结构，返回一个空结果
      return {
        data: {} as Partial<PlannerResponse | VerifierResponse>,
        isValid: false,
        raw: content,
      }
    }

    if (responseType === 'planner') {
      return parsePartialJson<PlannerResponse>(jsonMatch[0])
    } else {
      return parsePartialJson<VerifierResponse>(jsonMatch[0])
    }
  }, [content, responseType])

  const { data, isValid } = parsed

  // 检查是否有任何有效的数据字段
  const hasData = useMemo(() => {
    if (responseType === 'planner') {
      const plannerData = data as Partial<PlannerResponse>
      return !!(plannerData.summary || (plannerData.todos && plannerData.todos.length > 0) || plannerData.needsMorePlanning !== undefined)
    } else {
      const verifierData = data as Partial<VerifierResponse>
      return !!(verifierData.overallFeedback || (verifierData.tasks && verifierData.tasks.length > 0) || verifierData.allCompleted !== undefined)
    }
  }, [data, responseType])

  // 如果完全没有数据且内容不是 JSON 格式
  // 对于 planner，如果内容是纯文本（总结消息），使用 markdown 渲染
  // 对于 verifier，显示原始内容
  if (!hasData && !content.match(/\{[\s\S]*\}/)) {
    if (responseType === 'planner') {
      // Planner 的总结消息可能是纯文本，使用 markdown 渲染
      return (
        <div className={`stream-json-display bg-base-200 rounded-lg p-4 border border-base-300 ${containerClassName || ''}`}>
          <div className="summary-section prose prose-sm max-w-none text-base-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      )
    }
    // Verifier 或其他情况，显示原始内容
    return (
      <div className={`stream-json-display bg-base-200 rounded-lg p-4 border border-base-300 ${containerClassName || ''}`}>
        <div className="text-sm text-base-content whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    )
  }

  // 转换 todos
  const todos: Todo[] = useMemo(() => {
    if (transformTodos) {
      return transformTodos(data) || []
    }
    
    // 默认处理：planner 和 verifier 的 todos 格式不同
    if (responseType === 'planner') {
      const plannerData = data as Partial<PlannerResponse>
      return plannerData.todos || []
    } else {
      const verifierData = data as Partial<VerifierResponse>
      if (!verifierData.tasks || !Array.isArray(verifierData.tasks)) {
        return []
      }
      return verifierData.tasks.map((task) => {
        const status: Todo['status'] = task.completed ? 'completed' : 'failed'
        
        // Verifier 验证时，保持 planner 的任务说明不变
        // 通过 task.id 匹配 plannerTodos 中的原始 description
        let description = task.id || '任务'
        if (plannerTodos && Array.isArray(plannerTodos)) {
          const plannerTodo = plannerTodos.find(t => t.id === task.id)
          if (plannerTodo && plannerTodo.description) {
            description = plannerTodo.description // 使用 planner 的原始任务说明
          }
        }
        
        return {
          id: task.id,
          description, // 保持 planner 的原始任务说明
          status,
          result: task.feedback || undefined, // 验证反馈显示在 tooltip 中（无论完成还是失败）
          priority: 0,
        }
      })
    }
  }, [data, responseType, transformTodos])

  // 提取 planner 的 summary
  const plannerSummary = responseType === 'planner' ? (data as Partial<PlannerResponse>).summary : undefined

  return (
    <div className={`stream-json-display bg-base-200 rounded-lg p-3 border border-base-300 space-y-4 ${containerClassName || ''}`}>
      {/* Summary 部分 - Planner 使用 markdown 渲染 */}
      {responseType === 'planner' && plannerSummary && (
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          {renderSummary ? (
            renderSummary(plannerSummary)
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {plannerSummary}
            </ReactMarkdown>
          )}
        </div>
      )}

      {/* Feedback 部分 - Verifier 使用普通文本 */}
      {responseType === 'verifier' && (data as Partial<VerifierResponse>).overallFeedback && (
        <div className="overall-feedback-section">
          {renderFeedback ? (
            renderFeedback((data as Partial<VerifierResponse>).overallFeedback!)
          ) : (
            <div className="text-sm text-base-content">
              {(data as Partial<VerifierResponse>).overallFeedback}
            </div>
          )}
        </div>
      )}

      {/* Todos 列表 */}
      {todos.length > 0 && (
        <TodoList 
          todos={todos} 
          title={responseType === 'verifier' ? `任务验证结果 (${todos.length})` : undefined}
        />
      )}

      {/* 额外的内容渲染 */}
      {renderExtraContent && renderExtraContent(data, isValid)}

      {/* 流式传输提示 */}
      {!isValid && (
        <div className="text-xs text-warning/70 italic">正在接收数据...</div>
      )}
    </div>
  )
}

export default StreamJsonDisplay
export type { StreamJsonDisplayConfig }

