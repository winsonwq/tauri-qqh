use crate::{MCPTool, MCPServerConfig, MCPServerInfo, db};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;

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
        MCPTool {
            name: "get_resource_info".to_string(),
            description: Some("获取转写资源信息。如果不提供 resource_id，将使用当前上下文中的资源ID".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "resource_id": {
                        "type": "string",
                        "description": "资源ID（可选，如果不提供则使用当前上下文）"
                    }
                },
                "required": []
            }),
        },
        MCPTool {
            name: "get_task_info".to_string(),
            description: Some("获取转写任务（记录）信息。如果不提供 task_id，将使用当前上下文中的任务ID".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "任务ID（可选，如果不提供则使用当前上下文）"
                    }
                },
                "required": []
            }),
        },
        MCPTool {
            name: "search_resources".to_string(),
            description: Some("通过关键词搜索转写资源。搜索会在资源名称和文件路径中进行匹配。如果不提供 keyword 或 keyword 为空，则返回所有资源".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "搜索关键词（可选，如果不提供或为空则返回所有资源）"
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
    matches!(tool_name, "get_system_info" | "get_resource_info" | "get_task_info" | "search_resources")
}

// 获取应用数据目录（辅助函数）
fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))
}

// 工具 Handler: 搜索资源
async fn handle_search_resources(
    arguments: Value,
    app: AppHandle,
) -> Result<Value, String> {
    // 解析参数：获取 keyword（可选）
    let keyword = arguments
        .get("keyword")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    // 获取数据库路径
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 根据 keyword 是否为空决定查询方式
    let resources = if let Some(ref kw) = keyword {
        if kw.trim().is_empty() {
            // keyword 为空字符串，查询所有资源
            tokio::task::spawn_blocking({
                let db_path = db_path.clone();
                move || {
                    let conn = db::init_database(&db_path)
                        .map_err(|e| format!("无法初始化数据库: {}", e))?;
                    db::get_all_resources(&conn)
                        .map_err(|e| format!("无法查询资源: {}", e))
                }
            })
            .await
            .map_err(|e| format!("数据库操作失败: {}", e))??
        } else {
            // keyword 有值，进行搜索
            let keyword = kw.clone();
            tokio::task::spawn_blocking({
                let db_path = db_path.clone();
                move || {
                    let conn = db::init_database(&db_path)
                        .map_err(|e| format!("无法初始化数据库: {}", e))?;
                    db::search_resources(&conn, &keyword)
                        .map_err(|e| format!("无法搜索资源: {}", e))
                }
            })
            .await
            .map_err(|e| format!("数据库操作失败: {}", e))??
        }
    } else {
        // 未提供 keyword，查询所有资源
        tokio::task::spawn_blocking({
            let db_path = db_path.clone();
            move || {
                let conn = db::init_database(&db_path)
                    .map_err(|e| format!("无法初始化数据库: {}", e))?;
                db::get_all_resources(&conn)
                    .map_err(|e| format!("无法查询资源: {}", e))
            }
        })
        .await
        .map_err(|e| format!("数据库操作失败: {}", e))??
    };
    
    // 为每个资源获取任务数量
    let mut resources_with_task_count = Vec::new();
    for resource in resources {
        let task_count = tokio::task::spawn_blocking({
            let db_path = db_path.clone();
            let resource_id = resource.id.clone();
            move || {
                let conn = db::init_database(&db_path)
                    .map_err(|e| format!("无法初始化数据库: {}", e))?;
                db::get_tasks_by_resource(&conn, &resource_id)
                    .map(|tasks| tasks.len())
                    .map_err(|e| format!("无法查询任务: {}", e))
            }
        })
        .await
        .map_err(|e| format!("数据库操作失败: {}", e))??;
        
        let resource_info = json!({
            "id": resource.id,
            "name": resource.name,
            "file_path": resource.file_path,
            "resource_type": match resource.resource_type {
                crate::ResourceType::Audio => "audio",
                crate::ResourceType::Video => "video",
            },
            "extracted_audio_path": resource.extracted_audio_path,
            "created_at": resource.created_at,
            "updated_at": resource.updated_at,
            "task_count": task_count,
        });
        
        resources_with_task_count.push(resource_info);
    }
    
    // 返回 component 格式，指定组件名为 resource-list
    Ok(json!({
        "content": [
            {
                "type": "component",
                "component": "resource-list",
                "props": {
                    "resources": resources_with_task_count,
                    "keyword": keyword.unwrap_or_default(),
                    "count": resources_with_task_count.len()
                }
            }
        ]
    }))
}

// 调用默认工具
pub async fn call_default_tool(
    tool_name: &str,
    arguments: Value,
    app: AppHandle,
    current_resource_id: Option<String>,
    current_task_id: Option<String>,
) -> Result<Value, String> {
    match tool_name {
        "get_system_info" => handle_get_system_info(arguments),
        "get_resource_info" => {
            handle_get_resource_info(arguments, app, current_resource_id).await
        }
        "get_task_info" => {
            handle_get_task_info(arguments, app, current_task_id).await
        }
        "search_resources" => {
            handle_search_resources(arguments, app).await
        }
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

// 工具 Handler: 获取资源信息
async fn handle_get_resource_info(
    arguments: Value,
    app: AppHandle,
    current_resource_id: Option<String>,
) -> Result<Value, String> {
    // 解析参数：获取 resource_id，如果没有提供则使用上下文中的值
    let resource_id = arguments
        .get("resource_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(current_resource_id);
    
    let resource_id = resource_id.ok_or_else(|| {
        "未提供 resource_id 参数，且当前上下文中也没有资源ID".to_string()
    })?;
    
    // 获取数据库路径
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 在阻塞任务中查询数据库
    let resource = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let resource_id = resource_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_resource(&conn, &resource_id)
                .map_err(|e| format!("无法从数据库读取资源: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    let resource = resource.ok_or_else(|| {
        format!("资源 {} 不存在", resource_id)
    })?;
    
    // 获取关联的任务数量
    let task_count = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let resource_id = resource_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_tasks_by_resource(&conn, &resource_id)
                .map(|tasks| tasks.len())
                .map_err(|e| format!("无法查询任务: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 获取最新转写任务的内容（如果存在）
    let latest_transcription_content: Option<String> = if let Some(ref latest_task_id) = resource.latest_completed_task_id {
        // 尝试读取转写结果内容
        let task_id = latest_task_id.clone();
        let db_path_clone = db_path.clone();
        match tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            let task = db::get_task(&conn, &task_id)
                .map_err(|e| format!("无法查询任务: {}", e))?;
            
            if let Some(task) = task {
                if task.status == "completed" {
                    if let Some(result_path) = task.result {
                        let result_file = std::path::PathBuf::from(&result_path);
                        if result_file.exists() {
                            let content = std::fs::read_to_string(&result_file)
                                .map_err(|e| format!("无法读取结果文件: {}", e))?;
                            Ok(Some(content))
                        } else {
                            Ok(None)
                        }
                    } else {
                        Ok(None)
                    }
                } else {
                    Ok(None)
                }
            } else {
                Ok(None)
            }
        })
        .await {
            Ok(Ok(content)) => content,
            Ok(Err(_)) => None, // 如果读取失败，不返回错误，只是不包含内容
            Err(_) => None, // 如果任务执行失败，不包含内容
        }
    } else {
        None
    };
    
    // 构建资源信息（作为 component 属性）
    let mut resource_info = json!({
        "id": resource.id,
        "name": resource.name,
        "file_path": resource.file_path,
        "resource_type": match resource.resource_type {
            crate::ResourceType::Audio => "audio",
            crate::ResourceType::Video => "video",
        },
        "extracted_audio_path": resource.extracted_audio_path,
        "latest_completed_task_id": resource.latest_completed_task_id,
        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
        "task_count": task_count,
    });
    
    // 如果存在转写内容，添加到资源信息中
    if let Some(content) = latest_transcription_content {
        resource_info["latest_transcription_content"] = json!(content);
    }
    
    // 添加提示信息，说明如果存在转写内容，应该进行分析
    if resource_info.get("latest_transcription_content").is_some() {
        resource_info["has_transcription_content"] = json!(true);
    }
    
    // 返回 component 格式，指定组件名为 resource-info
    Ok(json!({
        "content": [
            {
                "type": "component",
                "component": "resource-info",
                "props": resource_info
            }
        ]
    }))
}

// 工具 Handler: 获取任务信息
async fn handle_get_task_info(
    arguments: Value,
    app: AppHandle,
    current_task_id: Option<String>,
) -> Result<Value, String> {
    // 解析参数：获取 task_id，如果没有提供则使用上下文中的值
    let task_id = arguments
        .get("task_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(current_task_id);
    
    let task_id = task_id.ok_or_else(|| {
        "未提供 task_id 参数，且当前上下文中也没有任务ID".to_string()
    })?;
    
    // 获取数据库路径
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 在阻塞任务中查询数据库
    let task = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let task_id = task_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_task(&conn, &task_id)
                .map_err(|e| format!("无法从数据库读取任务: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    let task = task.ok_or_else(|| {
        format!("任务 {} 不存在", task_id)
    })?;
    
    // 获取关联的资源信息
    let resource = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let resource_id = task.resource_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_resource(&conn, &resource_id)
                .map_err(|e| format!("无法从数据库读取资源: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 获取转写内容（如果任务已完成且有结果文件）
    let transcription_content: Option<String> = if task.status == "completed" {
        if let Some(ref result_path) = task.result {
            let result_path_clone = result_path.clone();
            match tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
                let result_file = std::path::PathBuf::from(&result_path_clone);
                if result_file.exists() {
                    let content = std::fs::read_to_string(&result_file)
                        .map_err(|e| format!("无法读取结果文件: {}", e))?;
                    Ok(Some(content))
                } else {
                    Ok(None)
                }
            })
            .await {
                Ok(Ok(content)) => content,
                Ok(Err(_)) => None, // 如果读取失败，不返回错误，只是不包含内容
                Err(_) => None, // 如果任务执行失败，不包含内容
            }
        } else {
            None
        }
    } else {
        None
    };
    
    // 构建任务信息（作为 component 属性）
    let mut task_info = json!({
        "id": task.id,
        "resource_id": task.resource_id,
        "status": task.status,
        "created_at": task.created_at,
        "completed_at": task.completed_at,
        "result": task.result,
        "error": task.error,
    });
    
    // 如果存在转写内容，添加到任务信息中
    if let Some(content) = transcription_content {
        task_info["transcription_content"] = json!(content);
    }
    
    // 添加提示信息，说明如果存在转写内容，应该进行分析
    if task_info.get("transcription_content").is_some() {
        task_info["has_transcription_content"] = json!(true);
    }
    
    // 如果资源存在，添加资源名称
    if let Some(resource) = resource {
        task_info["resource_name"] = json!(resource.name);
        task_info["resource_type"] = json!(match resource.resource_type {
            crate::ResourceType::Audio => "audio",
            crate::ResourceType::Video => "video",
        });
    }
    
    // 返回 component 格式，指定组件名为 task-info
    Ok(json!({
        "content": [
            {
                "type": "component",
                "component": "task-info",
                "props": task_info
            }
        ]
    }))
}

