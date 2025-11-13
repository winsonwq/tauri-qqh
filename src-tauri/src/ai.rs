use serde::{Deserialize, Serialize};

// OpenAI 兼容的消息格式
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant" | "tool"
    pub content: Option<String>,
    #[serde(default)]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>, // tool name
}

// 工具调用
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String, // "function"
    pub function: FunctionCall,
}

// 函数调用
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String, // JSON string
}

// 工具定义（用于发送给 AI）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String, // "function"
    pub function: FunctionDefinition,
}

// 函数定义
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: Option<String>,
    pub parameters: serde_json::Value, // JSON schema
}

// Chat completion 请求
#[derive(Debug, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<String>, // "auto" | "none" | {"type": "function", "function": {"name": "..."}}
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
}

// Chat completion 流式响应块
#[derive(Debug, Deserialize)]
pub struct ChatCompletionChunk {
    #[allow(dead_code)]
    pub id: String,
    pub choices: Vec<ChoiceChunk>,
    #[serde(default)]
    #[allow(dead_code)]
    pub created: Option<u64>,
}

// 选择块
#[derive(Debug, Deserialize)]
pub struct ChoiceChunk {
    pub delta: DeltaChunk,
    #[serde(default)]
    #[allow(dead_code)]
    pub index: Option<u32>,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

// Delta 块（增量内容）
#[derive(Debug, Deserialize)]
pub struct DeltaChunk {
    #[serde(default)]
    #[allow(dead_code)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub reasoning: Option<String>, // thinking/reasoning 内容（如 deepseek r1）
    #[serde(default)]
    pub tool_calls: Option<Vec<ToolCallChunk>>,
}

// 工具调用块
#[derive(Debug, Deserialize)]
pub struct ToolCallChunk {
    #[serde(default)]
    pub index: Option<u32>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    #[serde(default)]
    pub call_type: Option<String>,
    #[serde(default)]
    pub function: Option<FunctionCallChunk>,
}

// 函数调用块
#[derive(Debug, Deserialize)]
pub struct FunctionCallChunk {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

// Chat completion 非流式响应
#[derive(Debug, Deserialize)]
pub struct ChatCompletionResponse {
    #[allow(dead_code)]
    pub id: String,
    pub choices: Vec<ChoiceResponse>,
    #[serde(default)]
    #[allow(dead_code)]
    pub created: Option<u64>,
}

// 选择响应
#[derive(Debug, Deserialize)]
pub struct ChoiceResponse {
    pub message: MessageResponse,
    #[serde(default)]
    #[allow(dead_code)]
    pub index: Option<u32>,
    #[serde(default)]
    #[allow(dead_code)]
    pub finish_reason: Option<String>,
}

// 消息响应
#[derive(Debug, Deserialize)]
pub struct MessageResponse {
    #[serde(default)]
    #[allow(dead_code)]
    pub role: Option<String>,
    pub content: Option<String>,
}

// 将 MCP 工具转换为 OpenAI 工具定义
pub fn mcp_tool_to_openai_tool(mcp_tool: &crate::MCPTool) -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDefinition {
            name: mcp_tool.name.clone(),
            description: mcp_tool.description.clone(),
            parameters: mcp_tool.input_schema.clone(),
        },
    }
}

// 构建流式请求 URL
pub fn build_chat_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    
    // 如果 base_url 已经包含了 /chat/completions 或 /v1/chat/completions，直接返回
    if base.contains("/chat/completions") {
        return base.to_string();
    }
    
    // 如果 base_url 已经包含了 /v1，则只添加 /chat/completions
    if base.ends_with("/v1") {
        return format!("{}/chat/completions", base);
    }
    
    // 否则添加 /v1/chat/completions
    format!("{}/v1/chat/completions", base)
}

