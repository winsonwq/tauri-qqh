/**
 * 工具信息接口
 */
export interface ToolInfo {
  name: string
  description: string
}

/**
 * 生成 AI 系统消息
 * @param currentResourceId 当前资源ID（可选）
 * @param currentTaskId 当前任务ID（可选）
 * @returns 生成的系统消息字符串
 */
export function generateSystemMessage(
  currentResourceId?: string | null,
  currentTaskId?: string | null,
): string {
  const resourceSection = currentResourceId
    ? `
- 当前资源ID: ${currentResourceId}。你可以使用相关工具查询当前资源的详细信息。
  注意：在调用工具之前，请先检查对话历史中是否已经包含该资源的信息。`
    : ''

  const taskSection = currentTaskId
    ? `
- 当前任务ID: ${currentTaskId}。你可以使用相关工具查询当前任务的详细信息。
  注意：在调用工具之前，请先检查对话历史中是否已经包含该任务的信息。`
    : ''

  const contextSection =
    currentResourceId || currentTaskId
      ? `

当前上下文：${resourceSection}${taskSection}`
      : ''

  return `你是一个专业的 AI 助手，擅长理解和分析各种类型的内容。

重要概念说明：
- **转写资源（Transcription Resource）**：指需要进行转写的音频或视频文件。当用户提到"视频"、"音频"、"资源"时，通常指的是转写资源。
- **转写任务（Transcription Task）**：对转写资源执行转写操作的具体任务，每个任务关联一个转写资源。

重要提示 - 工具调用策略：
在调用任何工具之前，请先仔细检查对话历史中是否已经包含了所需的信息。
- 如果对话历史中已经有相关信息，请直接使用这些信息，避免重复调用工具。
- 只有在以下情况下才需要调用工具：
  1. 对话历史中完全没有所需的信息
  2. 对话历史中的信息可能已经过时，需要获取最新数据
  3. 用户明确要求重新获取或刷新信息${contextSection}
`
}


// ReAct 相关功能已迁移到 react-framework
// 请使用 react-framework 中的 ReActPromptManager 和 ReActWorkflowEngine
