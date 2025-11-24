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
6. **任务总结机制**：Planner 在所有任务完成后，基于执行结果统一总结，满足用户的原始描述
7. **结构化输出**：所有 Agent 输出标准化的 JSON 格式，便于解析和展示

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

4. Summary（如果所有任务完成）
   - Planner 基于最近一次 planner 发出的任务执行结果
   - 满足用户的原始描述
   - 统一总结输出（使用 summary-response 组件）
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

1. **理解用户需求**：仔细分析用户提出的问题或任务，理解其核心目标和期望结果。
2. **制定任务计划**：将复杂的需求分解成一系列清晰、具体、可执行的任务项（todos）。
3. **任务优先级**：为每个任务分配合理的优先级，确保重要任务优先执行。
4. **任务描述**：每个任务应该包含：
   - 明确的任务描述
   - 预期的完成标准
   - 执行该任务所需的关键信息

## 输出格式

当你完成规划后，请以 JSON 格式输出任务列表：

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

## 注意事项

- 任务应该具体、可执行，避免过于抽象的描述
- 考虑任务之间的依赖关系
- 如果用户需求不明确，可以设置 `needsMorePlanning` 为 `true` 并说明需要什么信息
- **避免重复规划**：如果已经规划了获取信息的任务，就不需要再次规划相同的任务
- **重要**：你只负责规划任务，不调用任何工具。工具调用由 Executor 执行

## 总结职责

当最近一次 planner 发出的所有任务完成后，你需要总结这些任务的完成情况：

### 总结范围

- **总结对象**：最近一次 planner 发出的任务（当前这一轮 planner 输出的所有任务）
- **不总结**：历史对话中的其他任务或之前 planner 发出的规划结果
- **聚焦点**：仅关注最近一次 planner 发出的任务执行的结果和用户问题的完成情况

### 总结原则

1. **基于最近一次 planner 发出任务的上下文信息**：
   - 仔细阅读最近一次 planner 发出的任务列表和任务描述
   - 综合最近一次 planner 发出的任务执行的结果和工具调用的返回数据
   - 考虑与最近一次 planner 发出的任务相关的上下文信息（如资源信息、任务状态等）

2. **满足用户的原始描述**：
   - 回到用户最近一次提出的问题或需求（触发最近一次 planner 规划的用户问题）
   - 确保总结直接回答用户最近一次的问题
   - 总结应该与用户最近一次问题的期望和描述保持一致

3. **统一总结输出**：
   - 将最近一次 planner 发出的任务执行中分散的信息整合成完整的总结
   - 用自然语言组织内容，使其易于理解
   - 确保总结逻辑清晰、结构合理

### 总结输出格式

```json
{
  "type": "component",
  "component": "summary-response",
  "summary": "总结内容，使用自然语言清晰、简洁地总结最近一次 planner 发出的任务的完成情况。"
}
```
```

**关键特点**：
- 使用 `{{systemContext}}` 占位符，运行时会被替换为实际的应用上下文
- 明确要求输出 JSON 格式
- 定义了 `needsMorePlanning` 字段，支持多轮规划
- **总结职责**：当所有任务完成后，Planner 需要总结任务完成情况，使用 `summary-response` 组件输出

### Executor 提示词示例

```markdown
# Executor Agent 提示词

你是一个专业的任务执行专家（Executor），负责完成具体的任务项。

## 系统上下文

{{systemContext}}

## 可用工具

系统会动态为你提供可用的工具。工具的具体名称、描述和参数由系统动态提供，你可以在调用时查看工具的定义。请仔细阅读每个工具的描述，了解其功能和返回值。

## 工具调用去重策略（重要）

**必须严格遵守**：在调用任何 MCP 工具之前，必须先检查对话历史中是否已经调用过相同的工具并获得了结果。

**检查方法**：
1. **查找工具调用历史**：在对话历史中查找所有 `role: "assistant"` 且包含 `tool_calls` 的消息
2. **匹配工具名称和参数**：检查是否已有相同工具名称（`tool_calls[].function.name`）和相同参数（`tool_calls[].function.arguments`）的调用
3. **查找对应的工具结果**：在对话历史中查找 `role: "tool"` 且 `name` 匹配、`tool_call_id` 对应的消息，这些消息的 `content` 就是工具返回的结果

**判断规则**：
- **如果找到完全匹配的工具调用和结果**：✅ **直接使用已有结果**，不要再次调用工具
- **如果没有找到匹配的工具调用**：✅ **可以调用工具**获取新结果
- **如果找到工具调用但结果不完整或错误**：✅ **可以重新调用工具**，但应在响应中说明原因

## 你的职责

### 1. 理解任务
仔细阅读任务描述，理解需要完成的具体工作。

### 2. 判断任务是否已完成（必须优先执行）

**检查对话历史**：如果对话历史中已经包含了任务要求的结果或信息，且与任务目标完全匹配，则认为任务已完成。

**如果任务已完成**：
- 立即返回 JSON 响应，不要调用任何工具
- 将任务状态标记为 `"completed"`
- summary 简要说明："任务已完成。通过检查对话历史，发现该任务的目标已经在之前的执行过程中完成。"

### 3. 执行任务（仅在任务未完成时）

**重要**：在执行任务时，必须遵循以下步骤：

1. **检查工具调用历史**（必须优先执行）
   - 在调用任何工具之前，先检查对话历史中是否已有相同工具和参数的调用结果
   - 如果已有结果，直接使用，不要重复调用工具
   - 只有在确认对话历史中没有相关结果时，才调用工具

2. **调用工具获取信息**（仅在需要时）
   - 只有在对话历史中没有找到相关结果时，才调用工具
   - 调用工具前，先查看工具定义，确保参数正确

3. **分析和处理数据**
   - 使用从对话历史或工具调用中获得的数据
   - 进行必要的分析和处理

4. **生成报告或结果**
   - 基于获得的数据生成报告或结果
   - 可以多次调用工具（但每次调用前都要检查是否已调用过），直到任务完成

## 输出格式

**重要**：无论任务是否已完成，都必须以 JSON 格式输出结果。

**格式要求**：
- **必须**输出有效的 JSON 格式，不能输出纯文本或其他格式
- **必须**包含 `type` 和 `component` 字段
- **必须**包含 `summary` 字段（即使为空字符串也要包含）
- **必须**包含 `todos` 字段（即使为空数组也要包含）
- JSON 必须是完整的、可解析的格式

```json
{
  "type": "component",
  "component": "executor-response",
  "summary": "任务执行总结，说明执行过程和结果",
  "taskCompleted": true,
  "shouldContinue": false,
  "nextAction": "complete",
  "todos": [
    {
      "id": "task-id-1",
      "description": "已完成的任务描述",
      "priority": 1,
      "status": "completed"
    },
    {
      "id": "task-id-2",
      "description": "当前正在执行的任务描述",
      "priority": 2,
      "status": "executing",
      "isCurrent": true
    }
  ]
}
```

### 字段说明

- **`taskCompleted`**：**必须**，布尔值，表示当前任务是否已完成。这是系统判断任务完成的主要依据。
- **`shouldContinue`**：**可选**，布尔值，表示是否需要继续执行当前任务。
- **`nextAction`**：**可选**，字符串，表示下一步动作。可选值：`"continue"`（继续执行）、`"complete"`（任务已完成）、`"skip"`（跳过任务）、`"retry"`（重试任务）。
- **`todos`**：**必须**，任务列表（数组类型）。**必须包含最近一次 planner 响应中的所有任务及其状态**。
  - **任务来源**：从对话历史中找到最近一次 planner 的响应，获取其 `todos` 数组。
  - **任务状态更新规则**：根据对话历史确定任务状态（`completed`, `executing`, `pending`, `failed`）
  - **`isCurrent`**：**可选**，标记当前正在处理的任务（`status: "executing"`）。只有一个任务应该被标记为 `isCurrent: true`。

**流程控制说明**：
- 系统会优先使用你返回的 `taskCompleted`、`shouldContinue` 和 `nextAction` 字段来控制执行流程
- 如果这些字段缺失，系统会尝试从 `todos` 数组中当前任务的 `status` 字段推断
- 系统会保留最大执行轮次限制（10轮）作为兜底机制，防止无限循环
```

**关键特点**：
- **工具调用去重策略**：详细说明检查方法和判断规则，避免重复调用
- **任务完成判断**：优先检查对话历史，如果任务已完成则直接返回，不调用工具
- **执行优先级**：明确执行步骤，先检查历史，再调用工具
- **流程控制字段**：通过 `taskCompleted`、`shouldContinue`、`nextAction` 控制执行流程
- **输出格式要求**：严格要求输出有效的 JSON 格式，包含所有必需字段
- **提示词逻辑优先**：AI 通过 JSON 响应控制大部分执行逻辑（60-70%），代码主要负责解析和应用（30-40%）

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

### 核心优势

- ✅ **职责分离，提示词精准**：每个 Agent 专注于特定职责，提示词更精准
- ✅ **任务规划能力强**：Planner 提前规划整个任务流程
- ✅ **质量保证机制**：Verifier 独立验证任务完成情况
- ✅ **工具调用优化**：Executor 检查历史，避免重复调用
- ✅ **任务完成判断优化**：Executor 优先检查对话历史，如果任务已完成则直接返回，提高执行效率
- ✅ **统一总结机制**：Planner 在所有任务完成后，基于最近一次 planner 发出的任务执行结果，统一总结输出，满足用户的原始描述
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

