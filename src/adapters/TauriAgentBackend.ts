import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { IAgentBackend, IChatCompletionOptions } from '../agent-framework/core/interfaces';
import { AIMessage, ToolCall } from '../agent-framework/core/types';
import { convertAIMessagesToChatMessages } from '../utils/aiMessageUtils';

export class TauriAgentBackend implements IAgentBackend {
  async chatCompletion(options: IChatCompletionOptions): Promise<void> {
    const { configId, messages, tools, systemMessage, eventId } = options;
    
    // Convert framework messages to chat messages expected by backend
    // We assume convertAIMessagesToChatMessages handles the framework AIMessage type 
    // (which is compatible with the original type)
    const chatMessages = convertAIMessagesToChatMessages(messages as any);

    await invoke<string>('chat_completion', {
      configId,
      messages: chatMessages,
      tools: tools && tools.length > 0 ? tools : null,
      systemMessage,
      eventId,
    });
  }

  async executeTool(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any> {
    return await invoke<any>('execute_mcp_tool_call', {
      serverName,
      toolName,
      arguments: args,
      currentResourceId: context?.currentResourceId || null,
      currentTaskId: context?.currentTaskId || null,
    });
  }

  async saveMessage(message: AIMessage, chatId: string): Promise<void> {
    await invoke('save_message', {
      chatId,
      role: message.role,
      content: message.content,
      toolCalls: message.tool_calls ? JSON.stringify(message.tool_calls) : null,
      toolCallId: message.tool_call_id || null,
      name: message.name || null,
      reasoning: message.reasoning || null,
    });
  }

  async listenToStream(
    eventId: string,
    callbacks: {
      onContent: (content: string) => void;
      onToolCalls: (toolCalls: ToolCall[]) => void;
      onReasoning: (content: string) => void;
      onDone: () => void;
      onError: (error: Error) => void;
    }
  ): Promise<() => void> {
    const eventName = `ai-chat-stream-${eventId}`;
    let unlisten: UnlistenFn | null = null;

    const promise = listen<{
      type: string;
      content?: string;
      tool_calls?: ToolCall[];
      event_id: string;
    }>(eventName, (event) => {
      const payload = event.payload;

      if (payload.type === 'content' && payload.content) {
        callbacks.onContent(payload.content);
      } else if (payload.type === 'tool_calls' && payload.tool_calls) {
        callbacks.onToolCalls(payload.tool_calls);
      } else if (payload.type === 'reasoning' && payload.content && payload.content.trim().length > 0) {
        callbacks.onReasoning(payload.content);
      } else if (payload.type === 'done') {
        callbacks.onDone();
        if (unlisten) unlisten();
      } else if (payload.type === 'stopped') {
        callbacks.onError(new Error('Stopped'));
        if (unlisten) unlisten();
      } else if (payload.type === 'error') {
          callbacks.onError(new Error(payload.content || 'Unknown error'));
          if (unlisten) unlisten();
      }
    });

    unlisten = await promise;

    return () => {
      if (unlisten) unlisten();
    };
  }
}

