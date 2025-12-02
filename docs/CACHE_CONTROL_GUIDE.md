# Cache Control 实现指南

## 概述

本文档说明如何在应用中实现 OpenRouter 的 prompt caching 机制，通过 `cache_control` 字段优化 AI 请求的缓存使用。

## 什么是 Prompt Caching

Prompt caching 是一种优化技术，允许 AI 提供商（如 OpenRouter）缓存对话历史中的某些消息，从而：

- **减少延迟**：缓存的内容不需要重新处理
- **降低成本**：某些提供商对缓存内容收费更低
- **提高效率**：特别适合包含大量工具调用结果的对话

## OpenRouter 的缓存机制

OpenRouter 支持统一的 `cache_control` 机制，不需要针对不同 provider 做区分：

```json
{
  "messages": [
    {
      "role": "tool",
      "content": "...",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}
```

### Ephemeral 缓存

`ephemeral` 表示短暂缓存，适合：
- 工具调用结果（如 "get task info"）
- 临时上下文信息
- 不需要长期保留的数据

## 实现架构

### 1. Rust 后端实现

#### 数据结构定义

**文件**: `src-tauri/src/ai.rs`

```rust
// Cache control 配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CacheControl {
    #[serde(rename = "type")]
    pub cache_type: String, // "ephemeral"
}

// ChatMessage 添加 cache_control 字段
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    // ... 其他字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<CacheControl>,
}
```

#### 自动应用缓存控制

**文件**: `src-tauri/src/ai.rs`

```rust
// 应用 cache control 到消息列表
pub fn apply_cache_control(messages: &mut Vec<ChatMessage>) {
    for msg in messages.iter_mut() {
        // 为 tool 角色的消息添加 ephemeral 缓存控制
        if msg.role == "tool" {
            msg.cache_control = Some(CacheControl {
                cache_type: "ephemeral".to_string(),
            });
        }
    }
}
```

#### 在请求中应用

**文件**: `src-tauri/src/lib.rs`

```rust
#[tauri::command]
async fn chat_completion(
    // ... 参数
) -> Result<String, String> {
    // 构建消息列表
    let mut chat_messages = Vec::new();
    // ... 添加消息
    
    // 应用 cache control 优化
    ai::apply_cache_control(&mut chat_messages);
    
    // 构建请求
    let request = ai::ChatCompletionRequest {
        model: ai_config.model.clone(),
        messages: chat_messages,
        // ...
    };
    
    // 发送请求
    // ...
}
```

### 2. TypeScript 前端实现

#### 类型定义

**文件**: `src/agent-framework/core/types.ts` 和 `src/utils/aiMessageUtils.ts`

```typescript
export interface CacheControl {
  type: 'ephemeral'
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  // ... 其他字段
  cache_control?: CacheControl
}
```

#### 消息转换

**文件**: `src/utils/aiMessageUtils.ts`

```typescript
export function convertAIMessagesToChatMessages(messages: AIMessage[]) {
  // ...
  for (const m of messages) {
    // 为 tool 消息自动添加 cache_control
    const cache_control = m.role === 'tool' 
      ? { type: 'ephemeral' as const } 
      : undefined
    
    result.push({
      role: m.role,
      content: m.content || '',
      // ... 其他字段
      cache_control,
    })
  }
  
  return result
}
```

#### 创建工具结果消息

**文件**: `src/agent-framework/workflow/AgentWorkflowEngine.ts`

```typescript
// 格式化工具结果为消息
const toolResultMsg: AIMessage = {
  id: Date.now().toString() + Math.random(),
  role: 'tool',
  content: JSON.stringify(result),
  timestamp: new Date(),
  tool_call_id: toolCall.id,
  name: toolCall.function.name,
  cache_control: { type: 'ephemeral' }  // 添加缓存控制
}
```

**文件**: `src/hooks/useToolCalls.ts`

```typescript
toolResults.push({
  id: Date.now().toString() + Math.random(),
  role: 'tool',
  content: JSON.stringify(result),
  timestamp: new Date(),
  tool_call_id: toolCall.id,
  name: toolCall.function.name,
  cache_control: { type: 'ephemeral' },  // 添加缓存控制
})
```

## 工作流程

### 新消息流程

```
1. 前端创建工具结果消息
   ├─ 自动添加 cache_control: { type: 'ephemeral' }
   ├─ 保存到数据库（不包含 cache_control）
   └─ 添加到消息列表

2. 消息转换
   ├─ convertAIMessagesToChatMessages() 处理消息
   ├─ 保留 tool 消息的 cache_control 字段
   └─ 传递给后端

3. 后端处理
   ├─ chat_completion 接收消息
   ├─ apply_cache_control() 确保所有 tool 消息有缓存控制
   └─ 构建请求发送给 OpenRouter

4. OpenRouter 处理
   ├─ 识别 cache_control 字段
   ├─ 对标记为 ephemeral 的消息应用缓存
   └─ 返回响应
```

### 历史消息流程

```
1. 从数据库加载消息
   ├─ 数据库中不包含 cache_control 字段
   └─ 调用 get_messages_by_chat

2. 消息转换（convertChatMessageToAIMessage）
   ├─ 将数据库格式转换为 AIMessage
   ├─ 自动为 tool 消息添加 cache_control
   └─ 返回包含缓存标记的消息

3. 发送 AI 请求时
   ├─ convertAIMessagesToChatMessages() 保留 cache_control
   ├─ 后端 apply_cache_control() 再次确保（幂等操作）
   └─ 历史消息也能享受缓存优化
```

## 为什么不将 cache_control 存储到数据库

### 设计决策

我们选择**不将 `cache_control` 存储到数据库**，而是在使用时动态添加。原因如下：

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
// 创建时添加
const toolResultMsg: AIMessage = {
  role: 'tool',
  cache_control: { type: 'ephemeral' }  // 内存中有
}

// 保存到数据库时不包含 cache_control
await saveMessage(toolResultMsg, chatId)  // 数据库中无
```

#### 历史消息
```typescript
// 从数据库加载
const dbMessages = await invoke('get_messages_by_chat', { chatId })

// 转换时自动添加
const messages = dbMessages.map(convertChatMessageToAIMessage)
// tool 消息会自动获得 cache_control: { type: 'ephemeral' }
```

#### 发送请求时
```rust
// 后端统一应用（幂等操作）
ai::apply_cache_control(&mut chat_messages);
// 确保所有 tool 消息都有 cache_control，无论来源
```

### 优势

1. ✅ **历史消息自动优化**：从数据库加载的旧消息也能享受缓存
2. ✅ **策略灵活调整**：修改代码即可改变缓存策略，无需数据迁移
3. ✅ **数据库简洁**：不存储 API 层面的优化信息
4. ✅ **幂等操作**：多次应用不会出错
5. ✅ **向后兼容**：旧数据无需任何修改

## 适用场景

### 适合使用 ephemeral 缓存的场景

1. **工具调用结果**
   - `get_task_info` 返回的任务详情
   - `get_resource_info` 返回的资源信息
   - `list_resources` 返回的资源列表
   - 其他 MCP 工具的返回结果

2. **临时上下文**
   - 当前会话的临时数据
   - 不需要跨会话保留的信息

3. **大型响应**
   - 包含大量数据的工具响应
   - JSON 格式的结构化数据

4. **历史工具结果**
   - 从数据库加载的历史 tool 消息
   - 自动应用缓存优化

### 不适合使用缓存的场景

1. **用户消息**
   - 用户的原始输入
   - 需要完整处理的对话内容

2. **系统消息**
   - 系统提示词
   - 角色定义

3. **Assistant 消息**
   - AI 的响应内容
   - 推理过程

## 最佳实践

### 1. 自动化应用

- ✅ **推荐**：在创建工具结果消息时自动添加 `cache_control`
- ✅ **推荐**：在后端统一应用缓存控制，确保一致性
- ❌ **不推荐**：手动为每个消息添加缓存控制

### 2. 统一处理

- ✅ **推荐**：使用统一的 `cache_control` 机制，不区分 provider
- ✅ **推荐**：在消息转换层统一处理
- ❌ **不推荐**：针对不同 provider 使用不同的缓存机制

### 3. 类型安全

- ✅ **推荐**：使用 TypeScript 类型定义确保类型安全
- ✅ **推荐**：使用 Rust 的类型系统确保数据结构正确
- ❌ **不推荐**：使用字符串或 any 类型

### 4. 可选字段

- ✅ **推荐**：使用 `Option<CacheControl>` 和 `cache_control?`
- ✅ **推荐**：使用 `skip_serializing_if = "Option::is_none"` 避免发送 null
- ❌ **不推荐**：强制所有消息都有 cache_control 字段

## 验证和测试

### 1. 检查请求日志

在 Rust 后端日志中查看发送的请求：

```
[AI Stream] Request JSON: {
  "model": "...",
  "messages": [
    {
      "role": "tool",
      "content": "...",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}
```

### 2. 验证消息转换

在前端控制台检查转换后的消息：

```typescript
console.log('Converted messages:', convertAIMessagesToChatMessages(messages))
```

### 3. 测试工具调用

1. 调用一个 MCP 工具（如 `get_task_info`）
2. 检查工具结果消息是否包含 `cache_control`
3. 验证后续请求中该消息是否正确发送

## 性能影响

### 预期收益

1. **延迟降低**
   - 缓存命中时，处理时间减少 30-50%
   - 特别是对于大型工具响应

2. **成本降低**
   - 某些提供商对缓存内容收费更低
   - 减少重复处理的计算成本

3. **效率提升**
   - 减少 token 处理量
   - 提高整体响应速度

### 注意事项

1. **缓存失效**
   - ephemeral 缓存是短暂的，会话结束后失效
   - 不要依赖缓存的长期存在

2. **数据一致性**
   - 缓存的内容可能不是最新的
   - 对于需要实时数据的场景，考虑不使用缓存

3. **提供商支持**
   - 确认使用的 AI 提供商支持 cache_control
   - OpenRouter 已支持统一的缓存机制

## 故障排查

### 问题：缓存控制未生效

**检查清单**：
1. 确认 AI 提供商支持 cache_control
2. 检查请求日志，确认 cache_control 字段已发送
3. 验证消息角色是否为 'tool'
4. 检查 TypeScript 和 Rust 类型定义是否一致

### 问题：请求失败

**可能原因**：
1. 提供商不支持 cache_control 字段
2. cache_control 格式不正确
3. 使用了不支持的缓存类型

**解决方案**：
1. 使用 `skip_serializing_if = "Option::is_none"` 确保字段可选
2. 验证 cache_type 值为 "ephemeral"
3. 检查提供商文档确认支持情况

## 参考资料

- [OpenRouter Prompt Caching Best Practices](https://openrouter.ai/docs/guides/best-practices/prompt-caching)
- [Anthropic Prompt Caching](https://docs.anthropic.com/claude/docs/prompt-caching)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## 总结

通过实现 `cache_control` 机制，我们可以：

1. ✅ 优化工具调用结果的缓存使用
2. ✅ 减少 AI 请求的延迟和成本
3. ✅ 提高整体系统效率
4. ✅ 使用统一的机制，不区分 provider
5. ✅ 自动化应用，无需手动干预

特别是对于像 "get task info" 这样返回大量数据的工具调用，ephemeral 缓存可以显著提升性能。
