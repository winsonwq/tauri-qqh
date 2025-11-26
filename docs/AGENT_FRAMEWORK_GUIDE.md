# Agent Framework 使用指南

> **在线演示**：访问 [Agent Framework 介绍网站](https://assets.metaplus.zone/uPic/agent_workflow.html) 查看介绍。

## 目录

1. [功能和解决问题简介](#功能和解决问题简介)
2. [架构设计](#架构设计)
3. [MCP Tools 调用逻辑](#mcp-tools-调用逻辑)
4. [AI 数据返回与自定义组件渲染](#ai-数据返回与自定义组件渲染)
5. [代码逻辑 vs 提示词逻辑的设计平衡](#代码逻辑-vs-提示词逻辑的设计平衡)
6. [提示词架构设计](#提示词架构设计)
7. [如何基于该 Framework 构建新应用](#如何基于该-framework-构建新应用)

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
   ├─ 检查任务是否已完成（优先检查对话历史）
   ├─ 检查工具调用历史，避免重复调用
   ├─ 按优先级执行任务
   ├─ 调用工具获取信息（仅在需要时）
   └─ 处理和分析数据
   ↓
Verifier（验证者）
   ├─ 验证任务完成情况
   └─ 评估完成质量
   ↓
Planner（总结者）
   ├─ 基于最近一次 planner 发出的任务执行结果
   ├─ 满足用户的原始描述
   └─ 统一总结输出（使用 summary-response 组件）
   ↓
返回最终结果
```

### 解决的问题

1. **复杂任务分解**：将复杂的用户需求自动分解为可执行的子任务
2. **任务优先级管理**：自动为任务分配优先级，确保重要任务优先执行
3. **工具调用优化**：Executor 会检查对话历史，避免重复调用相同工具
4. **任务完成判断**：Executor 优先检查对话历史，如果任务已完成则直接返回，提高执行效率
5. **任务验证机制**：通过 Verifier 确保任务完成质量
6. **任务总结机制**：Verifier 在所有任务完成后直接提供最终总结（`summary` 字段），回答用户问题；如果未完成则提供改进建议（`improvements` 字段）
7. **改进反馈机制**：Verifier 的改进建议会传递给 Planner，用于下一轮任务规划
8. **结构化输出**：所有 Agent 输出标准化的 JSON 格式，便于解析和展示

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
   - 优先检查任务是否已完成（检查对话历史）
   - 检查工具调用历史，避免重复调用
   - 按优先级执行任务
   - 调用工具获取信息（仅在需要时）
   - 检查任务完成状态

3. Verifier Loop（1 轮）
   - 验证所有任务完成情况
   - 评估完成质量

4. Verifier 总结（如果所有任务完成）
   - 验证所有任务完成情况
   - 评估是否满足用户原始需求
   - 直接提供最终总结（`summary` 字段），回答用户问题
   - 如果未完成，提供改进建议（`improvements` 字段）供下一轮规划参考
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
- `ExecutorResponse`: Executor 响应格式（包含流程控制字段：`taskCompleted`、`shouldContinue`、`nextAction`）
- `VerifierResponse`: Verifier 响应格式（包含 `summary` 和 `improvements` 字段）
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
   ├─ 解析 VerifierResponse
   ├─ 如果 allCompleted && userNeedsSatisfied：
   │   └─ 返回 summary（最终总结）
   └─ 如果未完成：
       └─ 返回 improvements（改进建议）→ 传递给 Planner 进行下一轮规划
   ↓
返回结果
```

---

## MCP Tools 调用逻辑

### 概述

Agent Framework 支持通过 MCP (Model Context Protocol) 协议调用外部工具。框架在 Executor Agent 执行任务时，会自动处理工具调用请求，包括工具发现、服务器查找、参数解析、执行和结果处理等完整流程。

框架通过抽象接口 `IAgentBackend` 与具体的工具执行实现解耦，使得框架本身不依赖于特定的后端实现（如 Tauri、Node.js 等），可以灵活适配不同的运行环境。

### 调用流程

```
Executor Agent 生成响应
   ↓
解析 toolCalls（工具调用请求）
   ↓
遍历每个工具调用
   ├─ 解析工具参数（JSON）
   ├─ 查找工具所属的 MCP 服务器
   ├─ 调用 backend.executeTool()
   │   └─ 通过 IAgentBackend 接口执行工具
   │       └─ 返回执行结果
   ├─ 格式化工具结果为 AIMessage
   ├─ 保存工具结果消息
   └─ 更新消息列表
   ↓
工具结果添加到对话历史
   ↓
继续 Executor 循环（使用工具结果）
```

### 核心组件

#### 1. 工具发现和注册

**位置**：`src/utils/toolUtils.ts`

**功能**：从所有已连接的 MCP 服务器中收集可用工具

```typescript
export function getAvailableTools(mcpServers: MCPServerInfo[]): MCPTool[] {
  const tools: MCPTool[] = []
  mcpServers.forEach((server) => {
    // 只包含 enabled 为 true 且已连接的服务器
    const isEnabled = server.config.enabled ?? true
    if (isEnabled && server.status === 'connected' && server.tools) {
      tools.push(...server.tools)
    }
  })
  return tools
}
```

**关键点**：
- 只返回 `enabled` 为 `true` 的服务器工具
- 只包含 `status === 'connected'` 的服务器
- 工具列表在 `runAgentWorkflow` 中通过 `getAvailableTools(mcpServers)` 获取并传递给 AI
- 工具列表会作为 `tools` 参数传递给 AI 模型，使其知道可以调用哪些工具

#### 2. 服务器查找

**位置**：`src/agent-framework/workflow/AgentWorkflowEngine.ts`

**功能**：根据工具名称查找对应的 MCP 服务器

```typescript
private findToolServer(toolName: string, mcpServers: any[]): any {
    return mcpServers.find((s: any) => s.tools?.some((t: any) => t.name === toolName));
}
```

**查找逻辑**：
- 遍历所有 MCP 服务器
- 检查每个服务器的工具列表
- 返回包含指定工具名称的服务器
- 如果找不到，返回 `undefined`（使用 `'default'` 作为后备）

**为什么需要查找服务器**：
- MCP 工具可能来自不同的服务器
- 框架需要知道工具属于哪个服务器，以便正确路由工具调用
- 服务器信息（如 `serverName`）会传递给 `executeTool` 接口

#### 3. 工具调用执行

**位置**：`src/agent-framework/workflow/AgentWorkflowEngine.ts` (Executor Loop)

**执行步骤**：

1. **解析工具调用**：
   ```typescript
   if (response.toolCalls && response.toolCalls.length > 0) {
       for (const toolCall of response.toolCalls) {
           // 解析工具参数
           let args = {};
           try {
               args = JSON.parse(toolCall.function.arguments);
           } catch {}
   ```

2. **查找服务器**：
   ```typescript
   const server = this.findToolServer(toolCall.function.name, options.mcpServers || []);
   const serverName = server ? (server.key || server.name) : 'default';
   ```

3. **执行工具**：
   ```typescript
   const result = await this.backend.executeTool(
       serverName,
       toolCall.function.name,
       args,
       { 
           currentResourceId: options.context?.currentResourceId, 
           currentTaskId: options.context?.currentTaskId 
       }
   );
   ```

4. **格式化结果**：
   ```typescript
   const toolResultMsg: AIMessage = {
       id: Date.now().toString() + Math.random(),
       role: 'tool',
       content: JSON.stringify(result),
       timestamp: new Date(),
       tool_call_id: toolCall.id,
       name: toolCall.function.name
   };
   ```

5. **保存和更新**：
   ```typescript
   toolResults.push(toolResultMsg);
   await this.backend.saveMessage(toolResultMsg, chatId);
   updateMessages(prev => [...prev, ...toolResults]);
   ```

**关键设计**：
- 框架通过 `IAgentBackend.executeTool()` 接口执行工具，不关心具体实现
- 工具结果被格式化为标准的 `AIMessage` 格式
- 工具结果会被添加到对话历史，供后续 AI 调用使用

#### 4. 工具执行接口抽象

**接口定义**：`src/agent-framework/core/interfaces.ts`

框架通过 `IAgentBackend` 接口抽象工具执行逻辑：

```typescript
interface IAgentBackend {
  // 执行 MCP 工具
  executeTool(
    serverName: string,
    toolName: string,
    args: any,
    context?: Record<string, any>
  ): Promise<any>;
  
  // 其他方法...
}
```

**设计优势**：
- **解耦**：框架不依赖具体的后端实现
- **可扩展**：可以轻松实现不同的后端适配器（Tauri、Node.js、Web API 等）
- **可测试**：可以创建 Mock 实现进行单元测试
- **灵活性**：不同的应用可以根据自己的环境选择合适的实现

**实现要求**：
- 实现类需要处理工具的实际执行逻辑
- 需要根据 `serverName` 路由到正确的 MCP 服务器
- 需要处理工具执行错误并返回适当的结果
- 可以传递应用特定的上下文信息（如 `currentResourceId`、`currentTaskId`）

### 工具调用去重策略

Executor Agent 的提示词中明确要求：

> **必须严格遵守**：在调用任何 MCP 工具之前，必须先检查对话历史中是否已经调用过相同的工具并获得了结果。

#### 检查方法

Executor Agent 需要按照以下步骤检查对话历史：

1. **查找工具调用历史**：在对话历史中查找所有 `role: "assistant"` 且包含 `tool_calls` 的消息
2. **匹配工具名称和参数**：检查是否已有相同工具名称（`tool_calls[].function.name`）和相同参数（`tool_calls[].function.arguments`）的调用
3. **查找对应的工具结果**：在对话历史中查找 `role: "tool"` 且 `name` 匹配、`tool_call_id` 对应的消息，这些消息的 `content` 就是工具返回的结果

#### 判断规则

- **如果找到完全匹配的工具调用和结果**：
  - ✅ **直接使用已有结果**，不要再次调用工具
  - 在响应中说明："已在对话历史中找到该工具调用的结果，直接使用。"
- **如果没有找到匹配的工具调用**：
  - ✅ **可以调用工具**获取新结果
- **如果找到工具调用但结果不完整或错误**：
  - ✅ **可以重新调用工具**，但应在响应中说明原因

#### 实现方式

这个策略通过以下方式实现：

1. **提示词指导**：在 Executor 提示词中明确要求检查对话历史，并提供详细的检查方法和判断规则
2. **上下文传递**：Executor 的每次调用都会包含完整的对话历史（包括之前的工具调用结果）
3. **AI 模型判断**：AI 模型会根据对话历史判断是否需要调用工具，避免重复调用

#### 为什么需要去重

- 避免不必要的工具调用，节省时间和资源
- 提高任务执行效率
- 减少对工具服务器的负载
- 确保任务执行的一致性（使用相同的数据源）

### 工具调用上下文

框架在调用工具时会传递以下上下文信息：

- `currentResourceId`：当前资源 ID（如果存在）
- `currentTaskId`：当前任务 ID（如果存在）

这些上下文信息通过 `options.context` 传递，最终会传递给 `backend.executeTool()` 的 `context` 参数。某些工具可能会使用这些信息来执行特定操作或访问相关资源。

### 错误处理

框架层面的错误处理策略：

1. **参数解析错误**：如果工具参数 JSON 解析失败，使用空对象 `{}` 继续执行
2. **服务器查找失败**：如果找不到工具对应的服务器，使用 `'default'` 作为后备
3. **工具执行错误**：捕获异常并记录错误，但不中断整个工作流

```typescript
try {
    // ... 工具调用逻辑
} catch (err) {
    console.error(err);
    // Handle error - 继续执行其他工具或任务
}
```

**设计考虑**：
- 单个工具调用失败不应该中断整个任务执行流程
- 错误信息会被记录，便于调试
- 框架将错误处理的责任部分交给实现层，部分由框架统一处理

### 工具结果处理

工具执行结果会被：

1. **格式化为 AIMessage**：包含 `role: 'tool'`、`tool_call_id`、`name` 等字段，符合 AI 模型的消息格式要求
2. **保存到存储**：通过 `backend.saveMessage()` 保存，具体存储方式由实现层决定
3. **添加到消息列表**：通过 `updateMessages()` 更新 UI，让用户看到工具调用结果
4. **传递给下一轮对话**：工具结果会出现在对话历史中，供 AI 模型使用，实现多轮工具调用

**消息格式**：
```typescript
{
    role: 'tool',
    content: JSON.stringify(result),  // 工具执行结果（JSON 字符串）
    tool_call_id: toolCall.id,        // 关联的工具调用 ID
    name: toolCall.function.name      // 工具名称
}
```

### 完整示例

假设 Executor Agent 需要调用 `get_system_info` 工具：

1. **AI 响应包含工具调用**：
   ```json
   {
     "tool_calls": [{
       "id": "call_123",
       "function": {
         "name": "get_system_info",
         "arguments": "{\"include_details\": true}"
       }
     }]
   }
   ```

2. **框架解析并执行**：
   ```typescript
   // 1. 解析工具调用
   const toolCall = response.toolCalls[0];
   const args = JSON.parse(toolCall.function.arguments); // { include_details: true }
   
   // 2. 查找服务器
   const server = findToolServer('get_system_info', mcpServers);
   const serverName = server.key || server.name;
   
   // 3. 执行工具（通过抽象接口）
   const result = await backend.executeTool(serverName, 'get_system_info', args);
   
   // 4. 格式化结果
   const toolResultMsg = {
       role: 'tool',
       content: JSON.stringify(result),
       tool_call_id: 'call_123',
       name: 'get_system_info'
   };
   ```

3. **结果添加到对话历史**：
   - 工具结果消息被保存
   - 下一轮 Executor 调用会包含这个工具结果
   - AI 模型可以使用工具结果继续执行任务

### 注意事项

1. **工具可用性**：只有已连接且启用的 MCP 服务器的工具才会被提供给 AI
2. **服务器查找**：如果多个服务器提供同名工具，会返回第一个匹配的服务器
3. **参数验证**：框架不验证工具参数，参数验证由工具本身或实现层处理
4. **异步执行**：工具调用是异步的，框架会等待所有工具调用完成后再继续
5. **错误恢复**：单个工具调用失败不会中断整个工作流，但会影响任务执行结果
6. **接口抽象**：框架通过 `IAgentBackend` 接口与具体实现解耦，可以适配不同的运行环境

---

## AI 数据返回与自定义组件渲染

### 概述

Agent Framework 支持流式响应（Streaming）和自定义组件渲染机制，使得 AI 返回的数据可以以渐进式的方式展示，并且支持通过 Web Components 或 React 组件进行丰富的交互式展示。

### 流式响应（Streaming）

#### 流式数据格式

框架通过事件机制接收流式数据，支持以下事件类型：

1. **content**：文本内容流
2. **tool_calls**：工具调用请求
3. **reasoning**：AI 推理过程（thinking）
4. **done**：流式响应完成
5. **stopped**：流式响应被停止

#### 流式响应处理流程

```
AI 开始生成响应
   ↓
前端监听流式事件
   ↓
接收 content 事件
   ├─ 实时更新消息内容
   ├─ 触发组件重新渲染
   └─ 支持部分 JSON 解析
   ↓
接收 tool_calls 事件
   ├─ 保存工具调用信息
   ├─ 判断是否需要用户确认
   └─ 更新消息状态
   ↓
接收 reasoning 事件（可选）
   ├─ 累积推理内容
   └─ 单独展示推理过程
   ↓
接收 done/stopped 事件
   ├─ 保存完整消息
   ├─ 执行待处理的工具调用
   └─ 清理流式状态
```

#### 流式响应实现

**位置**：`src/hooks/useStreamResponse.ts`

```typescript
const unlisten = await listen(eventName, (event) => {
  const payload = event.payload
  
  if (payload.type === 'content' && payload.content) {
    // 实时更新消息内容
    finalContent += payload.content
    updateMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, content: msg.content + payload.content }
          : msg
      )
    )
  } else if (payload.type === 'tool_calls' && payload.tool_calls) {
    // 处理工具调用
    finalToolCalls = payload.tool_calls
    // ...
  } else if (payload.type === 'reasoning' && payload.content) {
    // 处理推理内容
    finalReasoning += payload.content
    // ...
  } else if (payload.type === 'done' || payload.type === 'stopped') {
    // 流式响应完成
    // 保存消息、执行工具调用等
  }
})
```

**关键特性**：
- **实时更新**：内容逐字符/逐块更新，提供流畅的用户体验
- **状态管理**：通过 `updateMessages` 实时更新 UI 状态
- **部分解析**：支持在流式传输过程中解析部分 JSON，实现渐进式渲染

### 自定义组件渲染

框架支持两种类型的自定义组件：

1. **Web Components**：标准的 Web Components（HTML 字符串）
2. **React Components**：通过组件注册表管理的 React 组件

#### 组件类型定义

**位置**：`src/componets/AI/ToolResultDisplay.tsx`

```typescript
export interface ToolResultContentItem {
  type: 'text' | 'json' | 'webcomponent' | 'component'
  value?: string        // webcomponent: HTML 字符串
  component?: string   // component: 组件名称
  props?: Record<string, any>  // component: 组件属性
}
```

#### Web Components 渲染

**特点**：
- 使用 `dangerouslySetInnerHTML` 渲染 HTML 字符串
- 浏览器自动识别并初始化 Web Components
- 支持自定义元素（Custom Elements）和 Shadow DOM

**实现**：

```typescript
case 'webcomponent':
  if (item.value) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: item.value }}
      />
    )
  }
```

**使用场景**：
- 需要完全独立的组件（不受 React 生命周期影响）
- 需要 Shadow DOM 隔离样式
- 需要与第三方 Web Components 库集成

**示例**：
```json
{
  "type": "webcomponent",
  "value": "<my-custom-element data-id='123'></my-custom-element>"
}
```

#### React Components 渲染

**组件注册表机制**：

**位置**：`src/componets/AI/ComponentRegistry.tsx`

```typescript
class ComponentRegistry {
  private components: Map<string, ToolComponent> = new Map()

  // 注册组件
  register(name: string, component: ToolComponent) {
    this.components.set(name, component)
  }

  // 获取组件
  get(name: string): ToolComponent | undefined {
    return this.components.get(name)
  }

  // 渲染组件
  render(name: string, props: ComponentProps): React.ReactElement | null {
    const Component = this.get(name)
    if (!Component) return null
    return React.createElement(Component, { props })
  }
}
```

**组件注册**：

**位置**：`src/componets/AI/ComponentInit.tsx`

```typescript
export function initComponents() {
  // 注册工具组件
  componentRegistry.register('resource-info', ResourceInfo)
  componentRegistry.register('task-info', TaskInfo)
  componentRegistry.register('resource-list', ResourceList)
  
  // 注册 Agent 响应组件
  componentRegistry.register('planner-response', PlannerResponseAdapter)
  componentRegistry.register('executor-response', ExecutorResponseAdapter)
  componentRegistry.register('verifier-response', VerifierResponseAdapter)
  
  // 注册字段级组件
  componentRegistry.register('todo-list', TodoListAdapter)
}
```

**组件渲染**：

```typescript
case 'component':
  if (item.component && item.props) {
    return (
      <ComponentRenderer
        component={item.component}
        props={item.props}
      />
    )
  }
```

**使用场景**：
- 需要与 React 生态系统集成
- 需要 React Hooks、Context 等特性
- 需要与框架的其他 React 组件交互

**示例**：
```json
{
  "type": "component",
  "component": "todo-list",
  "props": {
    "todos": [
      { "id": "task-1", "description": "任务描述", "status": "pending" }
    ]
  }
}
```

### Streaming + 自定义组件绑定

#### 渐进式渲染

框架支持在流式传输过程中渐进式渲染组件：

1. **部分 JSON 解析**：
   ```typescript
   // 解析部分 JSON（即使不完整）
   const parsed = parsePartialJson<PlannerResponse>(content)
   
   // 如果 JSON 不完整但有部分数据，尝试渲染
   if (parsed?.data && Object.keys(parsed.data).length > 0) {
     // 使用组件渲染部分数据
   }
   ```

2. **实时更新**：
   - 流式传输过程中，组件会随着内容更新而重新渲染
   - 支持显示"正在输入"的光标效果
   - 组件可以响应数据变化，更新 UI

3. **组件状态管理**：
   ```typescript
   // 流式传输时显示光标
   {showCursor && <span className="ai-cursor" />}
   
   // 组件根据内容变化自动更新
   const parsed = useMemo(() => {
     return parsePartialJson<PlannerResponse>(content)
   }, [content])  // content 变化时重新解析
   ```

#### 事件绑定机制

**React Components 事件绑定**：

React 组件天然支持事件绑定，通过 props 传递事件处理函数：

```typescript
// 组件定义
const TodoList: React.FC<TodoListProps> = ({ todos, onClick }) => {
  return (
    <div onClick={onClick}>
      {/* ... */}
    </div>
  )
}

// 使用组件时传递事件处理函数
<ComponentRenderer
  component="todo-list"
  props={{
    todos: [...],
    onClick: (todo) => {
      // 处理点击事件
    }
  }}
/>
```

**Web Components 事件绑定**：

Web Components 通过标准 DOM 事件机制绑定事件：

```typescript
// 渲染 Web Component
<div dangerouslySetInnerHTML={{ __html: htmlString }} />

// 事件绑定（在 useEffect 中）
useEffect(() => {
  const element = containerRef.current?.querySelector('my-custom-element')
  if (element) {
    element.addEventListener('custom-event', handleCustomEvent)
    return () => {
      element.removeEventListener('custom-event', handleCustomEvent)
    }
  }
}, [htmlString])
```

**自定义事件通信**：

组件可以通过自定义事件与框架通信：

```typescript
// 组件触发自定义事件
const handleAction = () => {
  const event = new CustomEvent('component-action', {
    detail: { action: 'click', data: {...} }
  })
  window.dispatchEvent(event)
}

// 框架监听自定义事件
useEffect(() => {
  const handler = (e: CustomEvent) => {
    // 处理组件事件
  }
  window.addEventListener('component-action', handler as EventListener)
  return () => {
    window.removeEventListener('component-action', handler as EventListener)
  }
}, [])
```

### 设计优势

| 优势维度 | 特性 | 说明 | 实现方式 |
|---------|------|------|---------|
| **灵活性** | 多种内容类型支持 | 支持文本、JSON、Web Components、React Components 等多种内容类型 | `ToolResultContentItem` 类型定义，支持 `text`、`json`、`webcomponent`、`component` 四种类型 |
| | 渐进式渲染 | 支持流式传输过程中的部分渲染，即使 JSON 不完整也能显示已有数据 | `parsePartialJson` 函数解析部分 JSON，组件支持部分数据渲染 |
| | 流畅的用户体验 | 实时更新 UI，提供即时反馈 | 流式响应机制，实时更新消息内容 |
| **可扩展性** | 组件注册机制 | 通过注册表管理组件，易于扩展和维护 | `ComponentRegistry` 类提供注册、获取、渲染功能 |
| | 动态注册 | 支持运行时动态注册新组件 | `componentRegistry.register()` 方法 |
| | 适配器模式 | 框架组件通过适配器接入注册表，保持独立性 | 适配器组件（如 `PlannerResponseAdapter`）桥接框架组件和注册表 |
| | 组件复用 | 支持组件复用和组合 | 统一的组件接口，组件可以独立开发和测试 |
| **实时性** | 流式响应支持 | 实时更新 UI，无需等待完整响应 | 事件监听机制（`content`、`tool_calls`、`reasoning` 等事件类型） |
| | 即时反馈 | 支持显示"正在输入"状态，提供即时反馈 | `showCursor` 状态，流式传输时显示光标效果 |
| | 响应式更新 | 组件自动响应数据变化 | React Hooks（`useMemo`、`useEffect`）实现响应式更新 |
| | 部分数据渲染 | 支持部分数据渲染，提升用户体验 | 组件内部检查数据完整性，支持部分数据展示 |
| **解耦设计** | 组件与框架解耦 | 组件通过注册表管理，不直接依赖框架 | 组件注册表作为中间层，组件只需实现标准接口 |
| | 独立开发 | 组件可以独立开发和测试 | 组件不依赖框架内部实现，只需符合接口规范 |
| | 组件库复用 | 支持组件库的复用 | 统一的组件接口（`ToolComponent`）和属性格式（`ComponentProps`） |
| | 接口抽象 | 统一的组件接口和属性格式 | `ToolComponent` 类型定义，`ComponentProps` 统一属性格式 |
| | 易于替换 | 易于替换和扩展组件 | 通过注册表替换组件实现，不影响使用方 |
| **类型安全** | TypeScript 支持 | 完整的类型定义，编译时类型检查 | `ToolResultContentItem`、`ToolComponent`、`ComponentProps` 等类型定义 |
| | IDE 支持 | 良好的 IDE 自动补全和类型提示 | TypeScript 类型系统提供完整的类型信息 |
| | 运行时验证 | 组件存在性检查，属性格式验证 | `ComponentRenderer` 检查组件是否存在，提供错误提示 |
| | 错误处理 | 完善的错误处理和降级机制 | 组件不存在时显示错误提示，JSON 解析失败时降级为文本显示 |

### 完整示例

#### 示例 1：流式渲染 Planner 响应

```typescript
// 1. AI 开始流式返回数据
// 流式内容: {"type":"component","component":"planner-response","summary":"规划中"
// 流式内容: ,"todos":[{"id":"task-1","description":"任务1"
// 流式内容: ,"priority":1}]}

// 2. 框架实时解析和渲染
const parsed = parsePartialJson<PlannerResponse>(content)
// parsed.data = { summary: "规划中", todos: [{ id: "task-1", ... }] }

// 3. 组件渐进式渲染
<PlannerResponseDisplay content={content} />
// 组件内部：
// - 解析部分 JSON
// - 显示已解析的 summary
// - 显示已解析的 todos（即使不完整）
// - 显示"正在输入"光标
```

#### 示例 2：工具结果渲染自定义组件

```json
{
  "content": [
    {
      "type": "text",
      "value": "查询结果："
    },
    {
      "type": "component",
      "component": "resource-list",
      "props": {
        "resources": [
          { "id": "res-1", "name": "资源1" },
          { "id": "res-2", "name": "资源2" }
        ],
        "onClick": "handleResourceClick"
      }
    }
  ]
}
```

```typescript
// 解析工具结果
const items = parseToolResultContent(content)

// 渲染组件
<ToolResultDisplay items={items} />

// ComponentRenderer 查找并渲染组件
<ComponentRenderer
  component="resource-list"
  props={{
    resources: [...],
    onClick: handleResourceClick
  }}
/>
```

#### 示例 3：Web Component 事件绑定

```typescript
// 1. 渲染 Web Component
const htmlString = '<my-chart data-id="123"></my-chart>'
<div dangerouslySetInnerHTML={{ __html: htmlString }} />

// 2. 绑定事件
useEffect(() => {
  const chartElement = containerRef.current?.querySelector('my-chart')
  if (chartElement) {
    const handleDataUpdate = (e: CustomEvent) => {
      // 处理数据更新事件
      updateChartData(e.detail.data)
    }
    
    chartElement.addEventListener('data-update', handleDataUpdate)
    
    return () => {
      chartElement.removeEventListener('data-update', handleDataUpdate)
    }
  }
}, [htmlString])
```

### 最佳实践

1. **组件设计**：
   - 组件应该是纯函数组件或使用 React Hooks
   - 组件应该处理 props 的默认值和边界情况
   - 组件应该提供清晰的错误处理

2. **流式渲染**：
   - 使用 `parsePartialJson` 处理部分 JSON
   - 在组件中使用 `useMemo` 优化解析性能
   - 提供加载状态和错误状态

3. **事件处理**：
   - 使用 React 事件处理（对于 React Components）
   - 使用 DOM 事件监听（对于 Web Components）
   - 及时清理事件监听器，避免内存泄漏

4. **组件注册**：
   - 在应用启动时统一注册组件
   - 使用有意义的组件名称
   - 提供组件文档和使用示例

---

## 代码逻辑 vs 提示词逻辑的设计平衡

### 设计理念

Agent Framework 采用**提示词优先、代码兜底**的设计理念，让 AI 通过提示词控制大部分执行逻辑，代码主要负责调用、解析和基础错误处理。

### 代码逻辑与提示词逻辑的占比

| 职责 | 代码逻辑占比 | 提示词逻辑占比 | 说明 |
|------|------------|--------------|------|
| **流程控制** | 30% | 70% | AI 通过 `taskCompleted`、`shouldContinue`、`nextAction` 控制流程 |
| **状态管理** | 20% | 80% | AI 在 JSON 响应中返回任务状态，代码负责解析和应用 |
| **任务完成判断** | 10% | 90% | AI 判断任务是否完成，代码只负责解析 JSON |
| **循环控制** | 50% | 50% | AI 决定是否继续，代码设置最大轮次限制作为兜底 |
| **工具调用** | 40% | 60% | AI 决定调用哪些工具，代码负责执行和错误处理 |
| **错误处理** | 70% | 30% | 代码负责异常捕获和基础错误处理，AI 负责业务逻辑错误判断 |

**总体占比**：代码逻辑约 **30-40%**，提示词逻辑约 **60-70%**

### 流程控制机制

#### 1. Executor 流程控制字段

Executor Agent 通过以下字段控制执行流程：

```json
{
  "taskCompleted": true,      // 当前任务是否已完成
  "shouldContinue": false,     // 是否需要继续执行
  "nextAction": "complete"     // 下一步动作：continue/complete/skip/retry
}
```

**代码实现**（`AgentWorkflowEngine.ts`）：

```typescript
// 优先使用 AI 返回的流程控制字段
if (executorResponse.taskCompleted !== undefined) {
    todoCompleted = executorResponse.taskCompleted;
} else if (executorResponse.nextAction === 'complete') {
    todoCompleted = true;
} else {
    // 从 todos 数组中推断状态
    const currentTask = executorResponse.todos?.find(t => t.id === todo.id);
    todoCompleted = currentTask?.status === 'completed';
}
```

#### 2. 最大轮次限制（兜底机制）

虽然 AI 可以控制流程，但代码保留最大轮次限制作为兜底：

```typescript
const maxExecutorRounds = 10;  // 每个任务最多 10 轮
const maxPlanningRounds = 3;  // Planner 最多 3 轮

while (!todoCompleted && executorRound < maxExecutorRounds && !this.isStopped) {
    // 执行任务...
}
```

**设计考虑**：
- **防止无限循环**：如果 AI 判断错误或陷入循环，最大轮次限制可以强制停止
- **资源保护**：避免消耗过多 API 调用和计算资源
- **用户体验**：防止任务执行时间过长

#### 3. 状态管理

任务状态由 AI 在 JSON 响应中返回，代码负责解析和应用：

```typescript
// AI 返回的状态
{
  "todos": [
    { "id": "task-1", "status": "completed" },
    { "id": "task-2", "status": "executing" }
  ]
}

// 代码应用状态
executorResponse.todos.forEach(t => {
    const existingTodo = todos.find(tt => tt.id === t.id);
    if (existingTodo) {
        existingTodo.status = t.status;  // 从 AI 响应中读取状态
    }
});
```

**优势**：
- AI 可以根据实际情况灵活调整状态
- 代码不需要硬编码状态转换逻辑
- 更容易适应不同的业务场景

### 改进前后对比

#### 改进前（代码逻辑占比大）

```typescript
// ❌ 关键词匹配判断完成
const completionKeywords = ['任务完成', '已完成', '完成'];
const todoCompleted = completionKeywords.some(k => contentLower.includes(k));

// ❌ 代码直接修改状态
todo.status = 'completed';
```

**问题**：
- 关键词匹配不够准确
- 状态管理逻辑硬编码在代码中
- 难以适应不同场景

#### 改进后（提示词逻辑占比大）

```typescript
// ✅ 解析 AI 返回的 JSON
const executorResponse = parseExecutorResponse(response.content);

// ✅ 使用 AI 返回的状态
if (executorResponse.taskCompleted !== undefined) {
    todoCompleted = executorResponse.taskCompleted;
}

// ✅ 从 AI 响应中更新状态
executorResponse.todos.forEach(t => {
    existingTodo.status = t.status;  // AI 决定状态
});
```

**优势**：
- AI 可以做出更智能的判断
- 状态管理逻辑在提示词中，易于调整
- 代码更简洁，职责更清晰

### 最佳实践

1. **优先使用提示词逻辑**：
   - 让 AI 通过 JSON 响应控制流程
   - 代码只负责解析和应用

2. **保留必要的代码逻辑**：
   - 最大轮次限制（防止无限循环）
   - 异常处理和错误恢复
   - 基础的数据验证

3. **平衡设计**：
   - 关键决策由 AI 做出（提示词逻辑）
   - 安全和性能保障由代码提供（代码逻辑）

---

## 提示词架构设计

### 双层提示词架构

框架采用**双层提示词架构**，将提示词分为两个层级：

1. **框架层级（Core Templates）**：位于 `src/agent-framework/prompts/templates.ts`
   - 包含确保框架正常工作的核心提示词
   - 定义 Agent 角色、输出格式、框架约束等
   - 使用 `{{businessContext}}` 占位符注入业务上下文

2. **业务层级（Business Context）**：位于 `src/agents/prompts/*.md`
   - 包含与具体业务相关的系统提示词
   - 定义业务概念、业务规则、领域知识等
   - 每个 Agent 可以有独立的业务上下文

**最终的 System Message = 框架核心模板 + 业务上下文**

### 文件结构

```
src/
├── agent-framework/
│   └── prompts/
│       ├── templates.ts      # 框架核心模板（确保框架工作）
│       └── PromptManager.ts  # 提示词管理器（合并两层）
└── agents/
    └── prompts/
        ├── planner.md        # Planner 业务上下文
        ├── executor.md       # Executor 业务上下文
        └── verifier.md       # Verifier 业务上下文
```

### 框架核心模板结构

每个 Agent 的核心模板包含以下部分：

1. **角色定义**：明确 Agent 的身份和职责
2. **业务上下文占位符**：`{{businessContext}}` 用于注入业务上下文
3. **核心职责**：框架要求的基本职责
4. **输出格式**：明确要求输出 JSON 格式（必须遵守）
5. **框架约束**：确保框架正常工作的约束条件

### 业务上下文结构

每个 Agent 的业务上下文（.md 文件）包含：

1. **核心概念**：业务领域的核心概念定义
2. **业务规则**：特定于业务的规则和约束
3. **操作指南**：业务相关的操作步骤和策略

### 框架核心模板

**位置**：`src/agent-framework/prompts/templates.ts`

以下是三个 Agent 的完整系统提示词模板：

#### Planner 核心模板

```typescript
export const PLANNER_CORE_TEMPLATE = `
# Planner Agent

你是一个专业的任务规划专家（Planner），负责将用户的需求分解成可执行的任务列表。

## 业务上下文

{{businessContext}}

## 核心职责

1. **理解用户需求**：仔细分析用户提出的问题或任务，理解其核心目标和期望结果。

2. **参考改进措施**：如果上一轮规划执行后 Verifier 提出了改进措施（improvements），必须将这些改进措施作为本次任务规划的重要参考：
   - 仔细阅读改进措施中指出的问题
   - 在新的任务规划中针对性地解决这些问题
   - 确保不再重复之前的错误或遗漏

3. **制定任务计划**：将复杂的需求分解成一系列清晰、具体、可执行的任务项（todos）。

4. **任务优先级**：为每个任务分配合理的优先级，确保重要任务优先执行。

5. **任务描述**：每个任务应该包含：
   - 明确的任务描述
   - 预期的完成标准
   - 执行该任务所需的关键信息

## 输出格式（必须遵守）

当你完成规划后，请以 JSON 格式输出任务列表：

\`\`\`json
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
\`\`\`

### 字段说明

- \`needsMorePlanning\`: 布尔值，表示是否还需要进一步规划。如果当前规划已经完整，设置为 \`false\`；如果还需要更多信息或需要细化，设置为 \`true\`。
- \`todos\`: 任务数组，每个任务包含：
  - \`id\`: 唯一任务标识符
  - \`description\`: 任务描述
  - \`priority\`: 优先级（数字，1 为最高优先级）
  - \`status\`: 状态（初始为 "pending"）
- \`summary\`: 规划总结，简要说明你的规划思路

## 框架约束

- 任务应该具体、可执行，避免过于抽象的描述
- 考虑任务之间的依赖关系
- 如果用户需求不明确，可以设置 \`needsMorePlanning\` 为 \`true\` 并说明需要什么信息
- **避免重复规划**：如果已经规划了获取信息的任务，就不需要再次规划相同的任务。只有在确实需要补充或细化任务时才设置 \`needsMorePlanning\` 为 \`true\`
- **重要**：你只负责规划任务，不调用任何工具。工具调用由 Executor 执行，系统会自动为 Executor 提供可用的工具
- **注意**：任务完成后的总结由 Verifier 负责，你不需要提供总结
`;
```

#### Executor 核心模板

```typescript
export const EXECUTOR_CORE_TEMPLATE = `
# Executor Agent

你是一个专业的任务执行专家（Executor），负责完成具体的任务项。

## 业务上下文

{{businessContext}}

## 可用工具

系统会动态为你提供可用的工具。工具的具体名称、描述和参数由系统动态提供，你可以在调用时查看工具的定义。请仔细阅读每个工具的描述，了解其功能和返回值。

## 工具调用去重策略（重要）

**必须严格遵守**：在调用任何 MCP 工具之前，必须先检查对话历史中是否已经调用过相同的工具并获得了结果。

**检查方法**：
1. **查找工具调用历史**：在对话历史中查找所有 \`role: "assistant"\` 且包含 \`tool_calls\` 的消息
2. **匹配工具名称和参数**：检查是否已有相同工具名称（\`tool_calls[].function.name\`）和相同参数（\`tool_calls[].function.arguments\`）的调用
3. **查找对应的工具结果**：在对话历史中查找 \`role: "tool"\` 且 \`name\` 匹配、\`tool_call_id\` 对应的消息

**判断规则**：
- **如果找到完全匹配的工具调用和结果**：✅ **直接使用已有结果**，不要再次调用工具
- **如果没有找到匹配的工具调用**：✅ **可以调用工具**获取新结果
- **如果找到工具调用但结果不完整或错误**：✅ **可以重新调用工具**，但应在响应中说明原因

## 核心职责

### 1. 理解任务
仔细阅读任务描述，理解需要完成的具体工作。

### 2. 判断任务是否已完成（必须优先执行）

**检查对话历史**：如果对话历史中已经包含了任务要求的**具体结果数据**，则可以直接使用这些数据。

**重要**：仅当对话历史中存在**完整的、可直接使用的结果数据**时，才能认为任务已完成。以下情况**不算**已完成：
- 只有工具调用但没有结果
- 结果数据不完整
- 需要进一步处理或分析

**如果任务确实已完成**：
- 返回 JSON 响应，不需要再次调用工具
- 将任务状态标记为 \`"completed"\`
- **summary 必须包含实际的结果内容**，不能只说"任务已完成"
- 从对话历史中提取相关数据，在 summary 中详细说明结果

### 3. 执行任务（仅在任务未完成时）

1. **检查工具调用历史**（必须优先执行）
2. **调用工具获取信息**（仅在需要时）
3. **分析和处理数据**
4. **生成报告或结果**

### 4. 返回结果

提供清晰的完成报告，说明：
- 任务执行过程（如果跳过，说明原因）
- 获得的结果
- 遇到的问题（如有）

## 输出格式（必须遵守）

**重要**：无论任务是否已完成，都必须以 JSON 格式输出结果。

\`\`\`json
{
  "type": "component",
  "component": "executor-response",
  "summary": "任务执行总结",
  "taskCompleted": false,
  "shouldContinue": true,
  "nextAction": "continue",
  "todos": [
    {
      "id": "task-id-1",
      "description": "任务描述",
      "priority": 1,
      "status": "completed"
    },
    {
      "id": "task-id-2",
      "description": "当前任务描述",
      "priority": 2,
      "status": "executing",
      "isCurrent": true
    }
  ]
}
\`\`\`

### 字段说明

- **\`type\`**：**必须**，固定值 \`"component"\`
- **\`component\`**：**必须**，固定值 \`"executor-response"\`
- **\`summary\`**：**必须**，任务执行总结（字符串类型）
- **\`taskCompleted\`**：**必须**，布尔值，表示当前任务是否已完成。这是系统判断任务完成的主要依据。
- **\`shouldContinue\`**：**可选**，布尔值，表示是否需要继续执行当前任务。
- **\`nextAction\`**：**可选**，字符串，可选值：\`"continue"\`、\`"complete"\`、\`"skip"\`、\`"retry"\`
- **\`todos\`**：**必须**，任务列表数组。必须包含最近一次 planner 响应中的所有任务及其状态。
  - **\`isCurrent\`**：**可选**，标记当前正在处理的任务

**流程控制说明**：
- 系统会优先使用你返回的 \`taskCompleted\`、\`shouldContinue\` 和 \`nextAction\` 字段来控制执行流程
- 系统会保留最大执行轮次限制（10轮）作为兜底机制，防止无限循环

## 框架约束

- 专注于完成当前任务，不要偏离主题
- **必须遵守工具调用去重策略**
- 调用工具前，先查看工具定义，确保参数正确
- 工具调用失败时，尝试其他方法或说明原因
- **必须**以有效的 JSON 格式输出
`;
```

#### Verifier 核心模板

```typescript
export const VERIFIER_CORE_TEMPLATE = `
# Verifier Agent

你是一个专业的任务验收专家（Verifier），负责批判性地检查各个任务的完成情况，并评估最终结果是否满足用户需求。

## 业务上下文

{{businessContext}}

## 核心职责

1. **批判性审查任务**：以严格、批判的态度审查每个任务的执行情况和结果，不轻易认定任务完成。

2. **评估完成状态**：判断每个任务是否真正完成，评估标准包括：
   - 任务是否严格按照要求完成
   - 是否完全达到预期目标
   - 结果是否完整、准确、可用
   - 是否存在遗漏或潜在问题

3. **验证用户需求满足度**：从用户原始需求出发，评估整体执行结果是否真正满足了用户的期望：
   - 用户的核心诉求是否得到解决
   - 结果是否能够直接回答用户的问题
   - 是否存在与用户预期的偏差

4. **根据评估结果执行不同操作**：
   - **如果任务完成且满足用户需求**：直接提供最终总结，回答用户的问题
   - **如果任务未完成或未满足用户需求**：提出具体、可操作的改进措施，供下一轮规划参考

## 输出格式（必须遵守）

### 情况一：任务完成，提供最终总结

当 \`allCompleted\` 和 \`userNeedsSatisfied\` 都为 \`true\` 时，**必须**提供 \`summary\` 字段：

**重要**：\`summary\` 是给用户的最终回答，必须：
- 综合所有任务执行的结果数据
- 直接回答用户的原始问题
- 包含具体的信息、数据或结论
- **禁止**只写"任务已完成"之类的空话

\`\`\`json
{
  "type": "component",
  "component": "verifier-response",
  "allCompleted": true,
  "userNeedsSatisfied": true,
  "overallFeedback": "简短的验证结论",
  "summary": "这里是针对用户问题的详细回答，包含从任务执行中获取的具体数据和结论...",
  "tasks": [
    {
      "id": "task-1",
      "completed": true,
      "feedback": "简短的任务完成反馈"
    }
  ]
}
\`\`\`

### 情况二：任务未完成，提供改进建议

当 \`allCompleted\` 或 \`userNeedsSatisfied\` 为 \`false\` 时，必须提供 \`improvements\` 字段：

\`\`\`json
{
  "type": "component",
  "component": "verifier-response",
  "allCompleted": false,
  "userNeedsSatisfied": false,
  "overallFeedback": "部分任务未完成，需要进一步改进。",
  "improvements": [
    "具体改进建议1：...",
    "具体改进建议2：..."
  ],
  "tasks": [
    {
      "id": "task-1",
      "completed": false,
      "feedback": "任务未达到预期目标，原因是..."
    }
  ]
}
\`\`\`

### 字段说明

- \`allCompleted\`: 布尔值，表示所有任务是否都已完成
- \`userNeedsSatisfied\`: 布尔值，表示最终结果是否满足用户的原始需求
- \`tasks\`: 任务验证数组，每个任务包含：
  - \`id\`: 任务ID
  - \`completed\`: 是否完成（true 表示完成，false 表示未完成）
  - \`feedback\`: 反馈意见
- \`overallFeedback\`: 整体反馈
- \`summary\`: **最终总结**（当 allCompleted 和 userNeedsSatisfied 都为 true 时**必须提供**）
  - **必须**直接回答用户的原始问题
  - **必须**从对话历史中提取任务执行获得的具体数据、信息
  - **必须**综合这些数据，给出完整、有价值的答案
  - **禁止**只写"任务已完成"、"需求已满足"等空话
  - 可以使用 Markdown 格式组织内容（列表、标题、代码块等）
  - 这是用户最终看到的回答，必须包含用户需要的所有具体信息
- \`improvements\`: 改进措施数组（当 allCompleted 或 userNeedsSatisfied 为 false 时必填）
  - 每项包含具体的改进建议
  - 供后续 Planner 参考制定新的任务计划

## 完成标准

- **已完成（completed: true）**：任务严格按照要求完成，完全达到预期目标，结果完整、准确且可用
- **未完成（completed: false）**：任务未按要求完成、未达到预期目标、结果不完整、不准确，或存在明显问题

## 用户需求满足标准

- **已满足（userNeedsSatisfied: true）**：执行结果能够直接、完整地回答用户问题，满足用户的核心诉求
- **未满足（userNeedsSatisfied: false）**：执行结果与用户期望存在偏差，无法完全解决用户问题，或遗漏了重要内容

## 框架约束

- 判断要客观公正，基于实际完成情况，但要保持批判性思维
- 不要轻易认定任务完成，要仔细检查是否存在遗漏或问题
- **任务完成时**：必须在 \`summary\` 字段中提供详细的最终总结
- **任务未完成时**：必须在 \`improvements\` 字段中提供具体的改进措施
- 改进措施应该具体、可操作，便于 Planner 据此制定新的任务计划
- **注意**：你只负责验证和评估任务完成情况，不调用任何工具。工具调用由 Executor 执行
`;
```

**关键特点**：
- 使用 `{{businessContext}}` 占位符注入业务上下文
- 明确输出格式为「必须遵守」
- 框架约束确保工作流正常运行
- Planner 需要参考 Verifier 的改进建议

### Verifier 输出格式说明

Verifier 根据任务完成情况输出不同的响应：

**情况一：任务完成，提供最终总结**

当 `allCompleted` 和 `userNeedsSatisfied` 都为 `true` 时：

```json
{
  "type": "component",
  "component": "verifier-response",
  "allCompleted": true,
  "userNeedsSatisfied": true,
  "overallFeedback": "简短的验证结论",
  "summary": "针对用户问题的详细回答，包含具体数据和结论...",
  "tasks": [...]
}
```

**情况二：任务未完成，提供改进建议**

当 `allCompleted` 或 `userNeedsSatisfied` 为 `false` 时：

```json
{
  "type": "component",
  "component": "verifier-response",
  "allCompleted": false,
  "userNeedsSatisfied": false,
  "overallFeedback": "部分任务未完成，需要进一步改进。",
  "improvements": [
    "具体改进建议1：...",
    "具体改进建议2：..."
  ],
  "tasks": [...]
}
```

**关键字段说明**：
- `summary`：最终总结（任务完成时必须提供），直接回答用户问题
- `improvements`：改进建议数组（任务未完成时必须提供），供 Planner 下一轮规划参考
- `userNeedsSatisfied`：是否满足用户原始需求

### 业务上下文示例（Planner）

**位置**：`src/agents/prompts/planner.md`

```markdown
# Planner 业务上下文

你正在一个**转写管理系统**中工作，该系统主要处理：

## 核心概念

- **转写资源（Transcription Resource）**：需要进行转写的音频或视频文件
  - 音频资源：直接是音频文件
  - 视频资源：视频文件，系统会自动提取音频进行转写
  - 每个资源会保存最新一条转写成功的任务 ID

- **转写任务（Transcription Task）**：对转写资源执行转写操作的具体任务
  - 状态：pending、running、completed、failed
  - 转写完成后会生成转写结果

## 业务规则

- 当用户要求分析转写资源时，应该规划同时获取并分析转写内容
- 转写结果输出策略：默认输出摘要，除非用户明确要求完整内容
```

**关键特点**：
- 只包含业务相关的概念和规则
- 不包含输出格式、框架约束等框架层内容
- 可以独立于框架进行修改和维护

### PromptManager 使用方式

**位置**：`src/agent-framework/prompts/PromptManager.ts`

```typescript
import { PromptManager } from './agent-framework/prompts/PromptManager';

const promptManager = new PromptManager();

// 方式 1：为每个 Agent 单独设置业务上下文（推荐）
promptManager.setBusinessContext('planner', plannerBusinessContext);
promptManager.setBusinessContext('executor', executorBusinessContext);
promptManager.setBusinessContext('verifier', verifierBusinessContext);

// 方式 2：批量设置所有 Agent 的业务上下文
promptManager.setAllBusinessContexts({
  planner: plannerBusinessContext,
  executor: executorBusinessContext,
  verifier: verifierBusinessContext,
});

// 方式 3：设置默认业务上下文（适用于所有 Agent，向后兼容）
promptManager.setSystemContext(defaultBusinessContext);

// 获取完整的 system message（框架模板 + 业务上下文）
const plannerPrompt = promptManager.getPrompt('planner');
```

### 提示词定制

#### 1. 修改业务上下文

直接编辑 `src/agents/prompts/*.md` 文件，无需修改框架代码。

#### 2. 覆盖框架核心模板（高级用法）

```typescript
// 只在需要修改框架行为时使用
promptManager.setCoreTemplate('planner', customPlannerTemplate);
```

#### 3. 添加新的 Agent 类型

```typescript
// 1. 扩展 AgentType
type AgentType = 'planner' | 'executor' | 'verifier' | 'reviewer';

// 2. 添加核心模板
promptManager.setCoreTemplate('reviewer', REVIEWER_CORE_TEMPLATE);

// 3. 添加业务上下文
promptManager.setBusinessContext('reviewer', reviewerBusinessContext);

// 4. 在 AgentWorkflowEngine 中添加执行逻辑
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

### 步骤 2：配置业务上下文

为每个 Agent 定义业务上下文（推荐使用 Markdown 文件）：

```typescript
// 方式 1：从 Markdown 文件加载（推荐）
import plannerContext from './agents/prompts/planner.md?raw';
import executorContext from './agents/prompts/executor.md?raw';
import verifierContext from './agents/prompts/verifier.md?raw';

// 方式 2：直接定义字符串
const MY_PLANNER_CONTEXT = `
# Planner 业务上下文

你正在一个**我的应用**中工作，该系统主要处理：

## 核心概念

- **资源类型 A**：描述...
- **资源类型 B**：描述...

## 业务规则

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

// 设置业务上下文（推荐为每个 Agent 单独设置）
promptManager.setBusinessContext('planner', plannerContext);
promptManager.setBusinessContext('executor', executorContext);
promptManager.setBusinessContext('verifier', verifierContext);

// 或者批量设置
promptManager.setAllBusinessContexts({
  planner: plannerContext,
  executor: executorContext,
  verifier: verifierContext,
});

// 可选：覆盖框架核心模板（高级用法）
// promptManager.setCoreTemplate('planner', CUSTOM_PLANNER_TEMPLATE);

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

1. **修改业务上下文**（推荐）：
   - 编辑 `src/agents/prompts/*.md` 文件
   - 添加领域知识、业务规则、操作指南

2. **修改框架核心模板**（高级用法）：
   - 编辑 `src/agent-framework/prompts/templates.ts`
   - 或使用 `promptManager.setCoreTemplate()` 覆盖
   - 注意保留 `{{businessContext}}` 占位符

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

// 从 Markdown 文件加载业务上下文
import plannerContext from './agents/prompts/planner.md?raw';
import executorContext from './agents/prompts/executor.md?raw';
import verifierContext from './agents/prompts/verifier.md?raw';

class MyApp {
  private engine: AgentWorkflowEngine;

  constructor() {
    const backend = new MyAgentBackend();
    const promptManager = new PromptManager();
    
    // 为每个 Agent 设置业务上下文
    promptManager.setAllBusinessContexts({
      planner: plannerContext,
      executor: executorContext,
      verifier: verifierContext,
    });
    
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

1. **业务上下文设计**：
   - 清晰描述应用领域和核心概念
   - 说明重要的业务规则和约束
   - 提供工具使用指导
   - 使用 Markdown 文件便于维护

2. **双层架构优势**：
   - 框架核心模板确保工作流正常运行
   - 业务上下文独立维护，不影响框架
   - 修改业务逻辑无需修改框架代码

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

### 核心优势

- ✅ **职责分离，提示词精准**：每个 Agent 专注于特定职责，提示词更精准
- ✅ **任务规划能力强**：Planner 提前规划整个任务流程
- ✅ **质量保证机制**：Verifier 独立验证任务完成情况
- ✅ **工具调用优化**：Executor 检查历史，避免重复调用
- ✅ **任务完成判断优化**：Executor 优先检查对话历史，如果任务已完成则直接返回，提高执行效率
- ✅ **统一总结机制**：Verifier 在任务完成后直接提供 `summary` 最终总结，回答用户问题；未完成时提供 `improvements` 改进建议
- ✅ **改进反馈机制**：Verifier 的改进建议会传递给 Planner，Planner 会参考这些建议制定下一轮任务规划
- ✅ **提示词逻辑优先**：AI 通过 JSON 响应控制大部分执行逻辑（60-70%），代码主要负责调用和解析（30-40%）
- ✅ **灵活的流程控制**：AI 通过 `taskCompleted`、`shouldContinue`、`nextAction` 等字段控制执行流程
- ✅ **安全的兜底机制**：保留最大轮次限制，防止无限循环
- ✅ **易于扩展和定制**：通过修改提示词即可调整行为，无需修改代码

### 适用场景

- 复杂任务处理（需要多步骤完成）
- 需要工具调用的任务
- 需要质量保证的应用
- 需要任务规划和优先级管理的系统
- 需要灵活流程控制的场景

### 设计理念

**提示词优先，代码兜底**：让 AI 通过提示词控制大部分执行逻辑，代码主要负责调用、解析和基础错误处理。这样既保证了灵活性，又确保了安全性和性能。

---

## 跨平台代码生成提示词模版

> 本章节提供一套通用提示词模版，帮助你在任意编程语言和 AI 工具环境中快速实现 Agent Framework 的核心架构。

### 适用场景

| 场景 | 说明 |
|------|------|
| **跨语言实现** | 在 Python、Go、Rust、Java、C# 等语言中实现 Agent 工作流 |
| **跨平台部署** | 在 CLI、Web 服务、桌面应用、Serverless 等环境中运行 |
| **AI 工具集成** | 在 Cursor、Claude CLI、Gemini CLI、ChatGPT 等工具中使用 |
| **快速原型** | 快速验证 Agent 工作流在特定业务场景的可行性 |

### 工作原理

```
┌─────────────────────────────────────────────────────────────────┐
│                        你的输入                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ {{LANGUAGE}}│  │ {{PLATFORM}}│  │ {{BUSINESS_CONTEXT}}    │  │
│  │   Python    │  │   FastAPI   │  │ 智能客服系统...          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    通用提示词模版                                 │
│  + 架构要求 + 接口定义 + 流程控制 + 输出规范                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AI 工具（Cursor/Claude/Gemini）               │
│  引用框架核心提示词：                                             │
│  - PLANNER_CORE_TEMPLATE                                        │
│  - EXECUTOR_CORE_TEMPLATE                                       │
│  - VERIFIER_CORE_TEMPLATE                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    生成的工程化代码                               │
│  ├── engine/          # 工作流调度器                             │
│  ├── prompts/         # 提示词管理                               │
│  ├── backend/         # AI 接口实现                              │
│  ├── tools/           # MCP 工具处理                             │
│  └── main.py          # 入口文件                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 使用步骤

**Step 1**: 复制下方「通用提示词模版」

**Step 2**: 替换模版中的变量

| 变量 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `{{LANGUAGE}}` | ✅ | 目标编程语言 | `Python`、`Go`、`Rust`、`TypeScript` |
| `{{PLATFORM}}` | ✅ | 目标平台/框架 | `FastAPI`、`Gin`、`Actix`、`Express` |
| `{{BUSINESS_CONTEXT}}` | ✅ | 业务场景描述 | 见下方示例 |
| `{{AI_PROVIDER}}` | ❌ | AI 服务商（可选） | `OpenAI`、`Anthropic`、`Azure OpenAI` |

**Step 3**: 将提示词粘贴到 AI 工具中执行

**Step 4**: 按照生成的「快速启动指南」运行代码

### 通用提示词模版

> 💡 **提示**：复制以下完整内容，替换 `{{变量}}` 后使用。

````markdown
# Agent Workflow 代码生成任务

## 目标

基于 Agent Framework 的设计理念，使用 **{{LANGUAGE}}** 语言在 **{{PLATFORM}}** 平台上实现一个完整的多 Agent 协作工作流系统。

## 业务上下文

{{BUSINESS_CONTEXT}}

---

## 第一部分：核心架构实现

### 1. 工作流调度器（AgentWorkflowEngine）

**职责**：协调 Planner → Executor → Verifier 三个 Agent 的执行流程。

**核心流程**：

```
用户请求
    ↓
┌─────────────────────────────────────────────────────────┐
│  Planner Loop (max 3 rounds)                            │
│  - 理解用户需求                                          │
│  - 分解为 Todo 列表                                      │
│  - 参考 Verifier 的 improvements（如有）                 │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│  Executor Loop (max 10 rounds per task)                 │
│  - 检查任务是否已完成（优先检查对话历史）                   │
│  - 调用工具获取信息（遵守去重策略）                        │
│  - 返回流程控制字段：taskCompleted, shouldContinue       │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│  Verifier Loop (1 round)                                │
│  - 验证所有任务完成情况                                   │
│  - 如果完成：返回 summary（最终答案）                     │
│  - 如果未完成：返回 improvements → 回到 Planner          │
└─────────────────────────────────────────────────────────┘
    ↓
返回最终结果
```

**关键方法**：
- `run(options, callbacks)`: 执行完整工作流
- `stop()`: 停止工作流执行

**依赖注入**：
- `IAgentBackend`: AI 调用和工具执行的抽象接口
- `PromptManager`: 提示词管理器

### 2. 提示词管理器（PromptManager）

**职责**：管理双层提示词架构（框架层 + 业务层）。

**关键方法**：
- `set_business_context(agent_type, context)`: 设置指定 Agent 的业务上下文
- `get_prompt(agent_type)`: 获取完整提示词（框架模板 + 业务上下文）

**核心逻辑**：
- 维护 3 个 Agent 的核心模板（PLANNER/EXECUTOR/VERIFIER_CORE_TEMPLATE）
- 将 `{{businessContext}}` 占位符替换为业务上下文
- 返回合并后的完整提示词

### 3. 后端接口（IAgentBackend）

**职责**：抽象 AI 调用和工具执行，支持不同实现。

**接口方法**：

| 方法 | 说明 |
|------|------|
| `chat_completion(options)` | 调用 AI 对话接口，支持流式响应 |
| `execute_tool(server_name, tool_name, args, context)` | 执行 MCP 工具调用 |
| `save_message(message, chat_id)` | 保存消息到持久化存储 |
| `listen_to_stream(event_id, callbacks)` | 监听流式响应事件 |

**流式响应回调**：
- `on_content`: 接收文本内容
- `on_tool_calls`: 接收工具调用请求
- `on_reasoning`: 接收推理过程（可选）
- `on_done`: 响应完成
- `on_error`: 错误处理

### 4. 类型定义

**Agent 类型**：`planner` | `executor` | `verifier`

**核心数据结构**：

| 类型 | 关键字段 |
|------|---------|
| `AIMessage` | id, role, content, timestamp, agent_type, tool_calls, tool_call_id, name |
| `ToolCall` | id, function (name, arguments) |
| `Todo` | id, description, priority, status |
| `PlannerResponse` | summary, needsMorePlanning, todos |
| `ExecutorResponse` | summary, taskCompleted, shouldContinue, nextAction, todos |
| `VerifierResponse` | allCompleted, userNeedsSatisfied, summary, improvements, tasks |

---

## 第二部分：关键逻辑实现

### 1. 流程控制逻辑

Executor 通过 JSON 响应中的字段控制流程，代码负责解析和应用。

**判断优先级**：
1. 优先使用 `taskCompleted` 字段
2. 其次检查 `nextAction` 是否为 `complete`
3. 最后从 `todos` 数组中推断当前任务状态

### 2. 工具调用去重

在 Executor 调用工具前，检查对话历史避免重复调用相同工具（相同名称 + 相同参数）。

**检查逻辑**：
1. 遍历对话历史中的 assistant 消息
2. 查找匹配的工具调用（名称和参数相同）
3. 检查是否有对应的有效工具结果
4. 如有有效结果则跳过调用，直接复用

### 3. 工具执行流程

**执行步骤**：
1. 解析工具参数（JSON 字符串 → 对象）
2. 查找工具所属的 MCP 服务器
3. 调用 `backend.execute_tool()` 执行
4. 将结果格式化为 `role: tool` 的消息
5. 保存消息并添加到对话历史

---

## 第三部分：核心提示词引用

**重要**：在生成的代码中，必须引用以下 3 个核心角色提示词。这些提示词定义了每个 Agent 的角色、职责、输出格式和框架约束。

请从 Agent Framework 的 `src/agent-framework/prompts/templates.ts` 文件中获取：

| 模板名称 | 角色 | 关键输出字段 |
|---------|------|-------------|
| `PLANNER_CORE_TEMPLATE` | 任务规划专家 | needsMorePlanning, todos, summary |
| `EXECUTOR_CORE_TEMPLATE` | 任务执行专家 | taskCompleted, shouldContinue, nextAction, todos |
| `VERIFIER_CORE_TEMPLATE` | 任务验收专家 | allCompleted, userNeedsSatisfied, summary, improvements |

---

## 第四部分：输出要求

### 项目结构

生成的项目应包含以下模块：

| 模块 | 职责 |
|------|------|
| `engine/` | 工作流调度器实现 |
| `prompts/` | 提示词模板和管理器 |
| `backend/` | IAgentBackend 接口定义和实现 |
| `tools/` | MCP 工具调用处理 |
| `types/` | 类型/模型定义 |
| `main` | 入口文件和使用示例 |
| 依赖配置 | 语言对应的依赖管理文件 |

### 代码质量要求

1. **类型安全**：充分利用目标语言的类型系统
2. **错误处理**：完善的异常捕获和错误恢复机制
3. **日志记录**：关键流程添加日志，便于调试
4. **异步处理**：正确处理异步操作，避免阻塞
5. **代码注释**：关键逻辑添加清晰注释

---

## 第五部分：快速启动指南

生成代码后，请提供完整的启动指南，包括：

1. **环境要求**：语言版本、操作系统兼容性
2. **安装步骤**：创建项目、安装依赖的命令
3. **配置说明**：环境变量（AI API Key、Base URL、Model 等）
4. **运行命令**：启动服务的命令
5. **测试示例**：验证服务是否正常运行的测试请求
6. **常见问题**：添加工具、自定义提示词、调整参数等
````

---

### 业务上下文编写指南

`{{BUSINESS_CONTEXT}}` 是决定生成代码质量的关键。建议包含以下内容：

#### 推荐结构

```markdown
## 业务上下文

### 系统概述
[一句话描述系统的核心功能]

### 核心概念
- **概念 A**：定义和说明
- **概念 B**：定义和说明

### 主要功能
1. 功能 1：描述
2. 功能 2：描述

### 业务规则
- 规则 1
- 规则 2

---

### 注意事项

| 事项 | 说明 |
|------|------|
| **核心提示词** | 3 个角色的核心提示词需从本框架 `src/agent-framework/prompts/templates.ts` 获取，或参考本文档「提示词架构设计」章节 |
| **MCP 工具** | 如需调用 MCP 工具，需额外配置 MCP 服务器连接（参考 MCP 协议文档） |
| **流式响应** | 不同 AI 服务商的流式响应格式不同，需根据实际情况调整解析逻辑 |
| **最大轮次** | Planner 3 轮、Executor 10 轮的限制是兜底机制，可根据业务需求调整 |
| **错误处理** | 生成的代码可能需要根据实际环境补充错误处理逻辑 |

---
