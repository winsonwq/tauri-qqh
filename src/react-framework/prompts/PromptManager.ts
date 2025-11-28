/**
 * ReAct Framework 提示词管理器
 */

import { ReActPhase } from '../core/types'
import { ToolInfo } from '../core/types'
import {
  generateThoughtTemplate,
  generateActionTemplate,
  generateObservationTemplate,
} from './templates'

/**
 * PromptManager - 提示词管理器
 *
 * 负责管理和生成 ReAct 各阶段的提示词：
 * 1. 框架层级的核心提示词（templates.ts）- 确保框架工作
 * 2. 业务层级的上下文（通过 setBusinessContext 设置）- 业务相关的系统提示词
 *
 * 最终的 system message = 核心模板 + 业务上下文
 */
export class ReActPromptManager {
  private businessContexts: Map<ReActPhase, string> = new Map()
  private defaultBusinessContext: string = ''

  /**
   * 设置默认的业务上下文（适用于所有阶段）
   */
  setSystemContext(context: string) {
    this.defaultBusinessContext = context
  }

  /**
   * 为特定阶段设置业务上下文
   */
  setBusinessContext(phase: ReActPhase, context: string) {
    this.businessContexts.set(phase, context)
  }

  /**
   * 批量设置所有阶段的业务上下文
   */
  setAllBusinessContexts(contexts: Record<ReActPhase, string>) {
    Object.entries(contexts).forEach(([phase, context]) => {
      if (phase !== 'idle') {
        this.businessContexts.set(phase as ReActPhase, context)
      }
    })
  }

  /**
   * 获取思考阶段的提示词
   */
  getThoughtPrompt(
    currentResourceId?: string | null,
    currentTaskId?: string | null,
    tools?: ToolInfo[],
  ): string {
    const coreTemplate = generateThoughtTemplate(
      currentResourceId,
      currentTaskId,
      tools,
    )
    const businessContext =
      this.businessContexts.get('thought') || this.defaultBusinessContext

    return this.combineTemplateAndContext(coreTemplate, businessContext)
  }

  /**
   * 获取行动阶段的提示词
   */
  getActionPrompt(
    currentResourceId?: string | null,
    currentTaskId?: string | null,
    tools?: ToolInfo[],
  ): string {
    const coreTemplate = generateActionTemplate(
      currentResourceId,
      currentTaskId,
      tools,
    )
    const businessContext =
      this.businessContexts.get('action') || this.defaultBusinessContext

    return this.combineTemplateAndContext(coreTemplate, businessContext)
  }

  /**
   * 获取观察阶段的提示词
   */
  getObservationPrompt(
    currentResourceId?: string | null,
    currentTaskId?: string | null,
  ): string {
    const coreTemplate = generateObservationTemplate(
      currentResourceId,
      currentTaskId,
    )
    const businessContext =
      this.businessContexts.get('observation') || this.defaultBusinessContext

    return this.combineTemplateAndContext(coreTemplate, businessContext)
  }

  /**
   * 组合模板和业务上下文
   */
  private combineTemplateAndContext(
    template: string,
    context: string,
  ): string {
    if (!context) {
      return template
    }

    // 在模板末尾添加业务上下文
    return `${template}

---

## 业务上下文
${context}`
  }
}

