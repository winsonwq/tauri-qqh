/**
 * ReAct Framework 解析工具
 */

import { AgentMeta } from '../core/types'
// @ts-ignore - partial-json-parser 可能没有类型定义
import partialParse from 'partial-json-parser'

/**
 * 从文本中提取 JSON 对象（支持从混合内容中提取）
 */
function extractJsonFromText(text: string): string | null {
  // 先尝试直接解析整个文本
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  // 如果整个文本不是 JSON，尝试找到第一个 JSON 对象
  // 查找第一个 { 和对应的 }
  let braceCount = 0
  let startIndex = -1
  let endIndex = -1

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (startIndex === -1) {
        startIndex = i
      }
      braceCount++
    } else if (text[i] === '}') {
      braceCount--
      if (braceCount === 0 && startIndex !== -1) {
        endIndex = i
        break
      }
    }
  }

  if (startIndex !== -1 && endIndex !== -1) {
    return text.substring(startIndex, endIndex + 1)
  }

  return null
}

/**
 * 解析 AI 响应中的 agent_meta 标签
 */
export function parseAgentMeta(content: string): AgentMeta | null {
  // 支持完整的标签和不完整的标签（用于流式解析）
  // 使用更健壮的正则表达式，支持标签前后有空格的情况
  const metaMatch = content.match(/<agent_meta>\s*([\s\S]*?)\s*(?:<\/agent_meta>|$)/i)
  if (!metaMatch) {
    console.log('[parseAgentMeta] 未找到 agent_meta 标签')
    return null
  }

  try {
    let metaContent = metaMatch[1].trim()
    console.log('[parseAgentMeta] 提取的 meta 内容:', metaContent)

    // 如果没有内容，返回 null
    if (!metaContent) {
      console.log('[parseAgentMeta] meta 内容为空')
      return null
    }

    // 尝试从内容中提取 JSON 对象（可能不在开头）
    const jsonContent = extractJsonFromText(metaContent)
    if (!jsonContent) {
      console.log('[parseAgentMeta] 无法从内容中提取 JSON 对象')
      return null
    }

    console.log('[parseAgentMeta] 提取的 JSON 内容:', jsonContent)

    // 先尝试标准 JSON 解析
    try {
      const parsed = JSON.parse(jsonContent)
      console.log('[parseAgentMeta] 标准 JSON 解析成功:', parsed)

      // 验证必要字段
      if (typeof parsed.shouldContinue === 'boolean') {
        // 检查是否有未知字段
        const knownFields = ['shouldContinue', 'reason']
        const unknownFields = Object.keys(parsed).filter(
          (key) => !knownFields.includes(key),
        )
        if (unknownFields.length > 0) {
          console.warn(
            `[parseAgentMeta] 发现未知字段，将被忽略: ${unknownFields.join(', ')}`,
          )
        }
        return {
          shouldContinue: parsed.shouldContinue,
          reason: parsed.reason || undefined,
        }
      } else {
        console.warn('[parseAgentMeta] 缺少 shouldContinue 字段，使用默认值')
        return {
          shouldContinue: true, // 默认继续执行
          reason: parsed.reason || undefined,
        }
      }
    } catch (parseError) {
      // 如果标准解析失败，尝试部分 JSON 解析
      console.log('[parseAgentMeta] 标准 JSON 解析失败，尝试部分解析:', parseError)
      try {
        const parsed = partialParse(jsonContent)
        console.log('[parseAgentMeta] 部分 JSON 解析结果:', parsed)

        // 验证必要字段
        if (typeof parsed.shouldContinue === 'boolean') {
          // 检查是否有未知字段
          const knownFields = ['shouldContinue', 'reason']
          const unknownFields = Object.keys(parsed).filter(
            (key) => !knownFields.includes(key),
          )
          if (unknownFields.length > 0) {
            console.warn(
              `[parseAgentMeta] 发现未知字段，将被忽略: ${unknownFields.join(', ')}`,
            )
          }
          return {
            shouldContinue: parsed.shouldContinue,
            reason: parsed.reason || undefined,
          }
        } else {
          console.warn('[parseAgentMeta] 部分解析结果缺少 shouldContinue 字段，使用默认值')
          return {
            shouldContinue: true, // 默认继续执行
            reason: parsed.reason || undefined,
          }
        }
      } catch (partialError) {
        console.error('[parseAgentMeta] 部分 JSON 解析也失败:', partialError)
        // 如果都失败，返回默认值而不是 null
        console.log('[parseAgentMeta] 返回默认值: shouldContinue=true')
        return {
          shouldContinue: true, // 默认继续执行
          reason: undefined,
        }
      }
    }
  } catch (e) {
    console.error('[parseAgentMeta] 解析过程中出错:', e)
    // 即使出错，也返回默认值而不是 null
    return {
      shouldContinue: true, // 默认继续执行
      reason: undefined,
    }
  }
}

/**
 * 从内容中移除 agent_meta 标签（支持不完整的结束标签）
 */
export function removeAgentMeta(content: string): string {
  // 移除完整的标签：<agent_meta>...</agent_meta>
  let cleaned = content.replace(/<agent_meta>[\s\S]*?<\/agent_meta>/g, '')
  // 移除不完整的标签（用于流式输出）：<agent_meta>...（没有结束标签）
  cleaned = cleaned.replace(/<agent_meta>[\s\S]*$/g, '')
  return cleaned.trim()
}

