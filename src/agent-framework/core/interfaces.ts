import { AIMessage, ToolCall } from './types';

export interface IChatCompletionOptions {
  configId: string;
  messages: AIMessage[];
  tools?: any[];
  systemMessage: string;
  eventId: string;
}

export interface IToolExecutor {
  execute(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>;
}

export interface IAgentBackend {
  /**
   * 调用 AI 对话接口
   */
  chatCompletion(options: IChatCompletionOptions): Promise<void>;

  /**
   * 执行 MCP 工具
   */
  executeTool(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>;

  /**
   * 保存消息
   */
  saveMessage(message: AIMessage, chatId: string): Promise<void>;
  
  /**
   * 监听流式响应
   * 返回一个取消监听的函数
   */
  listenToStream(
    eventId: string,
    callbacks: {
      onContent: (content: string) => void;
      onToolCalls: (toolCalls: ToolCall[]) => void;
      onReasoning: (content: string) => void;
      onDone: () => void;
      onError: (error: Error) => void;
    }
  ): Promise<() => void>;
}

