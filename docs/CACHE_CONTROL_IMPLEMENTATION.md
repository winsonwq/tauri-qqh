# Cache Control 实现总结

## 实现内容

根据 [OpenRouter Prompt Caching 最佳实践](https://openrouter.ai/docs/guides/best-practices/prompt-caching)，我已经实现了统一的 `cache_control` 机制来优化 AI 请求的缓存问题，特别是针对 "get task info" 等 MCP 工具调用的缓存优化。

## 核心改动

### 1. Rust 后端 (`src-tauri/src/ai.rs`)

#### 添加 CacheControl 数据结构
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CacheControl {
    #[serde(rename = "type")]
    pub cache_type: String, // "ephemeral"
}
```

#### 扩展 ChatMessage 结构
```rust
pub struct ChatMessage {
    // ... 现有字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<CacheControl>,
}
```

#### 添加自动应用函数
```rust
pub fn apply_cache_control(messages: &mut Vec<ChatMessage>) {
    for msg in messages.iter_mut() {
        if msg.role == "tool" {
            msg.cache_control = Some(CacheControl {
                cache_type: "ephemeral".to_string(),
            });
        }
    }
}
```

### 2. Rust 后端 (`src-tauri/src/lib.rs`)

在 `chat_completion` 命令中应用缓存控制：
```rust
// 构建消息列表
let mut chat_messages = Vec::new();
// ... 添加消息

// 应用 cache control 优化
ai::apply_cache_control(&mut chat_messages);

// 构建请求
let request = ai::ChatCompletionRequest {
    messages: chat_messages,
    // ...
};
```

### 3. TypeScript 类型定义

#### Agent Framework (`src/agent-framework/core/types.ts`)
```typescript
export interface CacheControl {
  type: 'ephemeral'
}

export interface AIMessage {
  // ... 现有字段
  cache_control?: CacheControl
}
```

#### Utils (`src/utils/aiMessageUtils.ts`)
```typescript
export interface CacheControl {
  type: 'ephemeral'
}

export interface AIMessage {
  // ... 现有字段
  cache_control?: CacheControl
}
```

### 4. 从数据库加载消息时自动添加缓存控制 (`src/utils/aiMessageUtils.ts`)

在 `convertChatMessageToAIMessage` 函数中，当从数据库加载消息时自动添加缓存控制：
```typescript
export function convertChatMessageToAIMessage(msg: ChatMessage): AIMessage {
  // ... 解析其他字段
  
  // 为 tool 消息自动添加 cache_control
  // 即使消息来自数据库，也需要在发送给 AI 时添加缓存标记
  const cache_control = msg.role === 'tool' 
    ? { type: 'ephemeral' as const } 
    : undefined

  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'tool',
    content: msg.content,
    // ... 其他字段
    cache_control,
  }
}
```

### 5. 消息转换时保留缓存控制 (`src/utils/aiMessageUtils.ts`)

在 `convertAIMessagesToChatMessages` 函数中保留缓存控制：
```typescript
// 为 tool 消息自动添加 cache_control（如果还没有）
const cache_control = m.role === 'tool' 
  ? { type: 'ephemeral' as const } 
  : undefined

result.push({
  role: m.role,
  content: m.content || '',
  // ... 其他字段
  cache_control,
})
```

### 6. 工具结果消息创建

#### Agent Framework (`src/agent-framework/workflow/AgentWorkflowEngine.ts`)
```typescript
const toolResultMsg: AIMessage = {
  id: Date.now().toString() + Math.random(),
  role: 'tool',
  content: JSON.stringify(result),
  timestamp: new Date(),
  tool_call_id: toolCall.id,
  name: toolCall.function.name,
  cache_control: { type: 'ephemeral' }  // 新增
}
```

#### Hooks (`src/hooks/useToolCalls.ts`)
```typescript
toolResults.push({
  id: Date.now().toString() + Math.random(),
  role: 'tool',
  content: JSON.stringify(result),
  timestamp: new Date(),
  tool_call_id: toolCall.id,
  name: toolCall.function.name,
  cache_control: { type: 'ephemeral' },  // 新增
})
```

## 设计特点

### 1. 统一机制
- ✅ 使用 OpenRouter 统一的 `cache_control` 机制
- ✅ 不针对不同 provider 做区分
- ✅ 所有支持该机制的提供商都能自动受益

### 2. 自动化
- ✅ 在创建工具结果消息时自动添加 `cache_control`
- ✅ 在后端统一应用，确保一致性
- ✅ 无需手动干预

### 3. Ephemeral 缓存
- ✅ 使用 `ephemeral` 类型表示短暂缓存
- ✅ 适合工具调用结果（如 "get task info"）
- ✅ 优化缓存使用，减少延迟和成本

### 4. 类型安全
- ✅ Rust 端使用强类型定义
- ✅ TypeScript 端使用接口定义
- ✅ 编译时类型检查

### 5. 可选字段
- ✅ 使用 `Option<CacheControl>` 和 `cache_control?`
- ✅ 使用 `skip_serializing_if = "Option::is_none"` 避免发送 null
- ✅ 向后兼容，不影响现有功能

## 工作流程

### 新消息流程

```
1. 前端创建工具结果消息
   ├─ AgentWorkflowEngine 或 useToolCalls
   ├─ 自动添加 cache_control: { type: 'ephemeral' }
   ├─ 保存到数据库（不包含 cache_control）
   └─ 添加到消息列表

2. 消息转换
   ├─ convertAIMessagesToChatMessages() 处理
   ├─ 保留 tool 消息的 cache_control 字段
   └─ 传递给后端

3. 后端处理
   ├─ chat_completion 接收消息
   ├─ apply_cache_control() 确保所有 tool 消息有缓存控制
   ├─ 构建 ChatCompletionRequest
   └─ 发送给 OpenRouter

4. OpenRouter 处理
   ├─ 识别 cache_control 字段
   ├─ 对标记为 ephemeral 的消息应用缓存
   ├─ 优化处理流程
   └─ 返回响应
```

### 历史消息流程（重要！）

```
1. 从数据库加载消息
   ├─ 调用 get_messages_by_chat
   ├─ 数据库中不包含 cache_control 字段
   └─ 返回原始消息数据

2. 消息转换（convertChatMessageToAIMessage）
   ├─ 将数据库格式转换为 AIMessage
   ├─ 检测到 role === 'tool'
   ├─ 自动添加 cache_control: { type: 'ephemeral' }
   └─ 返回包含缓存标记的消息

3. 发送 AI 请求时
   ├─ convertAIMessagesToChatMessages() 保留 cache_control
   ├─ 后端 apply_cache_control() 再次确保（幂等操作）
   ├─ 历史消息也能享受缓存优化
   └─ 无需数据库迁移或修改
```

## 为什么不将 cache_control 存储到数据库

### 设计决策

我们选择**不将 `cache_control` 存储到数据库**，而是在使用时动态添加。

### 原因

1. **缓存策略可能变化**
   - 缓存策略是运行时决策，不是数据的固有属性
   - 未来可能需要调整哪些消息使用缓存
   - 不需要迁移历史数据

2. **数据库简洁性**
   - cache_control 是 API 层面的优化，不是业务数据
   - 减少数据库字段，保持数据模型简洁
   - 避免存储冗余信息

3. **自动应用机制**
   - 通过代码逻辑自动判断和添加
   - 历史消息也能自动享受缓存优化
   - 无需手动维护缓存标记

### 实现方式

#### 新消息
```typescript
// 创建时添加（内存中）
const toolResultMsg: AIMessage = {
  role: 'tool',
  cache_control: { type: 'ephemeral' }
}

// 保存到数据库时不包含 cache_control
await saveMessage(toolResultMsg, chatId)
```

#### 历史消息
```typescript
// 从数据库加载
const dbMessages = await invoke('get_messages_by_chat', { chatId })

// 转换时自动添加
const messages = dbMessages.map(convertChatMessageToAIMessage)
// tool 消息会自动获得 cache_control
```

#### 发送请求时
```rust
// 后端统一应用（幂等操作）
ai::apply_cache_control(&mut chat_messages);
// 确保所有 tool 消息都有 cache_control
```

### 优势

1. ✅ **历史消息自动优化**：从数据库加载的旧消息也能享受缓存
2. ✅ **策略灵活调整**：修改代码即可改变缓存策略，无需数据迁移
3. ✅ **数据库简洁**：不存储 API 层面的优化信息
4. ✅ **幂等操作**：多次应用不会出错
5. ✅ **向后兼容**：旧数据无需任何修改

## 预期效果

### 性能优化
1. **延迟降低**：缓存命中时，处理时间减少 30-50%
2. **成本降低**：某些提供商对缓存内容收费更低
3. **效率提升**：减少重复处理的计算成本

### 特别适用场景
1. **大型工具响应**：如 "get task info" 返回的详细任务信息
2. **频繁调用**：同一工具在短时间内多次调用
3. **结构化数据**：JSON 格式的工具返回结果

## 验证方法

### 1. 检查请求日志
在 Rust 后端日志中查看：
```
[AI Stream] Request JSON: {
  "messages": [
    {
      "role": "tool",
      "content": "...",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}
```

### 2. 测试工具调用
1. 调用任意 MCP 工具
2. 检查工具结果消息是否包含 `cache_control`
3. 验证后续 AI 请求中该字段是否正确发送

### 3. 观察性能
1. 对比实现前后的响应时间
2. 观察缓存命中情况
3. 监控 API 成本变化

## 文档

详细的实现指南和最佳实践请参考：
- `docs/CACHE_CONTROL_GUIDE.md` - 完整的实现指南

## 总结

通过实现统一的 `cache_control` 机制，我们实现了：

1. ✅ **自动化**：工具结果自动添加 ephemeral 缓存标记
2. ✅ **统一性**：使用 OpenRouter 统一机制，不区分 provider
3. ✅ **类型安全**：Rust 和 TypeScript 都有完整的类型定义
4. ✅ **向后兼容**：可选字段，不影响现有功能
5. ✅ **性能优化**：特别是对于大型工具响应（如 "get task info"）

这个实现遵循了 OpenRouter 的最佳实践，使用 `ephemeral` 类型来标记短暂的上下文信息，从而优化缓存使用，减少延迟和成本。
