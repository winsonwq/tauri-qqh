# ReAct Framework 使用指南

## 目录

1. [ReAct 模式简介](#react-模式简介)
2. [调用流程梳理与架构](#调用流程梳理与架构)
3. [如何使用这个框架](#如何使用这个框架)
4. [核心提示词与 System Message 集成](#核心提示词与-system-message-集成)

---

## ReAct 模式简介

### 什么是 ReAct 模式

ReAct（Reasoning + Acting）是一种经典的 AI Agent 设计模式，通过交替执行「推理（Thought）」和「行动（Action）」来完成任务。该模式的核心思想是让 AI 在每一步中先思考当前情况，然后决定下一步行动，最后观察执行结果，形成一个循环迭代的过程。

### 核心工作流程

```
用户请求
   ↓
┌─────────────────────────────────────┐
│  ReAct 循环（最多 10 轮迭代）        │
│  ┌─────────────────────────────────┐│
│  │ Thought（思考）:                  ││
│  │ - 分析当前情况                    ││
│  │ - 决定下一步行动                   ││
│  │ - 判断是否需要继续执行             ││
│  └─────────────────────────────────┘│
│              ↓                      │
│  ┌─────────────────────────────────┐│
│  │ Action（行动）:                  ││
│  │ - 执行工具调用（如需要）           ││
│  │ - 或直接给出答案                   ││
│  └─────────────────────────────────┘│
│              ↓                      │
│  ┌─────────────────────────────────┐│
│  │ Observation（观察）:             ││
│  │ - 总结工具执行结果                 ││
│  │ - 提供下一步建议                   ││
│  └─────────────────────────────────┘│
│              ↓                      │
│  判断是否完成？                      │
│  - 否 → 继续循环                     │
│  - 是 → 输出最终答案                 │
└─────────────────────────────────────┘
   ↓
返回结果
```

### 优势

| 优势维度 | 说明 |
|---------|------|
| **灵活性高** | 可以根据中间结果动态调整策略，不受固定规划限制 |
| **响应速度快** | 单 Agent 循环，相比多 Agent 框架响应更快 |
| **成本较低** | API 调用次数相对较少，适合成本敏感场景 |
| **实现简单** | 单循环实现，代码复杂度低，易于理解和维护 |
| **探索性强** | 边推理边探索，适合开放式问题和探索性任务 |
| **实时调整** | 可以根据每步的执行结果即时调整下一步行动 |

### 劣势

| 劣势维度 | 说明 |
|---------|------|
| **任务追踪困难** | 任务状态隐式存在于对话历史中，难以可视化追踪 |
| **无独立验证** | 没有独立的验证机制，依赖 AI 自判断，容易遗漏问题 |
| **容易遗漏子任务** | 在推理过程中可能遗漏某些子任务，不如前置规划全面 |
| **复杂任务处理** | 任务过复杂时，推理链容易断裂，难以保证完整性 |
| **无质量保证** | 没有独立的验证环节，无法确保任务完成质量 |

### 适用场景

| 场景类型 | 推荐使用 | 原因 |
|---------|---------|------|
| **简单探索性任务** | ✅ 推荐 | 灵活调整，快速响应 |
| **对响应速度敏感** | ✅ 推荐 | 单 Agent 循环开销更小 |
| **开放式问题** | ✅ 推荐 | 边推理边探索，不受固定规划限制 |
| **成本敏感场景** | ✅ 推荐 | API 调用次数更少 |
| **复杂多步任务** | ⚠️ 谨慎使用 | 前置规划 + 验证机制更可靠 |
| **需要质量保证** | ⚠️ 谨慎使用 | 无独立验证，可能遗漏问题 |
| **需要任务追踪** | ⚠️ 谨慎使用 | 任务状态隐式，难以可视化 |

### 与其他模式对比

#### ReAct vs 多 Agent 框架

| 维度 | ReAct 模式 | 多 Agent 框架 |
|------|-----------|--------------|
| **架构模式** | 单 Agent 循环（Thought→Action→Observation） | 多 Agent 协作（Planner→Executor→Verifier） |
| **任务规划** | 边推理边行动，无前置规划 | 前置规划，Planner 先分解为 Todo 列表 |
| **执行方式** | 根据每步推理结果动态决定 | 按任务列表顺序执行 |
| **质量保证** | 无独立验证机制，依赖 AI 自判断 | 独立 Verifier 验证 + improvements 反馈循环 |
| **流程控制** | AI 通过自然语言推理控制 | AI 通过 JSON 字段控制（taskCompleted 等） |
| **输出格式** | 自由文本 + 工具调用混合 | 结构化 JSON，支持组件渲染 |
| **状态管理** | 隐式状态，存在于对话历史中 | 显式 Todo 状态（pending/executing/completed） |

---

## 调用流程梳理与架构

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                   应用层 (Application)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         useReActAgent Hook                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              ReAct Framework 核心层                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │         ReActWorkflowEngine                      │  │
│  │  - Thought 阶段                                  │  │
│  │  - Action 阶段                                   │  │
│  │  - Observation 阶段                              │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         ReActPromptManager                      │  │
│  │  - 模板管理                                      │  │
│  │  - 业务上下文注入                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              接口层 (Interfaces)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         IReActBackend                            │  │
│  │  - chatCompletion()                              │  │
│  │  - executeTool()                                 │  │
│  │  - saveMessage()                                 │  │
│  │  - listenToStream()                              │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         IToolInfoProvider                        │  │
│  │  - getToolInfoList()                             │  │
│  │  - findToolServer()                              │  │
│  │  - areAllToolsAutoConfirmable()                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              适配器层 (Adapters)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         TauriReActBackend                        │  │
│  │  - 实现 IReActBackend 接口                        │  │
│  │  - 与 Tauri 后端通信                             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         TauriToolInfoProvider                    │  │
│  │  - 实现 IToolInfoProvider 接口                    │  │
│  │  - 管理 MCP 工具信息                              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. ReActWorkflowEngine（工作流引擎）

**位置**：`src/react-framework/workflow/ReActWorkflowEngine.ts`

**职责**：
- 协调 Thought → Action → Observation 三个阶段的执行流程
- 管理消息流和工具调用
- 控制工作流的启动和停止
- 处理流式响应

**关键方法**：
- `run()`: 执行完整的 ReAct 工作流
- `stop()`: 停止工作流执行
- `continueAfterToolConfirm()`: 在工具确认后继续执行

**工作流程**：
```typescript
1. Thought 阶段（思考）
   - 分析当前情况
   - 决定下一步行动
   - 判断是否需要继续执行（shouldContinue）
   - 如果不需要继续，直接输出最终答案

2. Action 阶段（行动）
   - 根据思考阶段的决定执行任务
   - 如果需要，调用工具获取信息
   - 工具调用需要用户确认（如果工具不是自动确认类型）

3. Observation 阶段（观察）
   - 总结工具执行结果
   - 提供下一步建议
   - 为下一轮思考提供上下文

4. 循环控制
   - 最多执行 10 轮迭代
   - 如果思考阶段决定结束（shouldContinue: false），提前结束
   - 如果达到最大迭代次数，强制结束
```

#### 2. ReActPromptManager（提示词管理器）

**位置**：`src/react-framework/prompts/PromptManager.ts`

**职责**：
- 管理不同阶段的提示词模板
- 注入业务上下文
- 支持动态替换模板变量

**关键方法**：
- `setSystemContext()`: 设置默认的业务上下文（适用于所有阶段）
- `setBusinessContext()`: 为特定阶段设置业务上下文
- `getThoughtPrompt()`: 获取思考阶段的提示词
- `getActionPrompt()`: 获取行动阶段的提示词
- `getObservationPrompt()`: 获取观察阶段的提示词

#### 3. IReActBackend（后端接口）

**位置**：`src/react-framework/core/interfaces.ts`

**接口定义**：
```typescript
interface IReActBackend {
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
  
  // 停止流式响应
  stopStream(eventId: string): Promise<void>;
}
```

#### 4. IToolInfoProvider（工具信息提供者）

**位置**：`src/react-framework/core/interfaces.ts`

**接口定义**：
```typescript
interface IToolInfoProvider {
  // 获取可用工具列表（仅名称和描述）
  getToolInfoList(): Array<{ name: string; description: string }>;
  
  // 获取完整工具列表（包含 inputSchema）
  getFullToolList?(): MCPTool[];
  
  // 查找工具对应的服务器
  findToolServer(toolName: string): { key?: string; name: string } | null;
  
  // 检查所有工具调用是否都需要用户确认
  areAllToolsAutoConfirmable(toolCalls: ToolCall[]): boolean;
}
```

### 详细调用流程

#### 完整执行流程

```
1. 用户发送消息
   ↓
2. 调用 startReActAgent()
   ↓
3. ReActWorkflowEngine.run()
   ↓
4. 开始循环（最多 10 轮）
   ↓
   ┌─────────────────────────────────────┐
   │ 阶段 1: Thought（思考）              │
   │                                     │
   │ 4.1 生成思考阶段提示词               │
   │     - 包含当前上下文                 │
   │     - 包含可用工具列表（仅名称和描述）│
   │     - 不包含工具定义（避免 AI 直接调用）│
   │                                     │
   │ 4.2 调用 AI（不传工具）              │
   │     - 让 AI 只做分析和决策           │
   │                                     │
   │ 4.3 解析 agent_meta 标签             │
   │     - shouldContinue: 是否需要继续  │
   │     - reason: 选择的原因            │
   │                                     │
   │ 4.4 如果 shouldContinue: false      │
   │     - 移除 agent_meta 标签           │
   │     - 输出最终答案                   │
   │     - 结束循环                       │
   └─────────────────────────────────────┘
   ↓
   ┌─────────────────────────────────────┐
   │ 阶段 2: Action（行动）               │
   │                                     │
   │ 5.1 生成行动阶段提示词               │
   │     - 包含当前上下文                 │
   │     - 包含完整工具定义（inputSchema）│
   │                                     │
   │ 5.2 调用 AI（传入工具）              │
   │     - AI 可以调用工具                │
   │                                     │
   │ 5.3 检查工具调用                     │
   │     - 如果有工具调用：                │
   │       a. 检查是否需要用户确认          │
   │       b. 如果需要确认，暂停循环       │
   │       c. 如果自动确认，执行工具        │
   │     - 如果没有工具调用：               │
   │       - 结束循环                     │
   └─────────────────────────────────────┘
   ↓
   ┌─────────────────────────────────────┐
   │ 阶段 3: Observation（观察）         │
   │                                     │
   │ 6.1 生成观察阶段提示词               │
   │     - 包含当前上下文                 │
   │     - 不包含工具定义                 │
   │                                     │
   │ 6.2 调用 AI（不传工具）              │
   │     - 让 AI 总结工具结果             │
   │     - 提供下一步建议                 │
   │                                     │
   │ 6.3 继续下一轮循环                   │
   └─────────────────────────────────────┘
   ↓
7. 循环结束（达到最大迭代次数或提前结束）
   ↓
8. 返回最终结果
```

#### 工具调用流程

```
Action 阶段生成工具调用
   ↓
检查工具是否需要用户确认
   ├─ 需要确认 → 暂停循环，等待用户确认
   └─ 自动确认 → 继续执行
   ↓
执行工具调用
   ├─ 解析工具参数（JSON）
   ├─ 查找工具所属的 MCP 服务器
   ├─ 调用 backend.executeTool()
   └─ 获取工具执行结果
   ↓
格式化工具结果
   ├─ 创建 tool 类型的消息
   ├─ 保存消息到数据库
   └─ 添加到对话历史
   ↓
进入 Observation 阶段
   ├─ 总结工具结果
   └─ 提供下一步建议
   ↓
继续下一轮 Thought 阶段
```

### 数据流

```
用户输入
   ↓
ReActWorkflowEngine.run()
   ↓
Thought 阶段
   ├─ 调用 chatCompletion()
   ├─ 监听流式响应
   └─ 解析 agent_meta 标签
   ↓
Action 阶段
   ├─ 调用 chatCompletion()（传入工具）
   ├─ 监听流式响应
   ├─ 解析工具调用
   ├─ 执行工具（executeTool）
   └─ 格式化工具结果
   ↓
Observation 阶段
   ├─ 调用 chatCompletion()
   ├─ 监听流式响应
   └─ 总结工具结果
   ↓
返回结果
```

---

## 如何使用这个框架

### 快速开始

#### 1. 安装依赖

框架已经包含在项目中，无需额外安装。

#### 2. 使用 Hook

```typescript
import { useReActAgent } from '@/react-framework/hooks/useReActAgent'

function MyComponent() {
  const {
    isStreaming,
    currentPhase,
    currentIteration,
    startReActAgent,
    stopReActAgent,
    continueAfterToolConfirm,
  } = useReActAgent({
    selectedConfigId: 'your-config-id',
    currentChatId: 'your-chat-id',
    currentResourceId: null,
    currentTaskId: null,
    messagesRef: messagesRef,
    updateMessages: updateMessages,
    mcpServers: mcpServers,
  })

  // 启动 ReAct Agent
  const handleStart = async () => {
    await startReActAgent('your-chat-id')
  }

  // 停止 ReAct Agent
  const handleStop = () => {
    stopReActAgent()
  }

  // 确认工具调用后继续执行
  const handleToolConfirm = async (toolCalls: ToolCall[]) => {
    await continueAfterToolConfirm(toolCalls, 'your-chat-id')
  }

  return (
    <div>
      <button onClick={handleStart} disabled={isStreaming}>
        开始
      </button>
      <button onClick={handleStop} disabled={!isStreaming}>
        停止
      </button>
      {currentPhase !== 'idle' && (
        <div>当前阶段: {currentPhase}, 迭代: {currentIteration}</div>
      )}
    </div>
  )
}
```

#### 3. 直接使用引擎

```typescript
import { ReActWorkflowEngine } from '@/react-framework/workflow/ReActWorkflowEngine'
import { TauriReActBackend } from '@/react-framework/adapters/TauriReActBackend'
import { TauriToolInfoProvider } from '@/react-framework/adapters/TauriToolInfoProvider'
import { ReActPromptManager } from '@/react-framework/prompts/PromptManager'

// 创建引擎实例
const backend = new TauriReActBackend()
const toolProvider = new TauriToolInfoProvider(mcpServers)
const promptManager = new ReActPromptManager()
const engine = new ReActWorkflowEngine(backend, toolProvider, promptManager)

// 运行工作流
await engine.run(
  {
    configId: 'your-config-id',
    chatId: 'your-chat-id',
    initialMessages: messages,
    currentResourceId: null,
    currentTaskId: null,
    maxIterations: 10,
  },
  {
    onMessageUpdate: (updater) => {
      // 更新消息列表
      setMessages(updater)
    },
    onPhaseChange: (phase) => {
      // 更新当前阶段
      console.log('当前阶段:', phase)
    },
    onIterationChange: (iteration) => {
      // 更新迭代次数
      console.log('当前迭代:', iteration)
    },
    onLog: (msg) => {
      // 日志输出
      console.log(msg)
    },
    onError: (error) => {
      // 错误处理
      console.error(error)
    },
  }
)
```

### 自定义业务上下文

#### 方式 1: 使用 PromptManager

```typescript
import { ReActPromptManager } from '@/react-framework/prompts/PromptManager'

const promptManager = new ReActPromptManager()

// 设置默认业务上下文（适用于所有阶段）
promptManager.setSystemContext(`
你正在一个智能助手系统中工作。

## 核心概念
- 用户：系统的使用者
- 任务：用户需要完成的工作

## 业务规则
- 优先使用已有信息，避免重复调用工具
- 提供清晰、准确的回答
`)

// 或为特定阶段设置业务上下文
promptManager.setBusinessContext('thought', thoughtContext)
promptManager.setBusinessContext('action', actionContext)
promptManager.setBusinessContext('observation', observationContext)
```

#### 方式 2: 在 Hook 中使用

```typescript
const getEngine = useCallback(() => {
  if (!engineRef.current) {
    const backend = new TauriReActBackend()
    const toolProvider = new TauriToolInfoProvider(mcpServers)
    const promptManager = new ReActPromptManager()
    
    // 设置业务上下文
    promptManager.setSystemContext(yourBusinessContext)
    
    engineRef.current = new ReActWorkflowEngine(
      backend,
      toolProvider,
      promptManager,
    )
  }
  return engineRef.current
}, [mcpServers])
```

### 处理工具确认

当工具需要用户确认时，框架会暂停循环，等待用户确认：

```typescript
// 在消息中查找待确认的工具调用
const pendingMessage = messages.find(
  (msg) => msg.role === 'assistant' && msg.pendingToolCalls
)

if (pendingMessage && pendingMessage.pendingToolCalls) {
  // 显示工具确认界面
  return (
    <ToolConfirmDialog
      toolCalls={pendingMessage.pendingToolCalls}
      onConfirm={async (toolCalls) => {
        await continueAfterToolConfirm(toolCalls, chatId)
      }}
      onCancel={() => {
        // 取消工具调用
      }}
    />
  )
}
```

### 监听阶段变化

```typescript
const { currentPhase, currentIteration } = useReActAgent({...})

useEffect(() => {
  if (currentPhase === 'thought') {
    console.log('正在思考...')
  } else if (currentPhase === 'action') {
    console.log('正在执行行动...')
  } else if (currentPhase === 'observation') {
    console.log('正在观察结果...')
  }
}, [currentPhase])
```

### 错误处理

```typescript
const { startReActAgent } = useReActAgent({
  ...,
  onError: (error) => {
    console.error('ReAct 错误:', error)
    // 显示错误提示
    showErrorToast(error.message)
  },
})
```

---

## 核心提示词与 System Message 集成

### 提示词架构

ReAct Framework 采用**双层提示词架构**：

1. **框架层级（Core Templates）**：位于 `src/react-framework/prompts/templates.ts`
   - 包含确保框架正常工作的核心提示词
   - 定义各阶段的角色、职责、输出格式等
   - 使用占位符支持业务上下文注入

2. **业务层级（Business Context）**：通过 `ReActPromptManager` 设置
   - 包含与具体业务相关的系统提示词
   - 定义业务概念、业务规则、领域知识等
   - 可以针对不同阶段设置不同的业务上下文

**最终的 System Message = 框架核心模板 + 业务上下文**

### 核心提示词模板

#### 基础系统消息模板

**位置**：`src/react-framework/prompts/templates.ts` - `generateBaseSystemMessage()`

所有三个阶段都共享这个基础系统消息，它包含：

```markdown
你是一个专业的 AI 助手，擅长理解和分析各种类型的内容。

重要概念说明：
- **转写资源（Transcription Resource）**：指需要进行转写的音频或视频文件。当用户提到"视频"、"音频"、"资源"时，通常指的是转写资源。
- **转写任务（Transcription Task）**：对转写资源执行转写操作的具体任务，每个任务关联一个转写资源。

重要提示 - 工具调用策略：
在调用任何工具之前，请先仔细检查对话历史中是否已经包含了所需的信息。
- 如果对话历史中已经有相关信息，请直接使用这些信息，避免重复调用工具。
- 只有在以下情况下才需要调用工具：
  1. 对话历史中完全没有所需的信息
  2. 对话历史中的信息可能已经过时，需要获取最新数据
  3. 用户明确要求重新获取或刷新信息

当前上下文：
- 当前资源ID: {currentResourceId}。你可以使用相关工具查询当前资源的详细信息。
  注意：在调用工具之前，请先检查对话历史中是否已经包含该资源的信息。
- 当前任务ID: {currentTaskId}。你可以使用相关工具查询当前任务的详细信息。
  注意：在调用工具之前，请先检查对话历史中是否已经包含该任务的信息。
```

**注意**：`{currentResourceId}` 和 `{currentTaskId}` 会根据实际上下文动态替换，如果不存在则为空。

#### 1. Thought 阶段提示词

**位置**：`src/react-framework/prompts/templates.ts` - `generateThoughtTemplate()`

**完整模板**：

```markdown
{基础系统消息}

## 可用工具
- {tool1.name}: {tool1.description}
- {tool2.name}: {tool2.description}
...

## 当前阶段：思考

**你的职责：**
分析当前情况，决定下一步应该做什么，并判断是否需要继续执行行动。

**重要说明：**
- 你与其他阶段（行动、观察）共享同一个对话历史，可以看到所有之前的消息
- 你可以了解有哪些工具可以调用（见上方的可用工具列表），但**只做思考和安排任务，不做工具调用**
- 工具调用由行动阶段执行，你只需要在决策中说明需要调用哪个工具
- **必须输出你的思考过程和决策内容**
- 如果可以直接回答用户问题，**必须输出完整的回答内容**
- 如果对话历史中有"观察"和"建议"，请参考建议来决定下一步行动

**关于 shouldContinue 的判断：**
- shouldContinue: true 表示需要继续执行行动阶段，可能的原因包括：
  - 需要调用工具获取信息
  - 需要进一步分析或处理数据
  - 需要执行多个步骤才能完成任务
  - 当前信息不足以给出完整回答
- shouldContinue: false 表示可以直接给出最终回答，可能的原因包括：
  - 已经收集到足够的信息，可以直接回答用户问题
  - 任务已经完成，无需进一步操作
  - 可以直接基于已有信息给出完整回答

**⚠️ 关键要求：**
- **无论 shouldContinue 是 true 还是 false，都必须先输出完整的思考过程和回答内容**
- **禁止只输出 agent_meta 标签而不输出实际内容**
- 如果 shouldContinue 为 false，说明你已经可以给出完整回答，**必须输出完整的回答内容**
- agent_meta 标签只是用来告诉系统是否需要继续执行，**不能替代实际的内容输出**

### 输出格式（严格执行）

**必须按照以下格式输出，顺序不能改变：**

1. **首先**：输出你的分析过程和决策（必须输出，不能省略）
2. **然后**：如果可以直接回答用户问题，输出完整的回答内容（如果 shouldContinue 为 false，这是必须的），agent_meta 中的内容属于保密内容，不用在回复中提到。
3. **最后**：输出 agent_meta 标签

**正确示例（shouldContinue: false）：**

[完整的回答内容，详细说明分析结果和建议]

<agent_meta>
{"shouldContinue": false, "reason": "已经收集到足够信息，可以直接回答"}
</agent_meta>

**正确示例（shouldContinue: true）：**

[分析过程和决策说明，说明需要调用工具或继续执行的原因]

<agent_meta>
{"shouldContinue": true, "reason": "需要调用工具获取信息"}
</agent_meta>

**⚠️ agent_meta 格式要求：**
- **只能包含两个字段**：`shouldContinue`（布尔值）和 `reason`（字符串，可选）
- **禁止添加其他字段**，如 `tool_code`、`action` 等
- **工具调用代码应该在思考过程的文本中说明，而不是在 agent_meta 中**

**错误示例（禁止这样做）：**

<agent_meta>
{"shouldContinue": false, "reason": "已经收集到足够信息，可以直接回答"}
</agent_meta>

### 重要规则

- **必须**先输出分析过程和回答内容，然后才输出 agent_meta 标签
- **禁止**只输出 agent_meta 标签而不输出实际内容
- **禁止**跳过内容输出直接输出 agent_meta 标签
- 如果 shouldContinue 为 false，必须在 agent_meta 之前输出完整的回答
- 必须以 agent_meta 标签结尾，明确是否需要继续执行行动
- **agent_meta 中只能包含 `shouldContinue` 和 `reason` 两个字段，禁止添加其他字段**
```

**说明**：
- `{基础系统消息}` 会被替换为完整的基础系统消息
- `{tool1.name}` 和 `{tool1.description}` 会被替换为实际的工具名称和描述
- 工具列表仅包含工具名称和描述，不包含工具定义（inputSchema），避免 AI 直接调用工具

#### 2. Action 阶段提示词

**位置**：`src/react-framework/prompts/templates.ts` - `generateActionTemplate()`

**完整模板**：

```markdown
{基础系统消息}

## 可用工具
- {tool1.name}: {tool1.description}
- {tool2.name}: {tool2.description}
...

## 当前阶段：行动

**你的职责：**
分析思考阶段的内容，理解需要执行什么任务，然后执行它。如果需要调用工具来完成任务，请主动调用相应的工具。

**重要说明：**
- 你与其他阶段（思考、观察）共享同一个对话历史，可以看到所有之前的消息
- **如果思考阶段明确表示需要调用工具（shouldContinue: true 且 reason 中提到需要调用工具），你必须调用相应的工具**
- 仅输出自己职责内应该输出的内容：行动说明和执行结果

### 输出格式（严格执行）

[简要说明正在执行的任务]

**⚠️ 关键要求：**
- 如果思考阶段决定需要调用工具，**必须调用工具**，不要只输出文字说明
- 工具调用应该在输出行动说明后立即进行
- 工具调用后，系统会自动执行工具并返回结果，你不需要在本次输出中描述工具结果

### 重要规则

- **必须**根据思考阶段的内容执行相应的任务
- **如果思考阶段决定需要调用工具，必须调用工具，不能跳过**
- 工具调用是必须的，不是可选的（当思考阶段明确要求时）
```

**说明**：
- `{基础系统消息}` 会被替换为完整的基础系统消息
- `{tool1.name}` 和 `{tool1.description}` 会被替换为实际的工具名称和描述
- **注意**：在 Action 阶段，虽然工具列表格式相同，但实际调用 AI 时会传入完整的工具定义（包含 inputSchema），以便 AI 能够调用工具

#### 3. Observation 阶段提示词

**位置**：`src/react-framework/prompts/templates.ts` - `generateObservationTemplate()`

**完整模板**：

```markdown
{基础系统消息}

## 当前阶段：观察

**你的职责：**
总结最近 Action 返回的结果，不做最终回答。

**重要说明：**
- 你与其他阶段（思考、行动）共享同一个对话历史，可以看到所有之前的消息
- 仅输出自己职责内应该输出的内容：观察和建议

### 输出格式

[一句简短总结工具返回的结果], 如果有建议则输出: [简短描述建议内容]

### 重要规则

- 仅输出"观察"和"建议"两部分
- 不要开始回答用户问题
```

**说明**：
- `{基础系统消息}` 会被替换为完整的基础系统消息
- Observation 阶段不包含工具列表，因为此阶段只负责总结，不执行工具调用

### 如何集成到你的应用

#### 步骤 1: 创建自定义 PromptManager

```typescript
import { ReActPromptManager } from '@/react-framework/prompts/PromptManager'

const promptManager = new ReActPromptManager()

// 设置业务上下文
const businessContext = `
你正在一个{{你的应用名称}}中工作。

## 核心概念
- 概念 1：定义
- 概念 2：定义

## 业务规则
- 规则 1
- 规则 2
`

promptManager.setSystemContext(businessContext)
```

#### 步骤 2: 为不同阶段设置不同的业务上下文

```typescript
// 思考阶段的业务上下文
const thoughtContext = `
在思考阶段，你需要特别注意：
- 优先检查对话历史中是否已有相关信息
- 避免重复调用相同的工具
`

// 行动阶段的业务上下文
const actionContext = `
在行动阶段，你需要特别注意：
- 严格按照思考阶段的决定执行
- 工具调用前检查参数是否正确
`

promptManager.setBusinessContext('thought', thoughtContext)
promptManager.setBusinessContext('action', actionContext)
promptManager.setBusinessContext('observation', observationContext)
```

#### 步骤 3: 在引擎中使用

```typescript
const engine = new ReActWorkflowEngine(
  backend,
  toolProvider,
  promptManager  // 传入自定义的 PromptManager
)
```

### System Message 生成逻辑

框架在调用 AI 时会自动生成 System Message：

```typescript
// Thought 阶段
const systemMessage = promptManager.getThoughtPrompt(
  currentResourceId,
  currentTaskId,
  toolInfoList  // 仅名称和描述
)

// Action 阶段
const systemMessage = promptManager.getActionPrompt(
  currentResourceId,
  currentTaskId,
  toolInfoList  // 完整工具定义（包含 inputSchema）
)

// Observation 阶段
const systemMessage = promptManager.getObservationPrompt(
  currentResourceId,
  currentTaskId
)
```

### 提示词定制最佳实践

1. **保持框架核心模板不变**
   - 核心模板确保框架正常工作，不要随意修改
   - 只通过业务上下文添加领域知识

2. **业务上下文要清晰**
   - 明确描述核心概念和业务规则
   - 提供工具使用指导
   - 避免与框架核心模板冲突

3. **分阶段定制**
   - 不同阶段可以有不同的业务上下文
   - 思考阶段：强调分析和决策
   - 行动阶段：强调工具调用和执行
   - 观察阶段：强调结果总结

4. **测试和迭代**
   - 根据实际使用效果调整业务上下文
   - 观察 AI 的行为是否符合预期
   - 逐步优化提示词

### 完整示例

```typescript
import { ReActWorkflowEngine } from '@/react-framework/workflow/ReActWorkflowEngine'
import { TauriReActBackend } from '@/react-framework/adapters/TauriReActBackend'
import { TauriToolInfoProvider } from '@/react-framework/adapters/TauriToolInfoProvider'
import { ReActPromptManager } from '@/react-framework/prompts/PromptManager'

// 1. 创建 PromptManager 并设置业务上下文
const promptManager = new ReActPromptManager()

const businessContext = `
你正在一个智能客服系统中工作。

## 核心概念
- **用户问题**：用户提出的咨询或请求
- **知识库**：包含常见问题和答案的知识库
- **工单**：需要人工处理的复杂问题

## 业务规则
- 优先从知识库中查找答案
- 如果知识库中没有答案，创建工单
- 提供友好、专业的回答
`

promptManager.setSystemContext(businessContext)

// 2. 创建引擎
const backend = new TauriReActBackend()
const toolProvider = new TauriToolInfoProvider(mcpServers)
const engine = new ReActWorkflowEngine(backend, toolProvider, promptManager)

// 3. 运行工作流
await engine.run(
  {
    configId: 'your-config-id',
    chatId: 'your-chat-id',
    initialMessages: messages,
    currentResourceId: null,
    currentTaskId: null,
    maxIterations: 10,
  },
  {
    onMessageUpdate: (updater) => {
      setMessages(updater)
    },
    onPhaseChange: (phase) => {
      console.log('当前阶段:', phase)
    },
    onError: (error) => {
      console.error('错误:', error)
    },
  }
)
```

---

## 总结

ReAct Framework 提供了一个灵活、高效的 AI Agent 工作流框架，通过 Thought → Action → Observation 的循环迭代，能够处理各种类型的任务。通过双层提示词架构，既保证了框架的稳定性，又提供了足够的定制空间。

### 核心优势

- ✅ **灵活性高**：可以根据中间结果动态调整策略
- ✅ **响应速度快**：单 Agent 循环，响应更快
- ✅ **成本较低**：API 调用次数相对较少
- ✅ **实现简单**：代码复杂度低，易于理解和维护
- ✅ **易于定制**：通过业务上下文轻松定制行为

### 适用场景

- 简单探索性任务
- 对响应速度敏感的场景
- 开放式问题
- 成本敏感场景

### 注意事项

- 复杂多步任务建议使用多 Agent 框架
- 需要质量保证的场景建议使用多 Agent 框架
- 需要任务追踪的场景建议使用多 Agent 框架

