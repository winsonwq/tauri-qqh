/**
 * Partial JSON 解析工具
 * 使用 partial-json-parser 库来解析不完整的 JSON 字符串
 */

// @ts-ignore - partial-json-parser 可能没有类型定义
import partialParse from 'partial-json-parser'

export interface PartialJsonResult<T> {
  data: Partial<T>
  isValid: boolean
  raw: string
}

/**
 * 解析部分 JSON
 * 支持流式场景下不完整的 JSON 字符串
 * 
 * @param jsonString - 可能不完整的 JSON 字符串
 * @returns 解析结果，包含部分数据、是否完整、原始字符串
 */
export function parsePartialJson<T extends Record<string, any>>(
  jsonString: string
): PartialJsonResult<T> {
  // 提取 JSON 对象部分（从第一个 { 到最后一个 }）
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      data: {} as Partial<T>,
      isValid: false,
      raw: jsonString,
    }
  }

  const jsonStr = jsonMatch[0]

  // 先尝试完整解析
  try {
    const parsed = JSON.parse(jsonStr)
    return {
      data: parsed as T,
      isValid: true,
      raw: jsonString,
    }
  } catch {
    // JSON 不完整，使用 partial-json-parser
    try {
      const parsed = partialParse(jsonStr) as Partial<T>
      return {
        data: parsed,
        isValid: false,
        raw: jsonString,
      }
    } catch (error) {
      console.warn('Partial JSON 解析失败:', error)
      return {
        data: {} as Partial<T>,
        isValid: false,
        raw: jsonString,
      }
    }
  }
}

