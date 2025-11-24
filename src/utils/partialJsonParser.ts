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
 * 从混合内容中提取 JSON 对象
 * 支持从包含普通文本和 JSON 的混合内容中提取最后一个完整的 JSON 对象
 */
function extractJsonFromMixedContent(content: string): string {
  // 首先尝试提取 markdown 代码块中的 JSON
  const jsonCodeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonCodeBlockMatch && jsonCodeBlockMatch[1]) {
    return jsonCodeBlockMatch[1].trim()
  }

  // 如果没有代码块，尝试从内容中提取最后一个 JSON 对象
  // 使用正则表达式匹配 JSON 对象（从 { 开始，到匹配的 } 结束）
  const jsonMatches = []
  let depth = 0
  let startIndex = -1
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) {
        startIndex = i
      }
      depth++
    } else if (content[i] === '}') {
      depth--
      if (depth === 0 && startIndex !== -1) {
        // 找到一个完整的 JSON 对象
        jsonMatches.push(content.substring(startIndex, i + 1))
        startIndex = -1
      }
    }
  }
  
  // 返回最后一个匹配的 JSON 对象（通常是最完整的）
  if (jsonMatches.length > 0) {
    return jsonMatches[jsonMatches.length - 1]
  }
  
  // 如果没有找到完整的 JSON 对象，返回原始内容
  return content
}

/**
 * 清理 markdown 代码块标记
 * 支持从文本中提取 JSON 代码块，处理重复的代码块标记（如 ``` ```json）
 * 去除开头的 ```json 或 ``` 和末尾的 ```
 */
function cleanMarkdownCodeBlock(jsonString: string): string {
  let cleaned = jsonString.trim()
  
  // 处理重复的代码块标记（如 ``` ```json 或 ```json ```）
  // 移除开头的重复标记
  cleaned = cleaned.replace(/^```+\s*(?:json\s*)?```*(?:json)?\s*\n?/i, '```')
  
  // 尝试匹配 JSON 代码块（```json ... ``` 或 ``` ... ```）
  // 匹配从第一个 ```json 或 ``` 开始，到匹配的结束 ``` 为止
  const jsonCodeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  
  if (jsonCodeBlockMatch && jsonCodeBlockMatch[1]) {
    // 如果找到了代码块，提取其中的内容
    cleaned = jsonCodeBlockMatch[1].trim()
  } else {
    // 如果没有找到完整的代码块，尝试去除开头和结尾的标记
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
    // 只在有结束标记时才移除
    if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/\n?```+\s*$/, '')
    }
  }

  return cleaned.trim()
}

/**
 * 解析部分 JSON
 * 支持流式场景下不完整的 JSON 字符串
 *
 * @param jsonString - 可能不完整的 JSON 字符串
 * @returns 解析结果，包含部分数据、是否完整、原始字符串
 */
export function parsePartialJson<T extends Record<string, any>>(
  jsonString: string,
): PartialJsonResult<T> {
  try {
    // 先从混合内容中提取 JSON（如果内容包含普通文本和 JSON）
    let extractedJson = extractJsonFromMixedContent(jsonString)
    
    // 然后清理 markdown 代码块
    const cleaned = cleanMarkdownCodeBlock(extractedJson)
    
    // 如果清理后为空，返回空结果
    if (!cleaned.trim()) {
      return {
        data: {} as Partial<T>,
        isValid: false,
        raw: jsonString,
      }
    }
    
    // 使用 partial-json-parser 解析（它能处理不完整的 JSON）
    let parsed: Partial<T>
    try {
      parsed = partialParse(cleaned) as Partial<T>
    } catch (parseError) {
      // 如果 partialParse 失败，尝试标准 JSON 解析
      try {
        parsed = JSON.parse(cleaned) as Partial<T>
      } catch {
        // 如果都失败，返回空对象
        parsed = {} as Partial<T>
      }
    }
    
    // 检查原始 JSON 是否完整
    const isValid = (() => {
      try {
        JSON.parse(cleaned)
        return true
      } catch {
        return false
      }
    })()

    return {
      data: parsed,
      isValid,
      raw: jsonString,
    }
  } catch (error) {
    // 即使出错，也尝试返回部分数据
    try {
      const extractedJson = extractJsonFromMixedContent(jsonString)
      const cleaned = cleanMarkdownCodeBlock(extractedJson)
      const parsed = partialParse(cleaned) as Partial<T>
      return {
        data: parsed,
        isValid: false,
        raw: jsonString,
      }
    } catch {
      return {
        data: {} as Partial<T>,
        isValid: false,
        raw: jsonString,
      }
    }
  }
}
