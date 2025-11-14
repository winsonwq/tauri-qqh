# MCP 工具 Handler 编写指南

## 概述

本文档说明如何为默认 MCP 服务编写工具 handler，以及前后端如何调用这些工具。

## Handler 编写

### 1. 定义工具 Schema

在 `get_default_tools()` 函数中定义工具的参数 schema：

```rust
MCPTool {
    name: "tool_name".to_string(),
    description: Some("工具描述".to_string()),
    input_schema: json!({
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "参数1的描述",
                "default": "默认值"
            },
            "param2": {
                "type": "boolean",
                "description": "参数2的描述",
                "default": false
            }
        },
        "required": ["param1"]  // 必填参数
    }),
}
```

### 2. 编写 Handler 函数

Handler 函数的标准签名：

```rust
fn handle_tool_name(arguments: Value) -> Result<Value, String>
```

**参数解析示例：**

```rust
fn handle_example(arguments: Value) -> Result<Value, String> {
    // 获取字符串参数
    let param1 = arguments
        .get("param1")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or("param1 是必需的")?;
    
    // 获取布尔参数（带默认值）
    let param2 = arguments
        .get("param2")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    // 获取数字参数
    let param3 = arguments
        .get("param3")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    
    // 处理逻辑...
    let result = json!({
        "result": "处理结果"
    });
    
    // 返回符合 MCP 规范的格式
    Ok(json!({
        "content": [
            {
                "type": "text",
                "text": serde_json::to_string_pretty(&result).unwrap()
            }
        ]
    }))
}
```

### 3. 注册 Handler

在 `call_default_tool()` 函数中注册 handler：

```rust
pub fn call_default_tool(tool_name: &str, arguments: Value) -> Result<Value, String> {
    match tool_name {
        "tool_name" => handle_tool_name(arguments),
        "get_system_info" => handle_get_system_info(arguments),
        _ => Err(format!("默认工具 {} 不存在", tool_name)),
    }
}
```

### 4. 返回值格式

Handler 必须返回符合 MCP 规范的格式：

```rust
// 标准格式（推荐）
Ok(json!({
    "content": [
        {
            "type": "text",
            "text": "结果文本"
        }
    ]
}))

// 或者返回简单的 JSON 对象（会被自动处理）
Ok(json!({
    "result": "数据"
}))
```

## 前端调用

### 1. 通过 AI 对话调用（自动）

当 AI 模型决定使用工具时，会自动调用：

```typescript
// 在 AIPanel.tsx 中，工具调用流程：
// 1. AI 返回 tool_calls
// 2. executeToolCallsAndContinue 函数处理
// 3. 调用 execute_mcp_tool_call Tauri 命令

const result = await invoke<any>('execute_mcp_tool_call', {
  serverName: server.key || server.name,  // 服务器标识
  toolName: 'get_system_info',            // 工具名称
  arguments: {                             // 工具参数
    include_details: true
  }
})
```

### 2. 直接调用（手动）

如果需要在前端直接调用工具：

```typescript
import { invoke } from '@tauri-apps/api/core'

// 调用默认服务的工具
const result = await invoke<any>('execute_mcp_tool_call', {
  serverName: '__system_default__',  // 默认服务名称
  toolName: 'get_system_info',       // 工具名称
  arguments: {                        // 参数对象
    include_details: true
  }
})

console.log('工具调用结果:', result)
```

### 3. 参数传递

参数以 JSON 对象形式传递：

```typescript
// 示例：调用 get_system_info
const arguments = {
  include_details: true  // 布尔参数
}

// 示例：调用其他工具
const arguments = {
  param1: "字符串值",
  param2: 123,
  param3: true
}
```

## 后端调用流程

### 1. Tauri 命令入口

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn execute_mcp_tool_call(
    server_name: String,
    tool_name: String,
    arguments: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    // 检查是否是默认服务
    if server_name == default_mcp::DEFAULT_MCP_SERVER_NAME {
        return default_mcp::call_default_tool(&tool_name, arguments);
    }
    
    // 其他服务的处理...
}
```

### 2. 默认工具路由

```rust
// src-tauri/src/default_mcp.rs
pub fn call_default_tool(tool_name: &str, arguments: Value) -> Result<Value, String> {
    match tool_name {
        "get_system_info" => handle_get_system_info(arguments),
        // 添加更多工具...
        _ => Err(format!("默认工具 {} 不存在", tool_name)),
    }
}
```

### 3. Handler 执行

```rust
// Handler 函数执行逻辑
fn handle_get_system_info(arguments: Value) -> Result<Value, String> {
    // 1. 解析参数
    // 2. 执行业务逻辑
    // 3. 返回结果
}
```

## 完整示例

### 添加新工具示例

假设要添加一个 `calculate` 工具：

1. **定义工具 Schema：**

```rust
MCPTool {
    name: "calculate".to_string(),
    description: Some("执行数学计算".to_string()),
    input_schema: json!({
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "要计算的数学表达式"
            },
            "precision": {
                "type": "number",
                "description": "结果精度（小数位数）",
                "default": 2
            }
        },
        "required": ["expression"]
    }),
}
```

2. **编写 Handler：**

```rust
fn handle_calculate(arguments: Value) -> Result<Value, String> {
    let expression = arguments
        .get("expression")
        .and_then(|v| v.as_str())
        .ok_or("expression 参数是必需的")?;
    
    let precision = arguments
        .get("precision")
        .and_then(|v| v.as_u64())
        .unwrap_or(2) as usize;
    
    // 执行计算（这里简化处理）
    let result = format!("计算结果: {}", expression);
    
    Ok(json!({
        "content": [
            {
                "type": "text",
                "text": result
            }
        ]
    }))
}
```

3. **注册 Handler：**

```rust
pub fn call_default_tool(tool_name: &str, arguments: Value) -> Result<Value, String> {
    match tool_name {
        "get_system_info" => handle_get_system_info(arguments),
        "calculate" => handle_calculate(arguments),  // 新增
        _ => Err(format!("默认工具 {} 不存在", tool_name)),
    }
}
```

4. **前端调用：**

```typescript
const result = await invoke<any>('execute_mcp_tool_call', {
  serverName: '__system_default__',
  toolName: 'calculate',
  arguments: {
    expression: '2 + 2',
    precision: 2
  }
})
```

## 注意事项

1. **参数验证**：Handler 中应该验证必需参数，返回清晰的错误信息
2. **错误处理**：使用 `Result<Value, String>` 返回错误，错误信息会传递到前端
3. **返回值格式**：确保返回值符合 MCP 规范
4. **类型安全**：使用 Rust 的类型系统确保参数类型正确
5. **默认值**：为可选参数提供合理的默认值

