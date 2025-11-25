import { IAgentBackend } from '../core/interfaces';
import { AgentAction, AgentType, AIMessage, ExecutorResponse, PlannerResponse, Todo, VerifierResponse, ToolCall } from '../core/types';
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
        this.buildPlannerUserMessage(userMessage, planningRound),
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
        needsMorePlanning = this.processPlannerResponse(plannerResponse, todos, log);

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

        // 构建 executor user 消息
        const executorUserMsg = this.buildExecutorUserMessage(todo, executorRound);
        
        // 将 executor user 消息添加到 currentMessages，确保后续轮次能看到完整上下文
        updateMessages(prev => [...prev, executorUserMsg]);

        // 构建发送给 AI 的消息
        const executorMessages: AIMessage[] = [
            ...currentMessages,  // 此时已包含 executorUserMsg
        ];

        // Sanitize todo.id to ensure it only contains allowed characters for event name
        const safeTodoId = todo.id.replace(/[^a-zA-Z0-9-_]/g, '');
        const eventId = `executor-${safeTodoId}-${executorRound}-${Date.now()}`;
        const assistantMessageId = `executor-msg-${todo.id}-${executorRound}`;

        try {
            const response = await callAI(
                executorMessages,  // 使用包含内部指令的消息列表
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
                // 执行工具调用
                await this.executeToolCalls(
                    response.toolCalls,
                    options.mcpServers || [],
                    options.context,
                    chatId,
                    updateMessages,
                    log
                );
            } else {
                // 处理 Executor 响应，判断任务完成状态
                const executorResponse = this.parseExecutorResponse(response.content);
                const completion = this.processExecutorResponse(
                    executorResponse,
                    response.content,
                    todo,
                    todos,
                    log
                );
                
                todoCompleted = completion.completed;
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

    // === Verifier Loop (with retry for incomplete tasks) ===
    let verificationRound = 0;
    const maxVerificationRounds = 3;
    let allTasksCompleted = false;

    while (!allTasksCompleted && verificationRound < maxVerificationRounds && !this.isStopped) {
      verificationRound++;
      log(`Verifier 开始验证任务 (第 ${verificationRound} 轮)`);
      
      const todosSummary = todos
          .map(todo => `- ${todo.id}: ${todo.description} (状态: ${todo.status}${todo.result ? `, 结果: ${todo.result.substring(0, 100)}...` : ''})`)
          .join('\n');

      // 构建发送给 AI 的消息（包含内部指令，但不添加到 currentMessages）
      const verifierMessages: AIMessage[] = [
          ...currentMessages,
          {
              id: `verifier-user-${verificationRound}`,
              role: 'user',
              content: `请验证以下任务的完成情况：\n\n用户原始问题：${userMessage}\n\n任务列表：\n${todosSummary}\n\n请评估每个任务是否完成，以及整体是否满足用户需求。如果全部完成，请直接提供最终总结；如果未完成，请提出改进建议。`,
              timestamp: new Date(),
          }
      ];

      const verifierEventId = `verifier-${verificationRound}-${Date.now()}`;
      const verifierMsgId = `verifier-msg-${verificationRound}`;

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
          
          // 判断是否完成
          const isCompleted = verifierResponse?.allCompleted && 
                              (verifierResponse?.userNeedsSatisfied !== false);
          
          if (isCompleted) {
              // 任务完成，verifier 已经提供了总结
              allTasksCompleted = true;
              
              // 如果 verifier 提供了 summary，更新消息显示为总结状态
              if (verifierResponse?.summary) {
                  log('所有任务已完成验收，Verifier 已提供总结');
                  updateMessages(prev => prev.map(msg => 
                      msg.id === verifierMsgId 
                        ? { ...msg, agentType: 'verifier', action: 'summarizing' } 
                        : msg
                  ));
              } else {
                  log('所有任务已完成验收');
              }
          } else {
              // 任务未完成，需要进入下一轮规划
              log(`验证未通过，需要改进。改进建议: ${verifierResponse?.improvements?.join('; ') || '无'}`);
              
              if (verificationRound < maxVerificationRounds) {
                  // 构建改进建议消息，供 planner 参考
                  const improvementsText = verifierResponse?.improvements?.length 
                      ? `\n\n改进建议：\n${verifierResponse.improvements.map((imp, i) => `${i + 1}. ${imp}`).join('\n')}`
                      : '';
                  
                  // 重新进入 planner 规划
                  log(`进入第 ${verificationRound + 1} 轮规划`);
                  
                  // 构建发送给 AI 的消息（包含内部指令，但不添加到 currentMessages）
                  const rePlannerMessages: AIMessage[] = [
                      ...currentMessages,
                      {
                          id: `replanner-user-${verificationRound}`,
                          role: 'user',
                          content: `上一轮任务执行后，Verifier 评估未通过。${improvementsText}\n\n请根据改进建议，重新规划任务以完成用户的原始需求：${userMessage}`,
                          timestamp: new Date(),
                      }
                  ];

                  const rePlannerEventId = `replanner-${verificationRound}-${Date.now()}`;
                  const rePlannerMsgId = `replanner-msg-${verificationRound}`;

                  const rePlannerResponse = await callAI(
                      rePlannerMessages,
                      'planner',
                      null,
                      rePlannerEventId,
                      rePlannerMsgId
                  );

                  updateMessages(prev => prev.map(msg => 
                      msg.id === rePlannerMsgId 
                        ? { ...msg, agentType: 'planner', action: 'planning' } 
                        : msg
                  ));

                  const plannerResponse = this.parsePlannerResponse(rePlannerResponse.content);
                  if (plannerResponse?.todos?.length) {
                      // 添加新任务
                      todos.push(...plannerResponse.todos);
                      log(`Planner 补充了 ${plannerResponse.todos.length} 个新任务`);
                      
                      // 执行新任务
                      const newTodos = plannerResponse.todos;
                      for (const todo of newTodos) {
                          if (this.isStopped) return;

                          todo.status = 'executing';
                          log(`开始执行补充任务: ${todo.id}`);

                          let todoCompleted = false;
                          let executorRound = 0;
                          const maxExecutorRounds = 10;

                          while (!todoCompleted && executorRound < maxExecutorRounds && !this.isStopped) {
                              executorRound++;
                              
                              // 构建 executor user 消息
                              const executorUserMsg = this.buildExecutorUserMessage(todo, executorRound);
                              
                              // 将 executor user 消息添加到 currentMessages，确保后续轮次能看到完整上下文
                              updateMessages(prev => [...prev, executorUserMsg]);

                              // 构建发送给 AI 的消息
                              const executorMessages: AIMessage[] = [
                                  ...currentMessages,  // 此时已包含 executorUserMsg
                              ];

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
                                      await this.executeToolCalls(
                                          response.toolCalls,
                                          options.mcpServers || [],
                                          options.context,
                                          chatId,
                                          updateMessages,
                                          log
                                      );
                                  } else {
                                      const executorResponse = this.parseExecutorResponse(response.content);
                                      const completion = this.processExecutorResponse(
                                          executorResponse,
                                          response.content,
                                          todo,
                                          todos,
                                          log
                                      );
                                      todoCompleted = completion.completed;
                                  }
                              } catch (error: any) {
                                  events.onError?.(error);
                                  if (this.isStopped) return;
                                  todo.status = 'failed';
                                  break;
                              }
                          }
                      }
                  }
              }
          }

      } catch (error: any) {
          events.onError?.(error);
          if (this.isStopped) return;
          throw error;
      }
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
    const result = parsePartialJson<{ 
      tasks?: any[]; 
      allCompleted?: boolean;
      userNeedsSatisfied?: boolean;
      improvements?: string[];
      summary?: string;
      overallFeedback?: string;
    }>(content);
    if (result.data && (result.data.tasks || result.data.allCompleted !== undefined)) {
        return result.data as VerifierResponse;
    }
    return null;
  }

  private parseExecutorResponse(content: string): ExecutorResponse | null {
    const result = parsePartialJson<ExecutorResponse>(content);
    if (result.data && (result.data.todos !== undefined || result.data.taskCompleted !== undefined)) {
        return result.data as ExecutorResponse;
    }
    return null;
  }

  private findToolServer(toolName: string, mcpServers: any[]): any {
      return mcpServers.find((s: any) => s.tools?.some((t: any) => t.name === toolName));
  }

  /**
   * 执行工具调用列表
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    mcpServers: any[],
    context: Record<string, any> | undefined,
    chatId: string,
    updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void,
    log: (msg: string) => void
  ): Promise<AIMessage[]> {
    const toolResults: AIMessage[] = [];
    
    log(`Executor 正在调用工具: ${toolCalls.map(t => t.function.name).join(', ')}`);

    for (const toolCall of toolCalls) {
      try {
        // 解析工具参数
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          // 参数解析失败，使用空对象
        }

        // 查找工具所属的服务器
        const server = this.findToolServer(toolCall.function.name, mcpServers);
        const serverName = server ? (server.key || server.name) : 'default';

        // 执行工具
        const result = await this.backend.executeTool(
          serverName,
          toolCall.function.name,
          args,
          {
            currentResourceId: context?.currentResourceId,
            currentTaskId: context?.currentTaskId
          }
        );

        // 格式化工具结果为消息
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
        console.error(`工具调用失败: ${toolCall.function.name}`, err);
        // 继续执行其他工具，不中断整个流程
      }
    }

    // 更新消息列表
    updateMessages(prev => [...prev, ...toolResults]);
    
    return toolResults;
  }

  /**
   * 从 Executor 响应中判断任务是否完成
   */
  private determineTaskCompletion(
    executorResponse: ExecutorResponse,
    currentTodoId: string
  ): { completed: boolean; shouldSkip: boolean } {
    // 优先使用 AI 返回的流程控制字段
    if (executorResponse.taskCompleted !== undefined) {
      return { completed: executorResponse.taskCompleted, shouldSkip: false };
    }

    if (executorResponse.nextAction === 'complete') {
      return { completed: true, shouldSkip: false };
    }

    if (executorResponse.nextAction === 'skip') {
      return { completed: true, shouldSkip: true };
    }

    // 如果没有明确的完成标志，检查当前任务的状态
    const currentTaskInResponse = executorResponse.todos?.find(t => t.id === currentTodoId);
    if (currentTaskInResponse?.status === 'completed') {
      return { completed: true, shouldSkip: false };
    }

    // 根据 shouldContinue 判断（如果提供）
    if (executorResponse.shouldContinue === false) {
      return { completed: true, shouldSkip: false };
    }

    return { completed: false, shouldSkip: false };
  }

  /**
   * 从 Executor 响应中更新所有任务状态
   * 
   * 重要规则：
   * 1. 保护已完成任务的状态，避免被后续任务覆盖
   * 2. 当前任务的状态由 completion 判断决定，不在此处更新
   */
  private updateTodosFromResponse(
    executorResponse: ExecutorResponse,
    todos: Todo[],
    currentTodoId?: string
  ): void {
    if (!executorResponse.todos || executorResponse.todos.length === 0) {
      return;
    }

    executorResponse.todos.forEach(responseTodo => {
      const existingTodo = todos.find(t => t.id === responseTodo.id);
      if (!existingTodo) {
        return;
      }

      const isCurrentTask = currentTodoId && responseTodo.id === currentTodoId;
      const isAlreadyCompleted = existingTodo.status === 'completed';

      // 跳过当前任务：当前任务的状态由 completion 判断决定，不在此处更新
      if (isCurrentTask) {
        // 只更新非状态字段（如 isCurrent）
        if (responseTodo.isCurrent !== undefined) {
          existingTodo.isCurrent = responseTodo.isCurrent;
        }
        return;
      }

      // 保护已完成任务的状态：已完成的任务不更新状态，避免被覆盖
      if (isAlreadyCompleted) {
        // 只更新其他字段（如 result、isCurrent），不更新状态
        if (responseTodo.result && !existingTodo.result) {
          existingTodo.result = responseTodo.result;
        }
        if (responseTodo.isCurrent !== undefined) {
          existingTodo.isCurrent = responseTodo.isCurrent;
        }
        return;
      }

      // 更新未完成任务的状态
      existingTodo.status = responseTodo.status;
      if (responseTodo.result) {
        existingTodo.result = responseTodo.result;
      }
      if (responseTodo.isCurrent !== undefined) {
        existingTodo.isCurrent = responseTodo.isCurrent;
      }
    });
  }

  /**
   * 处理 Executor 响应，判断任务完成状态并更新任务列表
   */
  private processExecutorResponse(
    executorResponse: ExecutorResponse | null,
    responseContent: string,
    currentTodo: Todo,
    todos: Todo[],
    log: (msg: string) => void
  ): { completed: boolean; shouldSkip: boolean } {
    if (!executorResponse) {
      // 兜底：如果无法解析 JSON，尝试关键词匹配
      return this.fallbackCompletionCheck(responseContent, currentTodo, log);
    }

    // 判断任务完成状态
    const completion = this.determineTaskCompletion(executorResponse, currentTodo.id);

    // 更新所有任务状态（保护已完成任务的状态）
    this.updateTodosFromResponse(executorResponse, todos, currentTodo.id);

    // 更新当前任务的状态
    if (completion.completed) {
      if (completion.shouldSkip) {
        currentTodo.status = 'failed';
        log(`任务跳过: ${currentTodo.id}`);
      } else {
        currentTodo.status = 'completed';
        currentTodo.result = executorResponse.summary || responseContent;
        log(`任务完成: ${currentTodo.id} (由 AI 判断)`);
      }
    } else {
      // 如果任务未完成，检查是否应该继续
      if (executorResponse.shouldContinue === false && executorResponse.taskCompleted !== true) {
        // AI 明确表示不应该继续，但任务未完成，标记为失败
        currentTodo.status = 'failed';
        log(`任务无法继续: ${currentTodo.id}`);
        return { completed: true, shouldSkip: false };
      }
    }

    return completion;
  }

  /**
   * 关键词匹配兜底逻辑（向后兼容）
   */
  private fallbackCompletionCheck(
    content: string,
    todo: Todo,
    log: (msg: string) => void
  ): { completed: boolean; shouldSkip: boolean } {
    log(`警告: 无法解析 Executor 响应为 JSON，尝试关键词匹配`);
    
    const completionKeywords = ['任务完成', '已完成', '完成', '任务执行完成'];
    const contentLower = content.toLowerCase();
    const keywordMatch = completionKeywords.some(k => contentLower.includes(k.toLowerCase()));

    if (keywordMatch) {
      todo.status = 'completed';
      todo.result = content;
      log(`任务完成: ${todo.id} (通过关键词匹配)`);
      return { completed: true, shouldSkip: false };
    }

    // 无法确定，继续执行（但会受到最大轮次限制）
    return { completed: false, shouldSkip: false };
  }

  /**
   * 处理 Planner 响应，更新任务列表并判断是否需要继续规划
   */
  private processPlannerResponse(
    plannerResponse: PlannerResponse | null,
    todos: Todo[],
    log: (msg: string) => void
  ): boolean {
    if (!plannerResponse) {
      return false; // 无法解析响应，停止规划
    }

    const currentTodosCount = todos.length;
    todos.push(...plannerResponse.todos);
    const newTodosCount = todos.length;

    log(`Planner 规划完成: 生成 ${newTodosCount - currentTodosCount} 个新任务`);

    // 如果没有新任务且 AI 表示不需要更多规划，则停止
    if (newTodosCount === currentTodosCount && plannerResponse.needsMorePlanning) {
      return false;
    }

    return plannerResponse.needsMorePlanning;
  }

  /**
   * 构建 Executor 用户消息
   */
  private buildExecutorUserMessage(
    todo: Todo,
    executorRound: number
  ): AIMessage {
    return {
      id: `executor-user-${todo.id}-${executorRound}`,
      role: 'user',
      content: executorRound === 1
        ? `请执行以下任务：\n\n任务ID: ${todo.id}\n任务描述: ${todo.description}\n\n请开始执行此任务。`
        : '请继续完成当前任务。如果已经完成，请明确说明任务已完成。',
      timestamp: new Date(),
    };
  }

  /**
   * 构建 Planner 用户消息
   */
  private buildPlannerUserMessage(
    userMessage: string,
    planningRound: number
  ): AIMessage {
    return {
      id: `planner-user-${planningRound}`,
      role: 'user',
      content: planningRound === 1
        ? userMessage
        : '请根据之前的对话，判断是否还需要进一步规划任务。如果需要，请补充或细化任务列表。',
      timestamp: new Date(),
    };
  }
}

