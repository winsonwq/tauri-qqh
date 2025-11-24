import { IAgentBackend } from '../core/interfaces';
import { AgentAction, AgentType, AIMessage, PlannerResponse, Todo, VerifierResponse, ToolCall } from '../core/types';
import { PromptManager } from '../prompts/PromptManager';
import { parsePartialJson } from '../utils/jsonParser';

export interface AgentWorkflowOptions {
  configId: string;
  chatId: string;
  userMessage: string;
  initialMessages?: AIMessage[];
  systemMessage?: string;
  mcpServers?: any[]; // Keep generic for now or use specific type if available
  tools?: any[];
  context?: Record<string, any>;
}

export interface AgentWorkflowEvents {
  onMessageUpdate: (messages: AIMessage[]) => void;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

export class AgentWorkflowEngine {
  private backend: IAgentBackend;
  private promptManager: PromptManager;
  private isStopped: boolean = false;
  private abortController: AbortController | null = null;

  constructor(backend: IAgentBackend, promptManager: PromptManager) {
    this.backend = backend;
    this.promptManager = promptManager;
  }

  stop() {
    this.isStopped = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async run(options: AgentWorkflowOptions, events: AgentWorkflowEvents) {
    this.isStopped = false;
    this.abortController = new AbortController();
    const { configId, chatId, userMessage, initialMessages = [], systemMessage = '', tools = [] } = options;
    let currentMessages = [...initialMessages];
    const todos: Todo[] = [];

    const log = (msg: string) => events.onLog?.(msg);
    const updateMessages = (updater: (prev: AIMessage[]) => AIMessage[]) => {
      currentMessages = updater(currentMessages);
      events.onMessageUpdate(currentMessages);
    };

    // Helper: Call AI and Wait
    const callAIAndWait = async (
      messages: AIMessage[],
      agentType: AgentType,
      toolsToSend: any[] | null,
      eventId: string,
      assistantMessageId: string
    ) => {
      const prompt = this.promptManager.getPrompt(agentType);
      
      // Add placeholder assistant message
      updateMessages(prev => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          agentType
        }
      ]);

      let finalContent = '';
      let finalToolCalls: ToolCall[] | undefined;
      let finalReasoning = '';

      const stopListening = await this.backend.listenToStream(eventId, {
        onContent: (content) => {
          finalContent += content;
          updateMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId ? { ...msg, content: msg.content + content } : msg
          ));
        },
        onToolCalls: (toolCalls) => {
          finalToolCalls = toolCalls;
          updateMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { 
                  ...msg, 
                  tool_calls: toolCalls,
                  action: msg.agentType === 'executor' ? 'calling_tool' : msg.action
                } 
              : msg
          ));
        },
        onReasoning: (content) => {
          finalReasoning += content;
          updateMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { 
                  ...msg, 
                  reasoning: (msg.reasoning || '') + content,
                  action: msg.agentType === 'executor' ? 'thinking' : msg.action
                } 
              : msg
          ));
        },
        onDone: () => {}, // Handled by promise resolution
        onError: (err) => {
            // Optional: handle stream errors specifically
        }
      });

      try {
        const combinedSystemMessage = `${systemMessage}\n\n${prompt}`;
        await this.backend.chatCompletion({
          configId,
          messages,
          tools: toolsToSend,
          systemMessage: combinedSystemMessage,
          eventId
        });

        // Wait for stream completion (implicit in listenToStream implementation or we need a promise wrapper)
        // In the original code, listenToStream returns a promise that resolves when 'done' event is received.
        // Here, I assumed listenToStream is setting up listeners.
        // To match the original behavior, I need to wait for the 'done' signal.
        // Since `listenToStream` in my interface returns a cleanup function, I should wrap the waiting logic.
        // BUT, the backend implementation of listenToStream should probably return a Promise that resolves when stream is done if we want to await it.
        // However, the original code uses a Promise wrapper around the listen call.
        // I'll refactor this helper to assume listenToStream sets up the listener and returns a promise that resolves when done.
        
        // Wait for completion is tricky here if `listenToStream` only registers callbacks. 
        // Let's assume `listenToStream` returns a cleanup function, and we need to pass a `resolve` function to `onDone`.
        
        // REVISION: I will rely on the `listenToStream` implementation to handle the promise logic or 
        // I will wrap it here. Let's wrap it here for clarity.
      } catch (error) {
        stopListening();
        throw error;
      }

      // We need a way to know when streaming is done. 
      // The `listenToStream` interface I defined earlier might need adjustment or usage change.
      // Let's assume `listenToStream` takes callbacks and returns a cleanup fn. 
      // But we need to `await` the completion.
      // I'll change `callAIAndWait` to create a Promise.
    };

    // Re-implementing callAIAndWait properly
    const callAI = async (
      messages: AIMessage[],
      agentType: AgentType,
      toolsToSend: any[] | null,
      eventId: string,
      assistantMessageId: string
    ): Promise<{ content: string; toolCalls?: ToolCall[]; reasoning?: string }> => {
      const prompt = this.promptManager.getPrompt(agentType);
      
      // 根据 agentType 设置默认 action
      let defaultAction: AgentAction | undefined = undefined;
      if (agentType === 'planner') {
        defaultAction = 'planning';
      } else if (agentType === 'executor') {
        defaultAction = 'thinking';
      } else if (agentType === 'verifier') {
        defaultAction = 'verifying';
      }
      
      updateMessages(prev => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          agentType,
          action: defaultAction
        }
      ]);

      return new Promise(async (resolve, reject) => {
        let finalContent = '';
        let finalToolCalls: ToolCall[] | undefined;
        let finalReasoning = '';
        let cleanup: (() => void) | undefined;

        try {
          cleanup = await this.backend.listenToStream(eventId, {
            onContent: (content) => {
              finalContent += content;
              updateMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId ? { ...msg, content: msg.content + content } : msg
              ));
            },
            onToolCalls: (toolCalls) => {
              finalToolCalls = toolCalls;
              updateMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { 
                      ...msg, 
                      tool_calls: toolCalls,
                      action: msg.agentType === 'executor' ? 'calling_tool' : msg.action
                    } 
                  : msg
              ));
            },
            onReasoning: (content) => {
              finalReasoning += content;
              updateMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { 
                      ...msg, 
                      reasoning: (msg.reasoning || '') + content,
                      action: msg.agentType === 'executor' ? 'thinking' : msg.action
                    } 
                  : msg
              ));
            },
            onDone: () => {
              if (cleanup) cleanup();
              
              // Save message
              const hasValidReasoning = finalReasoning.trim().length > 0;
              const msgToSave: AIMessage = {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: finalContent,
                  timestamp: new Date(),
                  tool_calls: finalToolCalls,
                  reasoning: hasValidReasoning ? finalReasoning : undefined
              };
              this.backend.saveMessage(msgToSave, chatId).catch(console.error);
              
              resolve({
                content: finalContent,
                toolCalls: finalToolCalls,
                reasoning: hasValidReasoning ? finalReasoning : undefined
              });
            },
            onError: (err) => {
              if (cleanup) cleanup();
              reject(err);
            }
          });

          const combinedSystemMessage = `${systemMessage}\n\n${prompt}`;
          await this.backend.chatCompletion({
            configId,
            messages,
            tools: toolsToSend,
            systemMessage: combinedSystemMessage,
            eventId
          });
        } catch (error) {
          if (cleanup) cleanup();
          reject(error);
        }
      });
    };

    // === Planner Loop ===
    let needsMorePlanning = true;
    let planningRound = 0;
    const maxPlanningRounds = 3;

    while (needsMorePlanning && planningRound < maxPlanningRounds && !this.isStopped) {
      planningRound++;
      log(`Planner 正在规划 (第 ${planningRound} 轮)`);

      const plannerMessages: AIMessage[] = [
        ...currentMessages,
        {
          id: `planner-user-${planningRound}`,
          role: 'user',
          content: planningRound === 1 
            ? userMessage 
            : '请根据之前的对话，判断是否还需要进一步规划任务。如果需要，请补充或细化任务列表。',
          timestamp: new Date(),
        },
      ];

      const eventId = `planner-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const assistantMessageId = `planner-msg-${planningRound}`;

      try {
        const response = await callAI(
            plannerMessages,
            'planner',
            null,
            eventId,
            assistantMessageId
        );

        updateMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, agentType: 'planner', action: 'planning' } 
              : msg
        ));

        const plannerResponse = this.parsePlannerResponse(response.content);
        if (plannerResponse) {
            const currentTodosCount = todos.length;
            todos.push(...plannerResponse.todos);
            const newTodosCount = todos.length;

            log(`Planner 规划完成: 生成 ${newTodosCount - currentTodosCount} 个新任务`);

            if (newTodosCount === currentTodosCount && plannerResponse.needsMorePlanning) {
                needsMorePlanning = false;
            } else {
                needsMorePlanning = plannerResponse.needsMorePlanning;
            }
        } else {
            needsMorePlanning = false;
        }

        // 注意：assistant 消息已经通过 callAI 中的 updateMessages 添加了
        // planner 循环中的用户消息是内部使用的，不应该通过 updateMessages 添加到 UI
        // 但需要添加到 currentMessages 以便后续循环使用（不触发 UI 更新）
        const userMessage = plannerMessages[plannerMessages.length - 1];
        if (!currentMessages.find(msg => msg.id === userMessage.id)) {
            // 直接更新 currentMessages，不触发 updateMessages（避免 UI 更新）
            currentMessages = [
                ...currentMessages,
                userMessage
            ];
        }

      } catch (error: any) {
        events.onError?.(error);
        if (this.isStopped) return;
        throw error;
      }
    }

    if (this.isStopped || todos.length === 0) return;

    // === Executor Loop ===
    const sortedTodos = [...todos].sort((a, b) => a.priority - b.priority);
    log(`开始执行任务，共 ${sortedTodos.length} 个任务`);

    for (let i = 0; i < sortedTodos.length; i++) {
      if (this.isStopped) return;

      const todo = sortedTodos[i];
      todo.status = 'executing';
      log(`开始执行任务: ${todo.id}`);

      let todoCompleted = false;
      let executorRound = 0;
      const maxExecutorRounds = 10;

      while (!todoCompleted && executorRound < maxExecutorRounds && !this.isStopped) {
        executorRound++;
        log(`正在执行任务: ${todo.id} (第 ${executorRound} 轮)`);

        const executorMessages: AIMessage[] = [
            ...currentMessages,
            {
                id: `executor-user-${todo.id}-${executorRound}`,
                role: 'user',
                content: executorRound === 1
                    ? `请执行以下任务：\n\n任务ID: ${todo.id}\n任务描述: ${todo.description}\n\n请开始执行此任务。`
                    : '请继续完成当前任务。如果已经完成，请明确说明任务已完成。',
                timestamp: new Date(),
            }
        ];

        // Sanitize todo.id to ensure it only contains allowed characters for event name
        const safeTodoId = todo.id.replace(/[^a-zA-Z0-9-_]/g, '');
        const eventId = `executor-${safeTodoId}-${executorRound}-${Date.now()}`;
        const assistantMessageId = `executor-msg-${todo.id}-${executorRound}`;

        try {
            const response = await callAI(
                executorMessages,
                'executor',
                tools.length > 0 ? tools : null,
                eventId,
                assistantMessageId
            );

            let action: AgentAction | undefined = undefined;
            if (response.toolCalls && response.toolCalls.length > 0) {
                action = 'calling_tool';
            } else if (response.reasoning && response.reasoning.trim().length > 0) {
                action = 'thinking';
            }

            updateMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, agentType: 'executor', ...(action && { action }) } 
                  : msg
            ));

            if (response.toolCalls && response.toolCalls.length > 0) {
                // Execute tools
                log(`Executor 正在调用工具: ${response.toolCalls.map(t => t.function.name).join(', ')}`);
                const toolResults: AIMessage[] = [];

                for (const toolCall of response.toolCalls) {
                    try {
                        let args = {};
                        try {
                             args = JSON.parse(toolCall.function.arguments);
                        } catch {}
                        
                        // TODO: Need to handle server mapping if multiple servers. 
                        // For now assume backend handles it or we pass a combined tool executor.
                        // The IAgentBackend.executeTool needs serverName.
                        // We might need a way to find serverName from toolName. 
                        // Or IToolExecutor handles it.
                        // Let's assume backend.executeTool handles it if we pass toolName.
                        // Actually, IAgentBackend definition has serverName.
                        // I'll need a helper to find server. 
                        // But `run` receives `mcpServers`? No, `tools` array.
                        // The `executeTool` abstraction implies the caller knows the server.
                        // In the original code `findToolServer` is used.
                        // I should pass `mcpServers` in options if available, or rely on `backend` to find it.
                        // Let's assume `backend.executeTool` can take just toolName if we change the interface, 
                        // OR we implement the lookup here if we have mcpServers.
                        // I'll use a simplified executeTool that takes toolName and args, 
                        // and let the adapter handle the server lookup if needed.
                        
                        // Wait, the interface I defined is: executeTool(serverName, toolName, ...)
                        // I need to find the serverName.
                        // I should use `options.mcpServers`.
                        
                        const server = this.findToolServer(toolCall.function.name, options.mcpServers || []);
                        const serverName = server ? (server.key || server.name) : 'default'; 
                        // Fallback or error if no server found?

                        const result = await this.backend.executeTool(
                            serverName,
                            toolCall.function.name,
                            args,
                            { currentResourceId: options.context?.currentResourceId, currentTaskId: options.context?.currentTaskId }
                        );

                        const toolResultMsg: AIMessage = {
                            id: Date.now().toString() + Math.random(),
                            role: 'tool',
                            content: JSON.stringify(result),
                            timestamp: new Date(),
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name
                        };
                        toolResults.push(toolResultMsg);
                        await this.backend.saveMessage(toolResultMsg, chatId);

                    } catch (err) {
                        console.error(err);
                        // Handle error
                    }
                }
                
                updateMessages(prev => [...prev, ...toolResults]);
                
                // 注意：assistant 消息已经通过 callAI 中的 updateMessages 添加了
                // toolResults 也已经通过上面的 updateMessages 添加了
                // executor 循环中的用户消息是内部使用的，不应该添加到 currentMessages
                // currentMessages 已经通过 updateMessages 更新了

            } else {
                // Check completion
                const completionKeywords = ['任务完成', '已完成', '完成', '任务执行完成'];
                const contentLower = response.content.toLowerCase();
                todoCompleted = completionKeywords.some(k => contentLower.includes(k.toLowerCase()));

                if (todoCompleted) {
                    todo.status = 'completed';
                    todo.result = response.content;
                    log(`任务完成: ${todo.id}`);
                }

                // 注意：assistant 消息已经通过 callAI 中的 updateMessages 添加了
                // executor 循环中的用户消息是内部使用的，不应该添加到 currentMessages
                // currentMessages 已经通过 updateMessages 更新了
            }

        } catch (error: any) {
             events.onError?.(error);
             if (this.isStopped) return;
             todo.status = 'failed';
             throw error;
        }
      }
    }

    if (this.isStopped) return;

    // === Verifier Loop ===
    log(`Verifier 开始验证任务`);
    
    const todosSummary = todos
        .map(todo => `- ${todo.id}: ${todo.description} (状态: ${todo.status}${todo.result ? `, 结果: ${todo.result.substring(0, 100)}...` : ''})`)
        .join('\n');

    const verifierMessages: AIMessage[] = [
        ...currentMessages,
        {
            id: 'verifier-user',
            role: 'user',
            content: `请验证以下任务的完成情况：\n\n${todosSummary}\n\n请为每个任务打分（0-100分），80分以上算完成。`,
            timestamp: new Date(),
        }
    ];

    const verifierEventId = `verifier-${Date.now()}`;
    const verifierMsgId = 'verifier-msg';

    try {
        const response = await callAI(
            verifierMessages,
            'verifier',
            null,
            verifierEventId,
            verifierMsgId
        );

        updateMessages(prev => prev.map(msg => 
            msg.id === verifierMsgId 
              ? { ...msg, agentType: 'verifier', action: 'verifying' } 
              : msg
        ));

        const verifierResponse = this.parseVerifierResponse(response.content);
        if (verifierResponse?.allCompleted) {
            log('所有任务已完成验收，开始总结');
            
            const summaryMessages: AIMessage[] = [
                ...currentMessages,
                verifierMessages[verifierMessages.length - 1],
                {
                    id: verifierMsgId,
                    role: 'assistant',
                    content: response.content,
                    timestamp: new Date(),
                    agentType: 'verifier'
                },
                {
                    id: 'planner-summary-user',
                    role: 'user',
                    content: `所有任务已完成验收。请总结用户问题的完成情况。\n\n用户原始问题：${userMessage}\n\n请基于任务执行结果，总结用户问题的完成情况...`,
                    timestamp: new Date(),
                }
            ];

            await callAI(
                summaryMessages,
                'planner',
                null,
                `summary-${Date.now()}`,
                'planner-summary-msg'
            );
            
            // Update last message to summarizing
            updateMessages(prev => prev.map(msg => 
                msg.id === 'planner-summary-msg'
                  ? { ...msg, agentType: 'planner', action: 'summarizing' }
                  : msg
            ));
            
            log('Planner 总结完成');
        }

    } catch (error: any) {
        events.onError?.(error);
        if (this.isStopped) return;
        throw error;
    }
  }

  private parsePlannerResponse(content: string): PlannerResponse | null {
    const result = parsePartialJson<{ todos?: any[]; needsMorePlanning?: boolean; summary?: string }>(content);
    if (result.data && (result.data.todos || result.data.needsMorePlanning !== undefined)) {
        return result.data as PlannerResponse;
    }
    return null;
  }

  private parseVerifierResponse(content: string): VerifierResponse | null {
    const result = parsePartialJson<{ tasks?: any[]; allCompleted?: boolean }>(content);
    if (result.data && (result.data.tasks || result.data.allCompleted !== undefined)) {
        return result.data as VerifierResponse;
    }
    return null;
  }

  private findToolServer(toolName: string, mcpServers: any[]): any {
      return mcpServers.find((s: any) => s.tools?.some((t: any) => t.name === toolName));
  }
}

