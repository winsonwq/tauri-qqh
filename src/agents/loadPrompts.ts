/**
 * 加载 Agent 提示词
 */

import { AgentPrompt, AgentType } from './agentTypes'

// 动态导入提示词文件
const promptCache: Map<AgentType, string> = new Map()

export async function loadAgentPrompt(agentType: AgentType): Promise<string> {
  // 如果缓存中有，直接返回
  if (promptCache.has(agentType)) {
    return promptCache.get(agentType)!
  }

  try {
    // 动态导入提示词文件
    const promptModule = await import(`./prompts/${agentType}.md?raw`)
    const prompt = promptModule.default as string
    promptCache.set(agentType, prompt)
    return prompt
  } catch (error) {
    console.error(`加载 ${agentType} 提示词失败:`, error)
    // 返回默认提示词
    return getDefaultPrompt(agentType)
  }
}

function getDefaultPrompt(agentType: AgentType): string {
  switch (agentType) {
    case 'planner':
      return `你是一个专业的任务规划专家（Planner），负责将用户的需求分解成可执行的任务列表。

请以 JSON 格式输出任务列表：
{
  "needsMorePlanning": false,
  "todos": [
    {
      "id": "task-1",
      "description": "任务描述",
      "priority": 1,
      "status": "pending"
    }
  ],
  "summary": "规划总结"
}`

    case 'executor':
      return `你是一个专业的任务执行专家（Executor），负责完成具体的任务项。

请专注于完成当前任务，如果需要调用工具，请正确调用。任务完成后，请明确说明任务已完成。`

    case 'verifier':
      return `你是一个专业的任务验收专家（Verifier），负责验证所有任务的完成情况。

请以 JSON 格式输出验证结果：
{
  "allCompleted": true,
  "tasks": [
    {
      "id": "task-1",
      "score": 85,
      "completed": true,
      "feedback": "任务完成良好"
    }
  ],
  "overallFeedback": "整体完成情况良好"
}

评分标准：80分以上算完成。`

    default:
      return ''
  }
}

