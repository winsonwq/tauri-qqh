# Agent Framework 使用指南

## 目录

1. [功能和解决问题简介](#功能和解决问题简介)
2. [架构设计](#架构设计)
3. [提示词架构设计](#提示词架构设计)
4. [如何基于该 Framework 构建新应用](#如何基于该-framework-构建新应用)

---

## 功能和解决问题简介

### 什么是 Agent Framework

Agent Framework 是一个**多 Agent 协作框架**，通过将复杂任务分解为规划、执行、验证三个阶段，使用三个专门的 Agent（Planner、Executor、Verifier）协作完成用户请求。

### 核心工作流程

```
用户请求
   ↓
Planner（规划者）
   ├─ 理解用户需求
   ├─ 分解为可执行任务列表
   └─ 设置任务优先级
   ↓
Executor（执行者）
   ├─ 按优先级执行任务
   ├─ 调用工具获取信息
   └─ 处理和分析数据
   ↓
Verifier（验证者）
   ├─ 验证任务完成情况
   └─ 评估完成质量
   ↓
Planner（总结者）
   └─ 总结任务完成情况
   ↓
返回最终结果
```

### 解决的问题

1. **复杂任务分解**：将复杂的用户需求自动分解为可执行的子任务
2. **任务优先级管理**：自动为任务分配优先级，确保重要任务优先执行
3. **工具调用优化**：Executor 会检查对话历史，避免重复调用相同工具
4. **任务验证机制**：通过 Verifier 确保任务完成质量
5. **结构化输出**：所有 Agent 输出标准化的 JSON 格式，便于解析和展示

### 多 Agent 框架 vs 单 Agent 多轮对话 vs 直接问答

#### 优劣势对比表

| 对比维度 | 多 Agent 框架 | 单 Agent 多轮对话 | 直接问答 |
|---------|--------------|-----------------|---------|
| **优势** | | | |
| 职责分离 | ✅ 每个 Agent 专注于特定职责，提示词更精准 | ❌ 单一 Agent 处理所有职责 | ❌ 单一 Agent 处理所有职责 |
| 任务规划能力 | ✅ Planner 提前规划整个任务流程 | ⚠️ Agent 在执行过程中临时规划 | ❌ 无规划能力 |
| 质量保证 | ✅ Verifier 独立验证任务完成情况 | ❌ 没有独立的验证机制 | ❌ 没有验证机制 |
| 工具调用优化 | ✅ Executor 检查历史，避免重复调用 | ❌ 容易重复调用相同工具 | ❌ 不支持工具调用 |
| 可扩展性 | ✅ 可轻松添加新的 Agent 类型 | ⚠️ 扩展需要修改单一 Agent | ❌ 难以扩展 |
| 调试友好性 | ✅ 每个阶段的输出清晰可见 | ❌ 所有逻辑混在一起 | ⚠️ 简单场景易于调试 |
| 响应速度 | ❌ 需要多轮 AI 调用，响应时间较长 | ✅ 单次调用即可完成 | ✅ 响应最快，无需规划流程 |
| 成本 | ❌ 需要多次调用 AI API | ✅ 只需一次 AI 调用 | ✅ 成本最低，只需一次调用 |
| 实现复杂度 | ❌ 需要管理多个 Agent 的交互和状态 | ✅ 不需要复杂的协调逻辑 | ✅ 实现最简单，直接调用 API |
| **劣势** | | | |
| 延迟 | ❌ 较高 | ⚠️ 中等 | ✅ 最低 |
| 成本 | ❌ 较高 | ⚠️ 中等 | ✅ 最低 |
| 复杂度 | ❌ 较高 | ⚠️ 中等 | ✅ 最低 |
| 规划能力 | ✅ 强 | ❌ 弱 | ❌ 无 |
| 工具调用 | ✅ 优化，避免重复 | ❌ 可能重复 | ❌ 不支持 |
| 质量保证 | ✅ 有验证机制 | ❌ 无验证机制 | ❌ 无验证机制 |
| 处理复杂任务 | ✅ 强 | ⚠️ 中等 | ❌ 只能处理简单任务 |
| **适用场景** | | | |
| 任务复杂度 | 复杂任务（需要多步骤完成） | 简单任务（单步或少量步骤） | 简单问答、信息查询 |
| 工具调用需求 | 需要工具调用的任务 | 不需要工具调用的任务 | 不需要工具调用 |
| 质量要求 | 需要质量保证的任务 | 对质量要求不高的场景 | 对质量要求不高的场景 |
| 响应速度要求 | 可接受较长响应时间 | 对响应速度要求高 | 对响应速度要求极高 |
| 任务规划需求 | 需要任务规划和优先级管理 | 不需要复杂规划 | 不需要规划 |

#### 特性对比表

| 特性 | 多 Agent 框架 | 单 Agent 多轮对话 | 直接问答 |
|------|--------------|-----------------|---------|
| 任务复杂度 | 高 | 中 | 低 |
| 响应速度 | 慢 | 中 | 快 |
| 成本 | 高 | 中 | 低 |
| 工具调用 | ✅ 优化，避免重复 | ⚠️ 可能重复 | ❌ 不支持 |
| 任务规划 | ✅ 强 | ⚠️ 弱 | ❌ 无 |
| 质量保证 | ✅ 有验证 | ❌ 无 | ❌ 无 |
| 可扩展性 | ✅ 高 | ⚠️ 中 | ❌ 低 |
| 调试友好性 | ✅ 高 | ❌ 低 | ⚠️ 中 |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                   应用层 (Application)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         useAgentWorkflow Hook                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Agent Framework 核心层                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │         AgentWorkflowEngine                     │  │
│  │  - Planner Loop                                 │  │
│  │  - Executor Loop                                │  │
│  │  - Verifier Loop                                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         PromptManager                           │  │
│  │  - 模板管理                                      │  │
│  │  - 上下文注入                                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              接口层 (Interfaces)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         IAgentBackend                           │  │
│  │  - chatCompletion()                             │  │
│  │  - executeTool()                                │  │
│  │  - saveMessage()                                │  │
│  │  - listenToStream()                             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              适配器层 (Adapters)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         TauriAgentBackend                        │  │
│  │  - 实现 IAgentBackend 接口                       │  │
│  │  - 与 Tauri 后端通信                             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. AgentWorkflowEngine（工作流引擎）

**位置**：`src/agent-framework/workflow/AgentWorkflowEngine.ts`

**职责**：
- 协调三个 Agent 的执行流程
- 管理任务状态和消息流
- 处理工具调用和结果
- 控制工作流的启动和停止

**关键方法**：
- `run()`: 执行完整的工作流
- `stop()`: 停止工作流执行

**工作流程**：
```typescript
1. Planner Loop（最多 3 轮）
   - 理解用户需求
   - 生成任务列表
   - 判断是否需要更多规划

2. Executor Loop（每个任务最多 10 轮）
   - 按优先级执行任务
   - 调用工具获取信息
   - 检查任务完成状态

3. Verifier Loop（1 轮）
   - 验证所有任务完成情况
   - 评估完成质量

4. Summary（如果所有任务完成）
   - Planner 总结任务完成情况
```

#### 2. PromptManager（提示词管理器）

**位置**：`src/agent-framework/prompts/PromptManager.ts`

**职责**：
- 管理不同 Agent 的提示词模板
- 注入系统上下文
- 支持动态替换模板变量

**关键方法**：
- `setSystemContext()`: 设置应用特定的系统上下文
- `setTemplate()`: 覆盖默认模板
- `getPrompt()`: 获取处理后的提示词

#### 3. IAgentBackend（后端接口）

**位置**：`src/agent-framework/core/interfaces.ts`

**接口定义**：
```typescript
interface IAgentBackend {
  // 调用 AI 对话接口
  chatCompletion(options: IChatCompletionOptions): Promise<void>;
  
  // 执行 MCP 工具
  executeTool(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>;
  
  // 保存消息
  saveMessage(message: AIMessage, chatId: string): Promise<void>;
  
  // 监听流式响应
  listenToStream(
    eventId: string,
    callbacks: StreamCallbacks
  ): Promise<() => void>;
}
```

#### 4. 类型定义

**位置**：`src/agent-framework/core/types.ts`

**核心类型**：
- `AgentType`: `'planner' | 'executor' | 'verifier'`
- `AgentAction`: Agent 行为类型（thinking, planning, calling_tool 等）
- `Todo`: 任务定义
- `PlannerResponse`: Planner 响应格式
- `ExecutorResponse`: Executor 响应格式
- `VerifierResponse`: Verifier 响应格式
- `AIMessage`: 消息格式

### 数据流

```
用户输入
   ↓
AgentWorkflowEngine.run()
   ↓
Planner Agent
   ├─ 调用 chatCompletion()
   ├─ 监听流式响应
   └─ 解析 PlannerResponse
   ↓
生成 Todo 列表
   ↓
Executor Agent（循环执行每个任务）
   ├─ 调用 chatCompletion()
   ├─ 监听流式响应
   ├─ 解析工具调用
   ├─ 执行工具（executeTool）
   └─ 解析 ExecutorResponse
   ↓
Verifier Agent
   ├─ 调用 chatCompletion()
   ├─ 监听流式响应
   └─ 解析 VerifierResponse
   ↓
Planner Agent（总结）
   ├─ 调用 chatCompletion()
   └─ 生成最终总结
   ↓
返回结果
```

---

## 提示词架构设计

### 提示词模板系统

框架使用**模板系统**管理提示词，支持：
1. **模板变量替换**：使用 `{{systemContext}}` 占位符注入应用上下文
2. **动态模板覆盖**：可以在运行时覆盖默认模板
3. **结构化输出**：所有 Agent 输出标准化的 JSON 格式

### 模板结构

每个 Agent 的提示词模板包含以下部分：

1. **角色定义**：明确 Agent 的身份和职责
2. **系统上下文**：应用特定的上下文信息（通过 `{{systemContext}}` 注入）
3. **职责说明**：详细说明 Agent 需要做什么
4. **输出格式**：明确要求输出 JSON 格式
5. **注意事项**：重要的执行规则和约束

### Planner 提示词示例

```markdown
# Planner Agent 提示词

你是一个专业的任务规划专家（Planner），负责将用户的需求分解成可执行的任务列表。

## 系统上下文

{{systemContext}}

## 你的职责

1. **理解用户需求**：仔细分析用户提出的问题或任务
2. **制定任务计划**：将复杂的需求分解成一系列清晰、具体、可执行的任务项
3. **任务优先级**：为每个任务分配合理的优先级

## 输出格式

```json
{
  "type": "component",
  "component": "planner-response",
  "summary": "规划总结",
  "needsMorePlanning": false,
  "todos": [
    {
      "id": "task-1",
      "description": "任务描述",
      "priority": 1,
      "status": "pending"
    }
  ]
}
```
```

**关键特点**：
- 使用 `{{systemContext}}` 占位符，运行时会被替换为实际的应用上下文
- 明确要求输出 JSON 格式
- 定义了 `needsMorePlanning` 字段，支持多轮规划

### Executor 提示词示例

```markdown
# Executor Agent 提示词

你是一个专业的任务执行专家（Executor），负责完成具体的任务项。

## 系统上下文

{{systemContext}}

## 可用工具

系统会动态为你提供可用的工具。

## 工具调用去重策略（重要）

**必须严格遵守**：在调用任何 MCP 工具之前，必须先检查对话历史中是否已经调用过相同的工具并获得了结果。

## 输出格式

```json
{
  "type": "component",
  "component": "executor-response",
  "summary": "任务执行总结",
  "todos": [
    {
      "id": "task-id-1",
      "description": "已完成的任务描述",
      "priority": 1,
      "status": "completed"
    }
  ]
}
```
```

**关键特点**：
- 强调工具调用去重策略，避免重复调用
- 要求输出包含所有任务的当前状态
- 支持任务状态更新（pending → executing → completed）

### Verifier 提示词示例

```markdown
# Verifier Agent 提示词

你是一个专业的任务验收专家（Verifier），负责验证所有任务的完成情况。

## 输出格式

```json
{
  "type": "component",
  "component": "verifier-response",
  "allCompleted": true,
  "overallFeedback": "整体完成情况良好",
  "tasks": [
    {
      "id": "task-1",
      "completed": true,
      "feedback": "任务完成良好"
    }
  ]
}
```
```

**关键特点**：
- 专注于验证和评估
- 输出包含每个任务的完成状态和反馈
- 提供整体评估

### 系统上下文注入

**示例**：在转写管理系统中

```typescript
const APP_SYSTEM_CONTEXT = `
你正在一个**转写管理系统**中工作，该系统主要处理：

- **转写资源（Transcription Resource）**：需要进行转写的音频或视频文件
- **转写任务（Transcription Task）**：对转写资源执行转写操作的具体任务
  - 状态：pending、running、completed、failed
  - 转写完成后会生成转写结果（SRT 字幕文件或 JSON 格式）
`;

const promptManager = new PromptManager();
promptManager.setSystemContext(APP_SYSTEM_CONTEXT);
```

运行时，所有模板中的 `{{systemContext}}` 都会被替换为上述内容。

### 提示词定制

#### 1. 覆盖默认模板

```typescript
const promptManager = new PromptManager();

// 覆盖 Planner 模板
promptManager.setTemplate('planner', `
你是一个自定义的规划专家...
{{systemContext}}
...
`);
```

#### 2. 添加新的 Agent 类型

```typescript
// 1. 扩展 AgentType
type AgentType = 'planner' | 'executor' | 'verifier' | 'reviewer';

// 2. 添加新模板
promptManager.setTemplate('reviewer', `
你是一个代码审查专家...
{{systemContext}}
...
`);

// 3. 在 AgentWorkflowEngine 中添加新的执行逻辑
```

---

## 如何基于该 Framework 构建新应用

### 步骤 1：实现 IAgentBackend 接口

创建一个适配器类，实现 `IAgentBackend` 接口：

```typescript
import { IAgentBackend, IChatCompletionOptions } from './agent-framework/core/interfaces';
import { AIMessage, ToolCall } from './agent-framework/core/types';

export class MyAgentBackend implements IAgentBackend {
  async chatCompletion(options: IChatCompletionOptions): Promise<void> {
    const { configId, messages, tools, systemMessage, eventId } = options;
    
    // 调用你的 AI API
    await yourAIService.chat({
      configId,
      messages: this.convertMessages(messages),
      tools,
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
    // 执行工具调用
    return await yourToolService.execute(serverName, toolName, args, context);
  }

  async saveMessage(message: AIMessage, chatId: string): Promise<void> {
    // 保存消息到数据库
    await yourDatabase.saveMessage(chatId, message);
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
    // 监听流式响应
    return await yourStreamService.listen(eventId, callbacks);
  }
}
```

### 步骤 2：配置系统上下文

定义你的应用特定的系统上下文：

```typescript
const MY_APP_SYSTEM_CONTEXT = `
你正在一个**我的应用**中工作，该系统主要处理：

- **资源类型 A**：描述...
- **资源类型 B**：描述...
- **操作类型**：描述...

重要规则：
- 规则 1
- 规则 2
`;
```

### 步骤 3：初始化框架

```typescript
import { AgentWorkflowEngine } from './agent-framework/workflow/AgentWorkflowEngine';
import { PromptManager } from './agent-framework/prompts/PromptManager';
import { MyAgentBackend } from './adapters/MyAgentBackend';

// 初始化依赖
const backend = new MyAgentBackend();
const promptManager = new PromptManager();

// 设置系统上下文
promptManager.setSystemContext(MY_APP_SYSTEM_CONTEXT);

// 可选：覆盖默认模板
promptManager.setTemplate('planner', CUSTOM_PLANNER_TEMPLATE);

// 初始化引擎
const engine = new AgentWorkflowEngine(backend, promptManager);
```

### 步骤 4：运行工作流

```typescript
async function handleUserRequest(userMessage: string) {
  await engine.run({
    configId: 'your-config-id',
    chatId: 'your-chat-id',
    userMessage,
    initialMessages: [], // 历史消息
    systemMessage: '', // 额外的系统消息
    tools: availableTools, // 可用工具列表
    context: {
      // 应用特定的上下文
      currentResourceId: 'resource-123',
      currentTaskId: 'task-456',
    },
    mcpServers: mcpServers, // MCP 服务器列表（如果使用）
  }, {
    onMessageUpdate: (messages) => {
      // 更新 UI 显示消息
      updateUI(messages);
    },
    onLog: (msg) => {
      console.log(`[Agent] ${msg}`);
    },
    onError: (error) => {
      console.error('Agent Error:', error);
    },
  });
}
```

### 步骤 5：自定义提示词（可选）

如果需要针对你的应用定制提示词，可以：

1. **修改默认模板**：
   - 编辑 `src/agent-framework/prompts/templates.ts`
   - 或使用 `promptManager.setTemplate()` 覆盖

2. **添加应用特定的指导**：
   - 在系统上下文中添加领域知识
   - 在模板中添加应用特定的规则

### 步骤 6：处理响应（可选）

框架会自动解析 Agent 的 JSON 响应，但你也可以自定义处理：

```typescript
// 在 AgentWorkflowEngine 中，响应已经被解析
// 但你可以在 onMessageUpdate 中访问解析后的数据

onMessageUpdate: (messages) => {
  messages.forEach(msg => {
    if (msg.agentType === 'planner') {
      // 处理 Planner 响应
      const response = parsePlannerResponse(msg.content);
      // ...
    } else if (msg.agentType === 'executor') {
      // 处理 Executor 响应
      const response = parseExecutorResponse(msg.content);
      // ...
    }
  });
}
```

### 完整示例

```typescript
import { AgentWorkflowEngine } from './agent-framework/workflow/AgentWorkflowEngine';
import { PromptManager } from './agent-framework/prompts/PromptManager';
import { MyAgentBackend } from './adapters/MyAgentBackend';

const MY_APP_SYSTEM_CONTEXT = `
你正在一个**任务管理系统**中工作...
`;

class MyApp {
  private engine: AgentWorkflowEngine;

  constructor() {
    const backend = new MyAgentBackend();
    const promptManager = new PromptManager();
    promptManager.setSystemContext(MY_APP_SYSTEM_CONTEXT);
    
    this.engine = new AgentWorkflowEngine(backend, promptManager);
  }

  async handleUserRequest(userMessage: string, chatId: string) {
    await this.engine.run({
      configId: 'default-config',
      chatId,
      userMessage,
      initialMessages: [],
      systemMessage: '',
      tools: this.getAvailableTools(),
      context: {
        userId: 'user-123',
      },
    }, {
      onMessageUpdate: (messages) => {
        this.updateChatUI(chatId, messages);
      },
      onLog: (msg) => {
        console.log(`[Agent] ${msg}`);
      },
      onError: (error) => {
        this.showError(error);
      },
    });
  }

  stop() {
    this.engine.stop();
  }
}
```

### 最佳实践

1. **系统上下文设计**：
   - 清晰描述应用领域和核心概念
   - 说明重要的业务规则和约束
   - 提供工具使用指导

2. **提示词优化**：
   - 明确输出格式要求
   - 强调重要的执行规则（如工具调用去重）
   - 提供示例输出

3. **错误处理**：
   - 实现完善的错误处理逻辑
   - 记录错误日志便于调试
   - 提供用户友好的错误提示

4. **性能优化**：
   - 合理设置循环次数限制（Planner 3 轮，Executor 10 轮）
   - 实现工具调用去重（框架已内置）
   - 使用流式响应提升用户体验

5. **测试**：
   - 测试不同复杂度的任务
   - 测试错误场景
   - 测试工具调用逻辑

---

## 总结

Agent Framework 提供了一个强大的多 Agent 协作框架，通过职责分离和结构化流程，能够有效处理复杂任务。通过实现 `IAgentBackend` 接口和配置系统上下文，可以快速将该框架应用到不同的业务场景中。

**核心优势**：
- ✅ 职责分离，提示词精准
- ✅ 任务规划能力强
- ✅ 质量保证机制
- ✅ 工具调用优化
- ✅ 易于扩展和定制

**适用场景**：
- 复杂任务处理
- 需要工具调用的场景
- 需要质量保证的应用
- 需要任务规划和优先级管理的系统

