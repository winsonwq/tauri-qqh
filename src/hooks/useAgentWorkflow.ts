/**
 * Agent 工作流 Hook
 * 
 * 重构版：使用 src/agent-framework 框架
 */

import { AgentWorkflowEngine } from '../agent-framework/workflow/AgentWorkflowEngine';
import { TauriAgentBackend } from '../adapters/TauriAgentBackend';
import { PromptManager } from '../agent-framework/prompts/PromptManager';
import { APP_SYSTEM_CONTEXT } from '../config/agentContext';
import { AIMessage } from '../agent-framework/core/types';
import { MCPServerInfo } from '../models';
import { getAvailableTools } from '../utils/toolUtils';

interface AgentWorkflowOptions {
  configId: string
  chatId: string
  userMessage: string
  messages: AIMessage[]
  updateMessages: (updater: (prev: AIMessage[]) => AIMessage[]) => void
  messagesRef: React.MutableRefObject<AIMessage[]>
  mcpServers: MCPServerInfo[]
  currentResourceId: string | null
  currentTaskId: string | null
  systemMessage: string
  isStoppedRef: React.MutableRefObject<boolean>
}

/**
 * Agent 工作流主函数
 */
export async function runAgentWorkflow({
  configId,
  chatId,
  userMessage,
  messages,
  updateMessages,
  messagesRef,
  mcpServers,
  currentResourceId,
  currentTaskId,
  systemMessage,
  isStoppedRef,
}: AgentWorkflowOptions): Promise<void> {
  
  // 初始化依赖
  const backend = new TauriAgentBackend();
  const promptManager = new PromptManager();
  
  // 设置应用上下文
  promptManager.setSystemContext(APP_SYSTEM_CONTEXT);
  
  // 初始化引擎
  const engine = new AgentWorkflowEngine(backend, promptManager);
  
  // 监听停止信号
  // 这是一个轮询检查，或者我们可以稍微 hack 一下，让 isStoppedRef 控制 engine.stop()
  // 但 engine.run 是 async 的。
  // 最好的方式是：如果外部设置了 isStoppedRef.current = true，我们需要通知 engine。
  // 由于 isStoppedRef 是一个 ref，我们无法直接监听它的变化。
  // 但 engine 内部会在关键点检查 isStopped。
  // 我们可以在 run 之前设置一个 periodic check 或者在回调中检查。
  // AgentWorkflowEngine 本身有 stop() 方法。
  // 为了兼容现有逻辑（通过 ref 控制停止），我们需要在回调中检查 ref。
  
  // 实际上，AgentWorkflowEngine 在每次循环都会检查 this.isStopped。
  // 我们需要建立 ref 到 engine 的桥梁。
  // 我们可以启动一个定时器或者在 updateMessages 回调中检查。
  const checkStopInterval = setInterval(() => {
      if (isStoppedRef.current) {
          engine.stop();
          clearInterval(checkStopInterval);
      }
  }, 100);

  try {
    const tools = getAvailableTools(mcpServers);
    
    await engine.run({
        configId,
        chatId,
        userMessage,
        initialMessages: messages,
        systemMessage,
        tools,
        context: {
            currentResourceId,
            currentTaskId
        },
        mcpServers // Pass mcpServers for tool server lookup
    }, {
        onMessageUpdate: (newMessages) => {
            // Framework messages -> App messages
            // The types are compatible (we ensured that)
            // 合并消息而不是完全替换，保留用户消息
            updateMessages((prevMessages) => {
                // 从 prevMessages 中提取用户消息（排除内部消息）
                const userMessages = prevMessages.filter(msg => 
                    msg.role === 'user' && 
                    !msg.id.startsWith('planner-user-') && 
                    !msg.id.startsWith('executor-user-')
                );
                
                // 从 newMessages 中过滤掉内部用户消息
                const frameworkMessages = newMessages.filter(msg => 
                    msg.role !== 'user' || 
                    (!msg.id.startsWith('planner-user-') && !msg.id.startsWith('executor-user-'))
                );
                
                // 合并：保留用户消息，使用框架消息（按 ID 去重）
                const frameworkMessageIds = new Set(frameworkMessages.map(msg => msg.id));
                const allMessages = [
                    ...userMessages.filter(msg => !frameworkMessageIds.has(msg.id)),
                    ...frameworkMessages
                ];
                
                // 按时间戳排序
                return allMessages.sort((a, b) => 
                    a.timestamp.getTime() - b.timestamp.getTime()
                );
            });
        },
        onError: (error) => {
            console.error('Agent Workflow Error:', error);
            throw error; // Re-throw to be caught by outer caller if needed
        },
        onLog: (msg) => {
            console.log(`[Agent] ${msg}`);
        }
    });
  } finally {
    clearInterval(checkStopInterval);
  }
}
