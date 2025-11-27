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

重要提示 - 工具调用策略：
在调用任何工具之前，请先仔细检查对话历史中是否已经包含了所需的信息。
- 如果对话历史中已经有相关信息，请直接使用这些信息，避免重复调用工具。
- 只有在以下情况下才需要调用工具：
  1. 对话历史中完全没有所需的信息
  2. 对话历史中的信息可能已经过时，需要获取最新数据
  3. 用户明确要求重新获取或刷新信息${contextSection}`
}

/**
 * ReAct 阶段类型
 */
export type ReActPhase = 'thought' | 'action' | 'observation'

/**
 * 生成 ReAct 思考阶段的系统消息
 * 分析用户问题，决定下一步行动
 */
export function generateThoughtPrompt(
  currentResourceId?: string | null,
  currentTaskId?: string | null,
  tools?: ToolInfo[],
): string {
  const baseSystemMessage = generateSystemMessage(currentResourceId, currentTaskId)
  
  const toolsSection = tools && tools.length > 0
    ? `

## 可用工具
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`
    : ''

  return `${baseSystemMessage}
${toolsSection}

## 当前阶段：思考

你需要分析当前情况，决定下一步应该做什么。

如果对话历史中有"观察"和"建议"，请参考建议来决定下一步行动。

### 输出格式

根据情况选择以下两种格式之一：

**格式1 - 需要继续执行行动（调用工具或分析）：**

**思考** [你的分析过程]

<agent_meta>
{"nextAction": "工具名称或analyze", "shouldContinue": true, "reason": "原因"}
</agent_meta>

**格式2 - 直接回答用户（结束循环）：**

**思考** [简要说明为什么可以回答了]

**回答** [你对用户问题的完整回答]

<agent_meta>
{"nextAction": "answer", "shouldContinue": false, "reason": "原因"}
</agent_meta>

### nextAction 可选值

- 工具名称（如 get_resource_info）：需要调用工具获取数据
- answer：直接回答用户（此时必须在 agent_meta 前输出完整回答）
- analyze：需要对已有信息进行分析

### 示例

**示例1 - 需要调用工具：**

**思考** 用户询问任务信息，需要先获取数据。

<agent_meta>
{"nextAction": "get_task_info", "shouldContinue": true, "reason": "需要获取任务详情"}
</agent_meta>

**示例2 - 直接回答用户：**

**思考** 已获得足够信息，可以回答用户。

**回答** 根据查询结果，该任务的状态是已完成，转写内容主要讨论了...

<agent_meta>
{"nextAction": "answer", "shouldContinue": false, "reason": "信息充足"}
</agent_meta>`
}

/**
 * 生成 ReAct 行动阶段的系统消息
 * 执行具体的行动（分析或回答）
 */
export function generateActionPrompt(
  actionType: string,
  currentResourceId?: string | null,
  currentTaskId?: string | null,
): string {
  const baseSystemMessage = generateSystemMessage(currentResourceId, currentTaskId)

  if (actionType === 'answer') {
    return `${baseSystemMessage}

## 当前阶段：行动 - 回答用户

根据已有信息，直接回答用户的问题。

### 输出格式

**行动** Answer
[你的回答内容]`
  }

  if (actionType === 'analyze') {
    return `${baseSystemMessage}

## 当前阶段：行动 - 分析

对已有的信息进行分析和总结。

### 输出格式

**行动** Analyze
[你的分析内容]`
  }

  // 工具调用
  return `${baseSystemMessage}

## 当前阶段：行动 - 调用工具

你需要调用 ${actionType} 工具来获取信息。

### 输出格式

**行动** ${actionType}
[简要说明正在执行的操作]

然后调用 ${actionType} 工具。`
}

/**
 * 生成 ReAct 观察阶段的系统消息
 * 简短总结工具返回的结果，并给出下一步建议
 */
export function generateObservationPrompt(): string {
  return `## 当前阶段：观察

请总结工具返回的结果，并给出下一步建议。

### 输出格式

**观察** [简短总结结果，1-2句话]

**建议** [下一步应该做什么：继续调用其他工具、进行分析、还是直接回答用户]`
}

/**
 * 生成 ReAct 模式的系统消息（兼容旧版本）
 */
export function generateReActSystemMessage(
  currentResourceId?: string | null,
  currentTaskId?: string | null,
  tools?: ToolInfo[],
): string {
  return generateThoughtPrompt(currentResourceId, currentTaskId, tools)
}
