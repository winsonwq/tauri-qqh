/**
 * ReAct Framework 解析工具
 */

import { AgentMeta } from '../core/types'
// @ts-ignore - partial-json-parser 可能没有类型定义
import partialParse from 'partial-json-parser'

/**
 * 解析 AI 响应中的 agent_meta 标签
 */
export function parseAgentMeta(content: string): AgentMeta | null {
  // 支持完整的标签和不完整的标签（用于流式解析）
  const metaMatch = content.match(/<agent_meta>([\s\S]*?)(?:<\/agent_meta>|$)/)
  if (!metaMatch) {
    console.log('[parseAgentMeta] 未找到 agent_meta 标签')
    return null
  }

  try {
    const metaContent = metaMatch[1].trim()
    console.log('[parseAgentMeta] 提取的 meta 内容:', metaContent)

    // 如果没有内容，返回 null
    if (!metaContent) {
      console.log('[parseAgentMeta] meta 内容为空')
      return null
    }

    // 尝试解析 JSON 格式（支持部分 JSON）
    if (metaContent.startsWith('{')) {
      // 先尝试标准 JSON 解析
      try {
        const parsed = JSON.parse(metaContent)
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
          const parsed = partialParse(metaContent)
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
    } else {
      console.log('[parseAgentMeta] meta 内容不是 JSON 格式（不以 { 开头）')
      return null
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

