use crate::{MCPTool, MCPServerConfig, MCPServerInfo};
use serde_json::{json, Value};

// 默认 MCP 服务名称
pub const DEFAULT_MCP_SERVER_NAME: &str = "__system_default__";

// 获取默认 MCP 服务配置
pub fn get_default_server_config() -> MCPServerConfig {
    MCPServerConfig {
        name: Some("系统默认工具".to_string()),
        description: Some("系统内置的默认 MCP 工具服务".to_string()),
        server_type: Some("builtin".to_string()),
        enabled: Some(true),
        transport: None,
        command: None,
        args: None,
        env: None,
        url: None,
    }
}

// 获取默认工具列表
pub fn get_default_tools() -> Vec<MCPTool> {
    vec![
        MCPTool {
            name: "get_system_info".to_string(),
            description: Some("获取系统信息，包括操作系统、架构等".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "include_details": {
                        "type": "boolean",
                        "description": "是否包含详细信息（如环境变量等）",
                        "default": false
                    }
                },
                "required": []
            }),
        },
    ]
}

// 获取默认 MCP 服务信息
pub fn get_default_server_info() -> MCPServerInfo {
    MCPServerInfo {
        name: "系统默认工具".to_string(),
        key: Some(DEFAULT_MCP_SERVER_NAME.to_string()),
        config: get_default_server_config(),
        status: "connected".to_string(),
        tools: Some(get_default_tools()),
        error: None,
        is_default: Some(true),
    }
}

// 检查是否是默认工具
// 此函数可用于验证工具名是否为默认工具，目前未使用但保留以备将来扩展
#[allow(dead_code)]
pub fn is_default_tool(tool_name: &str) -> bool {
    matches!(tool_name, "get_system_info")
}

// 调用默认工具
pub fn call_default_tool(tool_name: &str, arguments: Value) -> Result<Value, String> {
    match tool_name {
        "get_system_info" => handle_get_system_info(arguments),
        _ => Err(format!("默认工具 {} 不存在", tool_name)),
    }
}

// 工具 Handler: 获取系统信息
// 
// Handler 编写说明：
// 1. 函数签名：fn handler_name(arguments: Value) -> Result<Value, String>
//    - arguments: 前端传入的参数，类型为 serde_json::Value（JSON 对象）
//    - 返回值：Result<Value, String>，成功返回 JSON 值，失败返回错误字符串
//
// 2. 参数解析：
//    - 使用 arguments.get("参数名") 获取参数值
//    - 使用 .and_then(|v| v.as_类型()) 进行类型转换
//    - 使用 .unwrap_or(默认值) 设置默认值
//
// 3. 返回值格式：
//    - 必须返回符合 MCP 规范的格式：{ "content": [{ "type": "text", "text": "..." }] }
//    - 或者返回简单的 JSON 对象，会被自动包装
//
// 4. 错误处理：
//    - 使用 Err("错误信息".to_string()) 返回错误
//    - 错误会被传递到前端显示
fn handle_get_system_info(arguments: Value) -> Result<Value, String> {
    // 解析参数：获取 include_details，默认为 false
    let include_details = arguments
        .get("include_details")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    // 构建基础系统信息
    let mut info = json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
    });
    
    // 如果需要详细信息，添加额外信息
    if include_details {
        // 获取当前工作目录
        let current_dir = std::env::current_dir()
            .ok()
            .and_then(|p| p.to_str().map(|s| s.to_string()));
        
        // 获取用户主目录
        let home_dir = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .ok();
        
        // 获取临时目录
        let temp_dir = std::env::temp_dir()
            .to_str()
            .map(|s| s.to_string());
        
        // 添加到信息中
        if let Some(dir) = current_dir {
            info["current_dir"] = json!(dir);
        }
        if let Some(dir) = home_dir {
            info["home_dir"] = json!(dir);
        }
        if let Some(dir) = temp_dir {
            info["temp_dir"] = json!(dir);
        }
        
        // 添加环境变量数量（不暴露具体内容，只显示数量）
        info["env_var_count"] = json!(std::env::vars().count());
    }
    
    // 返回符合 MCP 规范的格式
    Ok(json!({
        "content": [
            {
                "type": "text",
                "text": serde_json::to_string_pretty(&info).unwrap()
            }
        ]
    }))
}

