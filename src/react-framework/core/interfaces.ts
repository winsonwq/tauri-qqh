/**
 * ReAct Framework 核心接口定义
 */

import { AIMessage, ToolCall } from './types'

/**
 * AI 对话选项
 */
export interface IChatCompletionOptions {
  configId: string
  messages: AIMessage[]
  tools?: any[]
  systemMessage: string
  eventId: string
}

/**
 * 工具执行器接口
 */
export interface IToolExecutor {
  execute(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>
}

/**
 * ReAct 后端接口
 */
export interface IReActBackend {
  /**
   * 调用 AI 对话接口
   */
  chatCompletion(options: IChatCompletionOptions): Promise<void>

  /**
   * 执行 MCP 工具
   */
  executeTool(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>

  /**
   * 保存消息
   */
  saveMessage(message: AIMessage, chatId: string): Promise<void>

  /**
   * 监听流式响应
   * 返回一个取消监听的函数
   */
  listenToStream(
    eventId: string,
    callbacks: {
      onContent: (content: string) => void
      onToolCalls: (toolCalls: ToolCall[]) => void
      onReasoning: (content: string) => void
      onDone: () => void
      onError: (error: Error) => void
    }
  ): Promise<() => void>

  /**
   * 停止流式响应
   */
  stopStream(eventId: string): Promise<void>
}

/**
 * 工具信息提供者接口
 */
export interface IToolInfoProvider {
  /**
   * 获取可用工具列表
   */
  getToolInfoList(): Array<{ name: string; description: string }>

  /**
   * 查找工具对应的服务器
   */
  findToolServer(toolName: string): { key?: string; name: string } | null

  /**
   * 检查所有工具调用是否都需要用户确认
   */
  areAllToolsAutoConfirmable(toolCalls: ToolCall[]): boolean
}

