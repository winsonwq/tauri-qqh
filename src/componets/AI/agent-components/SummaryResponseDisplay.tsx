import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ComponentProps } from '../ComponentRegistry'
import { parsePartialJson } from '../../../utils/partialJsonParser'
import { markdownComponents } from '../MarkdownComponents'

interface SummaryResponse {
  type?: 'component'
  component?: string
  summary: string
}

interface SummaryResponseDisplayProps {
  props: ComponentProps
}

const SummaryResponseDisplay: React.FC<SummaryResponseDisplayProps> = ({
  props,
}) => {
  const { content } = props

  // 解析 JSON
  const parsed = useMemo(() => {
    try {
      return parsePartialJson<SummaryResponse>(content)
    } catch (error) {
      console.warn('JSON 解析失败:', error)
      return {
        data: {} as Partial<SummaryResponse>,
        isValid: false,
        raw: content,
      }
    }
  }, [content])

  const { data } = parsed

  // 检查是否有 JSON 结构（通过检查内容是否包含 JSON 特征来判断）
  const hasJsonStructure = content.trim().match(/\{[\s\S]*\}/) !== null

  // 如果没有 JSON 结构，可能是纯文本总结
  if (!hasJsonStructure && content.trim().length > 0) {
    return (
      <div className="summary-response stream-json-display">
        <div className="summary-section prose prose-sm max-w-none text-base-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  // 如果有 JSON 结构但没有有效数据，不显示（除非正在流式传输）
  if (!data || Object.keys(data).length === 0) {
    return null
  }

  const { summary } = data

  // 检查是否有有效数据，确保 summary 是字符串类型
  const summaryText = typeof summary === 'string' ? summary : String(summary || '')
  const hasData = summaryText.trim().length > 0

  if (!hasData) {
    return null
  }

  return (
    <div className="summary-response stream-json-display">
      <div className="summary-section prose prose-sm max-w-none text-base-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {summaryText}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default SummaryResponseDisplay

