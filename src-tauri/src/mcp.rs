use crate::{MCPConfig, MCPServerConfig, MCPTool, MCPHTTPTransport};
use serde_json;
use std::collections::HashMap;
use indexmap::IndexMap;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use reqwest;

// 获取 MCP 配置文件路径
pub fn get_mcp_config_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("mcp_configs.json")
}

// 规范化服务器配置（将新格式转换为统一格式）
fn normalize_server_config(server_name: String, mut config: MCPServerConfig) -> MCPServerConfig {
    // 如果配置中有 transport 字段（新格式），需要提取到旧格式字段
    if let Some(transport_value) = &config.transport {
        if let Some(transport_obj) = transport_value.as_object() {
            if let Some(transport_type) = transport_obj.get("type").and_then(|v| v.as_str()) {
                match transport_type {
                    "stdio" => {
                        // 从 transport 中提取 stdio 配置
                        if let Some(command) = transport_obj.get("command").and_then(|v| v.as_str()) {
                            config.command = Some(command.to_string());
                        }
                        if let Some(args) = transport_obj.get("args").and_then(|v| v.as_array()) {
                            config.args = Some(args.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect());
                        }
                        if let Some(env) = transport_obj.get("env").and_then(|v| v.as_object()) {
                            let mut env_map = HashMap::new();
                            for (key, value) in env {
                                if let Some(val_str) = value.as_str() {
                                    env_map.insert(key.clone(), val_str.to_string());
                                }
                            }
                            if !env_map.is_empty() {
                                config.env = Some(env_map);
                            }
                        }
                    }
                    "http" => {
                        // 从 transport 中提取 HTTP 配置
                        if let Some(url) = transport_obj.get("url").and_then(|v| v.as_str()) {
                            config.url = Some(url.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    
    // 如果没有设置 name，使用服务器名称
    if config.name.is_none() {
        config.name = Some(server_name.clone());
    }
    
    config
}

// 读取 MCP 配置（支持新旧两种格式）
pub fn load_mcp_config(config_path: &PathBuf) -> Result<MCPConfig, String> {
    if !config_path.exists() {
        return Ok(MCPConfig {
            mcp_servers: IndexMap::new(),
        });
    }

    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("无法读取 MCP 配置文件: {}", e))?;

    // 先尝试解析为 JSON 对象
    let json_value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("无法解析 MCP 配置文件 JSON: {}", e))?;

    let mut mcp_servers = IndexMap::new();

    // 检查是否是旧格式（包含 mcpServers 字段）
    if let Some(mcp_servers_obj) = json_value.get("mcpServers").and_then(|v| v.as_object()) {
        // 旧格式：{ "mcpServers": { "server-name": { ... } } }
        for (name, server_config_value) in mcp_servers_obj {
            if let Ok(mut server_config) = serde_json::from_value::<MCPServerConfig>(server_config_value.clone()) {
                server_config = normalize_server_config(name.clone(), server_config);
                mcp_servers.insert(name.clone(), server_config);
            }
        }
    } else if let Some(root_obj) = json_value.as_object() {
        // 新格式：{ "server-name": { name: "...", transport: { ... } } }
        // 检查是否有 mcpServers 字段，如果没有，则认为是新格式
        for (key, value) in root_obj {
            // 跳过 mcpServers 字段（如果存在）
            if key == "mcpServers" {
                continue;
            }
            
            // 尝试解析为服务器配置
            if let Ok(mut server_config) = serde_json::from_value::<MCPServerConfig>(value.clone()) {
                // 如果配置中有 transport 字段，认为是新格式
                if server_config.transport.is_some() || server_config.name.is_some() {
                    server_config = normalize_server_config(key.clone(), server_config);
                    mcp_servers.insert(key.clone(), server_config);
                }
            }
        }
    }

    Ok(MCPConfig { mcp_servers })
}

// 保存 MCP 配置
pub fn save_mcp_config(config_path: &PathBuf, config: &MCPConfig) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("无法序列化 MCP 配置: {}", e))?;

    std::fs::write(config_path, content)
        .map_err(|e| format!("无法保存 MCP 配置文件: {}", e))?;

    Ok(())
}

// 通过 HTTP 测试 MCP 连接并获取工具列表
async fn test_mcp_connection_http(
    transport: &MCPHTTPTransport,
) -> Result<Vec<MCPTool>, String> {
    let client = reqwest::Client::new();
    
    // 发送 initialize 请求
    let init_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "qqh-tauri",
                "version": "0.1.0"
            }
        }
    });
    
    let response = client
        .post(&transport.url)
        .json(&init_request)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;
    
    let _init_response: serde_json::Value = response.json().await
        .map_err(|e| format!("解析初始化响应失败: {}", e))?;
    
    // 发送 initialized 通知
    let initialized_notification = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    });
    
    let _ = client
        .post(&transport.url)
        .json(&initialized_notification)
        .send()
        .await;
    
    // 等待一小段时间
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // 请求工具列表
    let list_tools_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
    });
    
    let tools_response = client
        .post(&transport.url)
        .json(&list_tools_request)
        .send()
        .await
        .map_err(|e| format!("请求工具列表失败: {}", e))?;
    
    let tools_data: serde_json::Value = tools_response.json().await
        .map_err(|e| format!("解析工具列表响应失败: {}", e))?;
    
    // 提取工具列表
    if let Some(result) = tools_data.get("result") {
        if let Some(tools) = result.get("tools") {
            if let Some(tools_array) = tools.as_array() {
                let mut mcp_tools = Vec::new();
                for tool in tools_array {
                    if let Ok(mcp_tool) = serde_json::from_value::<MCPTool>(tool.clone()) {
                        mcp_tools.push(mcp_tool);
                    }
                }
                return Ok(mcp_tools);
            }
        }
    }
    
    Ok(Vec::new())
}

// 测试 MCP 连接并获取工具列表
pub async fn test_mcp_connection(
    _server_name: &str,
    config: &MCPServerConfig,
) -> Result<Vec<MCPTool>, String> {
    // 检查新格式的 transport 字段
    if let Some(transport_value) = &config.transport {
        if let Some(transport_obj) = transport_value.as_object() {
            if let Some(transport_type) = transport_obj.get("type").and_then(|v| v.as_str()) {
                match transport_type {
                    "http" => {
                        // HTTP 传输
                        if let Some(url) = transport_obj.get("url").and_then(|v| v.as_str()) {
                            let transport = MCPHTTPTransport {
                                transport_type: "http".to_string(),
                                url: url.to_string(),
                            };
                            return test_mcp_connection_http(&transport).await;
                        }
                    }
                    "stdio" => {
                        // Stdio 传输（新格式）
                        if let Some(command) = transport_obj.get("command").and_then(|v| v.as_str()) {
                            return test_mcp_connection_stdio(
                                command,
                                transport_obj.get("args").and_then(|v| v.as_array())
                                    .map(|arr| arr.iter()
                                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                        .collect()),
                                transport_obj.get("env").and_then(|v| v.as_object())
                                    .map(|obj| {
                                        let mut env_map = HashMap::new();
                                        for (key, value) in obj {
                                            if let Some(val_str) = value.as_str() {
                                                env_map.insert(key.clone(), val_str.to_string());
                                            }
                                        }
                                        env_map
                                    }),
                                transport_obj.get("workingDir").or_else(|| transport_obj.get("working_dir"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                            ).await;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    
    // 检查旧格式的 HTTP 传输（直接使用 url）
    if let Some(url) = &config.url {
        let transport = MCPHTTPTransport {
            transport_type: "http".to_string(),
            url: url.clone(),
        };
        return test_mcp_connection_http(&transport).await;
    }
    
    // 默认使用 stdio 传输（旧格式）
    let command = config.command.as_ref()
        .ok_or("stdio 传输需要 command 字段，或 HTTP 传输需要 transport 或 url 字段")?;
    
    return test_mcp_connection_stdio(
        command,
        config.args.clone(),
        config.env.clone(),
        None, // 旧格式不支持 workingDir
    ).await;
}

// 通过 Stdio 测试 MCP 连接并获取工具列表
async fn test_mcp_connection_stdio(
    command: &str,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    working_dir: Option<String>,
) -> Result<Vec<MCPTool>, String> {
    // 启动 MCP 服务器进程
    let mut cmd = Command::new(command);
    
    // 添加参数
    if let Some(args) = &args {
        for arg in args {
            cmd.arg(arg);
        }
    }
    
    // 设置环境变量
    if let Some(env) = &env {
        for (key, value) in env {
            cmd.env(key, value);
        }
    }
    
    // 设置工作目录
    if let Some(working_dir) = &working_dir {
        cmd.current_dir(working_dir);
    }
    
    // 设置 stdio
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| format!("无法启动 MCP 服务器: {}", e))?;
    
    let mut stdin = child.stdin.take()
        .ok_or("无法获取 stdin")?;
    let stdout = child.stdout.take()
        .ok_or("无法获取 stdout")?;
    
    // 发送 initialize 请求
    let init_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "qqh-tauri",
                "version": "0.1.0"
            }
        }
    });
    
    let init_request_str = format!("{}\n", serde_json::to_string(&init_request)
        .map_err(|e| format!("无法序列化初始化请求: {}", e))?);
    stdin.write_all(init_request_str.as_bytes()).await
        .map_err(|e| format!("无法发送初始化请求: {}", e))?;
    stdin.flush().await
        .map_err(|e| format!("无法刷新 stdin: {}", e))?;
    
    // 读取响应
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    
    // 设置超时（5秒）
    let timeout = tokio::time::Duration::from_secs(5);
    let read_result = tokio::time::timeout(timeout, reader.read_line(&mut line)).await;
    
    match read_result {
        Ok(Ok(_)) => {
            // 解析响应
            let _response: serde_json::Value = serde_json::from_str(&line)
                .map_err(|e| format!("无法解析初始化响应: {}", e))?;
            
            // 发送 initialized 通知
            let initialized_notification = serde_json::json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            });
            
            let initialized_str = format!("{}\n", serde_json::to_string(&initialized_notification)
                .map_err(|e| format!("无法序列化 initialized 通知: {}", e))?);
            stdin.write_all(initialized_str.as_bytes()).await
                .map_err(|e| format!("无法发送 initialized 通知: {}", e))?;
            stdin.flush().await
                .map_err(|e| format!("无法刷新 stdin: {}", e))?;
            
            // 等待一小段时间让服务器处理
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            // 请求工具列表
            let list_tools_request = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list"
            });
            
            let list_tools_str = format!("{}\n", serde_json::to_string(&list_tools_request)
                .map_err(|e| format!("无法序列化工具列表请求: {}", e))?);
            stdin.write_all(list_tools_str.as_bytes()).await
                .map_err(|e| format!("无法发送工具列表请求: {}", e))?;
            stdin.flush().await
                .map_err(|e| format!("无法刷新 stdin: {}", e))?;
            
            // 读取工具列表响应
            let mut tools_line = String::new();
            let tools_read_result = tokio::time::timeout(timeout, reader.read_line(&mut tools_line)).await;
            
            // 关闭 stdin 以让进程知道没有更多输入
            drop(stdin);
            
            match tools_read_result {
                Ok(Ok(_)) => {
                    let tools_response: serde_json::Value = serde_json::from_str(&tools_line)
                        .map_err(|e| format!("无法解析工具列表响应: {}", e))?;
                    
                    // 提取工具列表
                    if let Some(result) = tools_response.get("result") {
                        if let Some(tools) = result.get("tools") {
                            if let Some(tools_array) = tools.as_array() {
                                let mut mcp_tools = Vec::new();
                                for tool in tools_array {
                                    if let Ok(mcp_tool) = serde_json::from_value::<MCPTool>(tool.clone()) {
                                        mcp_tools.push(mcp_tool);
                                    }
                                }
                                return Ok(mcp_tools);
                            }
                        }
                    }
                    Ok(Vec::new())
                }
                Ok(Err(e)) => Err(format!("读取工具列表响应失败: {}", e)),
                Err(_) => Err("读取工具列表响应超时".to_string()),
            }
        }
        Ok(Err(e)) => Err(format!("读取初始化响应失败: {}", e)),
        Err(_) => Err("连接 MCP 服务器超时".to_string()),
    }
}

