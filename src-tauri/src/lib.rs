mod db;
mod mcp;
mod ai;
mod default_mcp;

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use uuid::Uuid;
use chrono::Utc;
use tokio::io::AsyncRead;
use tokio::task::JoinHandle;
use tokio::process::Child;
use tokio::sync::Mutex;
use std::collections::HashMap;
use indexmap::IndexMap;
#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;

// 转写资源类型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ResourceType {
    #[serde(rename = "audio")]
    Audio,
    #[serde(rename = "video")]
    Video,
}

// 资源来源类型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SourceType {
    #[serde(rename = "file")]
    File,
    #[serde(rename = "url")]
    Url,
}

// 视频平台类型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum Platform {
    #[serde(rename = "youtube")]
    Youtube,
    #[serde(rename = "bilibili")]
    Bilibili,
    #[serde(rename = "other")]
    Other,
}

// 转写资源模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionResource {
    pub id: String,
    pub name: String,
    pub file_path: String, // 文件地址或URL链接
    #[serde(default = "default_resource_type")]
    pub resource_type: ResourceType,
    #[serde(default = "default_source_type")]
    pub source_type: SourceType, // 来源类型：文件或URL（默认为file，保持向后兼容）
    #[serde(default)]
    pub platform: Option<Platform>, // 平台类型（仅URL资源有）：youtube、bilibili、other
    #[serde(default)]
    pub extracted_audio_path: Option<String>, // 提取的音频路径（仅视频资源有）
    #[serde(default)]
    pub latest_completed_task_id: Option<String>, // 最新一条转写成功的任务 ID
    pub created_at: String,
    pub updated_at: String,
}

// 默认资源类型（用于兼容旧数据）
fn default_resource_type() -> ResourceType {
    ResourceType::Audio
}

// 默认来源类型（用于兼容旧数据）
fn default_source_type() -> SourceType {
    SourceType::File
}

// 转写任务模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionTask {
    pub id: String,
    pub resource_id: String,
    pub status: String, // "pending" | "running" | "completed" | "failed"
    pub created_at: String,
    pub completed_at: Option<String>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub log: Option<String>, // 运行日志（stdout + stderr）
    pub params: TranscriptionParams,
}

// 转写参数
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionParams {
    pub model: Option<String>,
    pub language: Option<String>,
    pub device: Option<String>,
    pub compute_type: Option<String>,
    pub beam_size: Option<u32>,
    pub best_of: Option<u32>,
    pub patience: Option<f32>,
    pub condition_on_previous_text: Option<bool>,
    pub initial_prompt: Option<String>,
    pub word_timestamps: Option<bool>,
    pub temperature: Option<f32>,
    pub compression_ratio_threshold: Option<f32>,
    pub log_prob_threshold: Option<f32>,
    pub no_speech_threshold: Option<f32>,
    pub translate: Option<bool>,
}

// AI 配置模型（OpenAI 兼容）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
}

// Chat 模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

// Message 模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub role: String, // "user" | "assistant" | "tool"
    pub content: String,
    pub tool_calls: Option<String>, // JSON string
    pub tool_call_id: Option<String>,
    pub name: Option<String>, // tool name
    pub reasoning: Option<String>, // thinking/reasoning 内容
    pub created_at: String,
}

// Chat 列表项（包含最后消息时间）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatListItem {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_message_at: Option<String>,
    pub message_count: i32,
}

// MCP HTTP 传输配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPHTTPTransport {
    #[serde(rename = "type")]
    pub transport_type: String, // "http"
    pub url: String,
}

// MCP Stdio 传输配置（新格式）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPStdioTransport {
    #[serde(rename = "type")]
    pub transport_type: String, // "stdio"
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "workingDir")]
    pub working_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "retryAttempts")]
    pub retry_attempts: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "retryDelay")]
    pub retry_delay: Option<u32>,
}

// MCP 传输配置（使用 serde_json::Value 以支持两种类型）
#[derive(Debug, Clone)]
pub enum MCPTransport {
    Http(MCPHTTPTransport),
    Stdio(MCPStdioTransport),
}

// MCP 服务器配置（支持多种格式）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPServerConfig {
    // 新格式的元数据字段
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub server_type: Option<String>, // "stdio" | "http"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    
    // 新格式的传输配置（使用 serde_json::Value 以便灵活解析）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport: Option<serde_json::Value>,
    
    // 旧格式的 stdio 传输配置（向后兼容）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    
    // 旧格式的 HTTP 传输配置（向后兼容）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

// MCP 配置（整个配置文件格式）
// 支持两种格式：
// 1. 旧格式：{ "mcpServers": { "server-name": { ... } } }
// 2. 新格式：{ "server-name": { name: "...", transport: { ... } } }
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPConfig {
    #[serde(default, rename = "mcpServers")]
    pub mcp_servers: IndexMap<String, MCPServerConfig>,
}

// MCP 工具定义
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPTool {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

// MCP 服务器信息（包含连接状态和工具列表）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPServerInfo {
    pub name: String, // 显示名称（优先使用配置中的 name 字段）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>, // 原始配置键名（用于删除等操作）
    pub config: MCPServerConfig,
    pub status: String, // "connected" | "disconnected" | "error"
    #[serde(default)]
    pub tools: Option<Vec<MCPTool>>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>, // 是否为系统默认服务
}

// 运行中的任务进程管理器
#[derive(Clone)]
pub struct RunningTasks {
    // 存储 task_id -> Arc<Mutex<Child>> 进程句柄，使用 Arc 和 Mutex 以便多个地方可以访问
    tasks: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl RunningTasks {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn insert(&self, task_id: String, child: Child) {
        let mut tasks = self.tasks.lock().await;
        tasks.insert(task_id, Arc::new(Mutex::new(child)));
    }

    pub async fn remove(&self, task_id: &str) -> Option<Arc<Mutex<Child>>> {
        let mut tasks = self.tasks.lock().await;
        tasks.remove(task_id)
    }

    pub async fn get(&self, task_id: &str) -> Option<Arc<Mutex<Child>>> {
        let tasks = self.tasks.lock().await;
        tasks.get(task_id).cloned()
    }

    pub async fn contains(&self, task_id: &str) -> bool {
        let tasks = self.tasks.lock().await;
        tasks.contains_key(task_id)
    }
}

// 运行中的音频提取进程管理器
#[derive(Clone)]
pub struct RunningExtractions {
    // 存储 resource_id -> Arc<Mutex<Child>> 进程句柄
    extractions: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl RunningExtractions {
    pub fn new() -> Self {
        Self {
            extractions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn insert(&self, resource_id: String, child: Child) {
        let mut extractions = self.extractions.lock().await;
        extractions.insert(resource_id, Arc::new(Mutex::new(child)));
    }

    pub async fn remove(&self, resource_id: &str) -> Option<Arc<Mutex<Child>>> {
        let mut extractions = self.extractions.lock().await;
        extractions.remove(resource_id)
    }

    pub async fn get(&self, resource_id: &str) -> Option<Arc<Mutex<Child>>> {
        let extractions = self.extractions.lock().await;
        extractions.get(resource_id).cloned()
    }

    pub async fn contains(&self, resource_id: &str) -> bool {
        let extractions = self.extractions.lock().await;
        extractions.contains_key(resource_id)
    }
}

// 运行中的流式任务管理器
#[derive(Clone)]
pub struct RunningStreams {
    // 存储 event_id -> AbortHandle 任务句柄
    streams: Arc<Mutex<HashMap<String, tokio::task::AbortHandle>>>,
}

impl RunningStreams {
    pub fn new() -> Self {
        Self {
            streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn insert(&self, event_id: String, handle: tokio::task::AbortHandle) {
        let mut streams = self.streams.lock().await;
        streams.insert(event_id, handle);
    }

    pub async fn remove(&self, event_id: &str) -> Option<tokio::task::AbortHandle> {
        let mut streams = self.streams.lock().await;
        streams.remove(event_id)
    }

    pub async fn abort(&self, event_id: &str) -> bool {
        let mut streams = self.streams.lock().await;
        if let Some(handle) = streams.remove(event_id) {
            handle.abort();
            true
        } else {
            false
        }
    }
}

// 获取应用数据目录
fn get_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    // 确保目录存在
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("无法创建应用数据目录: {}", e))?;
    
    Ok(app_data_dir)
}


// 获取 whisper-cli 可执行文件路径
fn get_whisper_cli_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 首先尝试从 Tauri 资源目录获取（生产环境）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join("tools/whisper/macos-arm64/bin/whisper-cli");
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    // 开发环境：从可执行文件目录向上查找
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?;
    
    let exe_dir = exe_path.parent()
        .ok_or("无法获取可执行文件目录")?;
    
    // 尝试开发环境的多个可能路径
    let possible_paths = vec![
        exe_dir.join("tools/whisper/macos-arm64/bin/whisper-cli"),
    ];
    
    for path in possible_paths {
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    Err("未找到 whisper-cli 可执行文件。请确保工具已正确打包到 tools 目录中。".to_string())
}

// 获取 ffmpeg 可执行文件路径
fn get_ffmpeg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 首先尝试从 Tauri 资源目录获取（生产环境）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join("tools/ffmpeg/macos-arm64/ffmpeg");
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    // 开发环境：从可执行文件目录向上查找
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?;
    
    let exe_dir = exe_path.parent()
        .ok_or("无法获取可执行文件目录")?;
    
    // 尝试开发环境的多个可能路径
    let possible_paths = vec![
        exe_dir.join("tools/ffmpeg/macos-arm64/ffmpeg"),
    ];
    
    for path in possible_paths {
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    Err("未找到 ffmpeg 可执行文件。请确保工具已正确打包到 tools 目录中。".to_string())
}

// 获取 yt-dlp 可执行文件路径
fn get_ytdlp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 首先尝试从 Tauri 资源目录获取（生产环境）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join("tools/yt-dlp/macos-arm64/yt-dlp");
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    // 开发环境：从可执行文件目录向上查找
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?;
    
    let exe_dir = exe_path.parent()
        .ok_or("无法获取可执行文件目录")?;
    
    // 尝试开发环境的多个可能路径
    let possible_paths = vec![
        exe_dir.join("tools/yt-dlp/macos-arm64/yt-dlp"),
        exe_dir.join("../tools/yt-dlp/macos-arm64/yt-dlp"),
    ];
    
    for path in possible_paths {
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    // 如果本地工具目录中没有找到，尝试从系统 PATH 查找
    let output = std::process::Command::new("which")
        .arg("yt-dlp")
        .output();
    
    if let Ok(output) = output {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(path_str);
                if path.exists() && path.is_file() {
                    return Ok(path);
                }
            }
        }
    }
    
    // 如果 which 命令失败，尝试直接执行 yt-dlp --version 来检测
    let check_output = std::process::Command::new("yt-dlp")
        .arg("--version")
        .output();
    
    if let Ok(output) = check_output {
        if output.status.success() {
            // 如果能执行，返回可执行文件名（系统会在 PATH 中查找）
            return Ok(PathBuf::from("yt-dlp"));
        }
    }
    
    Err("未找到 yt-dlp。请确保已安装 yt-dlp 并将其添加到系统 PATH 中，或将其放置在 tools/yt-dlp/macos-arm64/ 目录下。可以通过 'brew install yt-dlp' 或 'pip install yt-dlp' 安装。".to_string())
}

// 辅助函数：读取流并实时发送事件
fn spawn_stream_reader(
    stream: impl AsyncRead + Send + Unpin + 'static,
    app: tauri::AppHandle,
    event_name: String,
    stream_type: &'static str,
    enable_debug: bool,
) -> JoinHandle<String> {
    tokio::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(stream);
        let mut lines = reader.lines();
        let mut output = String::new();
        
        if enable_debug {
            eprintln!("开始监听 {}，事件名称: {}", stream_type, event_name);
        }
        
        while let Ok(Some(line)) = lines.next_line().await {
            let line_with_newline = format!("{}\n", line);
            output.push_str(&line_with_newline);
            // 实时发送到前端
            if enable_debug {
                eprintln!("发送 {} 日志: {}", stream_type, line);
            }
            if let Err(e) = app.emit(&event_name, &line) {
                if enable_debug {
                    eprintln!("发送日志事件失败: {}", e);
                }
            }
        }
        output
    })
}

// 辅助函数：读取 ffmpeg 输出并发送日志事件
fn spawn_ffmpeg_progress_reader(
    stream: impl AsyncRead + Send + Unpin + 'static,
    app: tauri::AppHandle,
    log_event_name: String,
) -> JoinHandle<String> {
    tokio::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let reader = tokio::io::BufReader::new(stream);
        let mut lines = reader.lines();
        let mut output = String::new();
        
        while let Ok(Some(line)) = lines.next_line().await {
            let line_with_newline = format!("{}\n", line);
            output.push_str(&line_with_newline);
            
            // 发送日志事件
            let _ = app.emit(&log_event_name, &line);
        }
        output
    })
}

// 检测URL平台类型
fn detect_url_platform(url: &str) -> Option<Platform> {
    let url_lower = url.to_lowercase();
    
    // YouTube 检测
    if url_lower.contains("youtube.com") || url_lower.contains("youtu.be") {
        return Some(Platform::Youtube);
    }
    
    // Bilibili 检测
    if url_lower.contains("bilibili.com") || url_lower.contains("b23.tv") {
        return Some(Platform::Bilibili);
    }
    
    // 如果看起来是URL但不是已知平台，返回 Other
    if url_lower.starts_with("http://") || url_lower.starts_with("https://") {
        return Some(Platform::Other);
    }
    
    None
}

// 检测是否为URL
fn is_url(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    path_lower.starts_with("http://") || path_lower.starts_with("https://")
}

// 检测文件类型（根据扩展名或URL）
fn detect_resource_type(file_path: &str) -> ResourceType {
    // 如果是URL，默认认为是视频（因为大多数视频平台都是视频）
    if is_url(file_path) {
        return ResourceType::Video;
    }
    
    let path = PathBuf::from(file_path);
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        let ext_lower = ext.to_lowercase();
        match ext_lower.as_str() {
            "mp4" | "avi" | "mov" | "mkv" | "wmv" | "flv" | "webm" | "m4v" | "3gp" => {
                ResourceType::Video
            }
            _ => ResourceType::Audio,
        }
    } else {
        ResourceType::Audio
    }
}

// 创建转写资源
#[tauri::command]
async fn create_transcription_resource(
    name: String,
    file_path: String,
    app: tauri::AppHandle,
) -> Result<TranscriptionResource, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    // 检测资源类型
    let resource_type = detect_resource_type(&file_path);
    
    let resource = TranscriptionResource {
        id: id.clone(),
        name,
        file_path,
        resource_type: resource_type.clone(),
        source_type: SourceType::File, // 文件资源
        platform: None,
        extracted_audio_path: None,
        latest_completed_task_id: None,
        created_at: now.clone(),
        updated_at: now,
    };
    
    // 保存到数据库
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::create_resource(&conn, &resource)
            .map_err(|e| format!("无法保存资源到数据库: {}", e))?;
        Ok(resource)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 从URL创建转写资源
#[tauri::command]
async fn create_transcription_resource_from_url(
    name: String,
    url: String,
    app: tauri::AppHandle,
) -> Result<TranscriptionResource, String> {
    // 验证URL格式
    if !is_url(&url) {
        return Err("无效的URL格式。请提供以 http:// 或 https:// 开头的URL。".to_string());
    }
    
    // 检测平台类型
    let platform = detect_url_platform(&url);
    
    // 检测资源类型（URL资源默认是视频）
    let resource_type = ResourceType::Video;
    
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let resource = TranscriptionResource {
        id: id.clone(),
        name,
        file_path: url, // URL存储在file_path字段中
        resource_type,
        source_type: SourceType::Url,
        platform,
        extracted_audio_path: None,
        latest_completed_task_id: None,
        created_at: now.clone(),
        updated_at: now,
    };
    
    // 保存到数据库
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::create_resource(&conn, &resource)
            .map_err(|e| format!("无法保存资源到数据库: {}", e))?;
        Ok(resource)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 创建转写任务
#[tauri::command]
async fn create_transcription_task(
    resource_id: String,
    params: TranscriptionParams,
    app: tauri::AppHandle,
) -> Result<TranscriptionTask, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let task = TranscriptionTask {
        id: id.clone(),
        resource_id,
        status: "pending".to_string(),
        created_at: now,
        completed_at: None,
        result: None,
        error: None,
        log: None,
        params,
    };
    
    // 保存到数据库
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::create_task(&conn, &task)
            .map_err(|e| format!("无法保存任务到数据库: {}", e))?;
        Ok(task)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 执行转写任务（调用 faster-whisper）
#[tauri::command]
async fn execute_transcription_task(
    task_id: String,
    resource_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 从数据库读取资源和任务
    let (mut resource, mut task): (TranscriptionResource, TranscriptionTask) = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let task_id = task_id.clone();
        let resource_id = resource_id.clone();
        move || -> Result<(TranscriptionResource, TranscriptionTask), String> {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            
            let resource = db::get_resource(&conn, &resource_id)
                .map_err(|e| format!("无法读取资源: {}", e))?
                .ok_or_else(|| format!("转写资源不存在: {}", resource_id))?;
            
            let task = db::get_task(&conn, &task_id)
                .map_err(|e| format!("无法读取任务: {}", e))?
                .ok_or_else(|| format!("转写任务不存在: {}", task_id))?;
            
            Ok((resource, task))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 检查任务是否已经在运行
    let running_tasks: State<'_, RunningTasks> = app.state();
    if running_tasks.contains(&task_id).await {
        eprintln!("任务 {} 已经在运行中，跳过重复执行", task_id);
        // 如果任务状态不是 running，更新为 running（可能是在重新进入页面时）
        if task.status != "running" {
            task.status = "running".to_string();
            let db_path_clone = db_path.clone();
            let task_clone = task.clone();
            tokio::task::spawn_blocking(move || {
                let conn = db::init_database(&db_path_clone)
                    .map_err(|e| format!("无法初始化数据库: {}", e))?;
                db::update_task(&conn, &task_clone)
                    .map_err(|e| format!("无法更新任务: {}", e))
            })
            .await
            .map_err(|e| format!("数据库操作失败: {}", e))??;
        }
        // 返回一个占位符，表示任务已经在运行
        return Ok("任务已经在运行中".to_string());
    }
    
    // 更新任务状态为 running
    task.status = "running".to_string();
    let db_path_clone = db_path.clone();
    let task_clone = task.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::update_task(&conn, &task_clone)
            .map_err(|e| format!("无法更新任务: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 如果是URL资源（YouTube），尝试从URL获取字幕（不使用 whisper）
    if matches!(resource.source_type, SourceType::Url) {
        // 只处理 YouTube 资源，暂时不考虑 Bilibili
        let is_youtube = resource.platform.as_ref()
            .map(|p| matches!(p, Platform::Youtube))
            .unwrap_or_else(|| {
                // 如果没有 platform 信息，通过 URL 检测
                let url_lower = resource.file_path.to_lowercase();
                url_lower.contains("youtube.com") || url_lower.contains("youtu.be")
            });
        
        if is_youtube {
            eprintln!("检测到 YouTube URL 资源，使用 yt-dlp 获取字幕...");
            
            let output_dir = app_data_dir.join("transcription_results");
            std::fs::create_dir_all(&output_dir)
                .map_err(|e| format!("无法创建结果目录: {}", e))?;
            
            let output_file = output_dir.join(format!("{}.json", task_id));
            
            // 创建事件名称用于发送实时日志
            let stdout_event_name = format!("transcription-stdout-{}", task_id);
            let stderr_event_name = format!("transcription-stderr-{}", task_id);
            
            // 发送开始消息
            let _ = app.emit(&stdout_event_name, "检测到 YouTube URL 资源，使用 yt-dlp 获取字幕...\n");
            
            // 尝试下载字幕（传入 task_id 以实时发送日志）
            match download_subtitle_from_url_internal(resource.file_path.clone(), app.clone(), Some(task_id.clone())).await {
            Ok(srt_path) => {
                eprintln!("字幕下载成功: {}", srt_path);
                let _ = app.emit(&stdout_event_name, &format!("字幕下载成功: {}\n", srt_path));
                
                // 将SRT转换为JSON
                let _ = app.emit(&stdout_event_name, "正在将字幕转换为转写结果格式...\n");
                match convert_srt_to_transcription_json(&PathBuf::from(&srt_path)) {
                    Ok(json_content) => {
                        // 保存JSON结果
                        let _ = app.emit(&stdout_event_name, "正在保存转写结果...\n");
                        std::fs::write(&output_file, &json_content)
                            .map_err(|e| format!("无法保存转写结果: {}", e))?;
                        
                        // 更新任务状态为完成
                        task.status = "completed".to_string();
                        task.result = Some(output_file.to_string_lossy().to_string());
                        task.completed_at = Some(Utc::now().to_rfc3339());
                        task.log = Some(format!("从URL成功获取字幕并转换为转写结果\nSRT文件: {}\n", srt_path));
                        
                        let _ = app.emit(&stdout_event_name, "转写任务完成！\n");
                        
                        let db_path_clone = db_path.clone();
                        let task_clone = task.clone();
                        tokio::task::spawn_blocking(move || {
                            let conn = db::init_database(&db_path_clone)
                                .map_err(|e| format!("无法初始化数据库: {}", e))?;
                            db::update_task(&conn, &task_clone)
                                .map_err(|e| format!("无法更新任务: {}", e))
                        })
                        .await
                        .map_err(|e| format!("数据库操作失败: {}", e))??;
                        
                        // 更新资源的最新完成任务ID
                        resource.latest_completed_task_id = Some(task_id.clone());
                        resource.updated_at = Utc::now().to_rfc3339();
                        let db_path_clone = db_path.clone();
                        let resource_clone = resource.clone();
                        tokio::task::spawn_blocking(move || {
                            let conn = db::init_database(&db_path_clone)
                                .map_err(|e| format!("无法初始化数据库: {}", e))?;
                            db::update_resource(&conn, &resource_clone)
                                .map_err(|e| format!("无法更新资源: {}", e))
                        })
                        .await
                        .map_err(|e| format!("数据库操作失败: {}", e))??;
                        
                        return Ok("从URL成功获取字幕并转换为转写结果".to_string());
                    }
                    Err(e) => {
                        eprintln!("SRT转JSON失败: {}", e);
                        let _ = app.emit(&stderr_event_name, &format!("SRT转JSON失败: {}\n", e));
                        task.status = "failed".to_string();
                        task.error = Some(format!("SRT转JSON失败: {}", e));
                        task.completed_at = Some(Utc::now().to_rfc3339());
                        
                        let db_path_clone = db_path.clone();
                        let task_clone = task.clone();
                        tokio::task::spawn_blocking(move || {
                            let conn = db::init_database(&db_path_clone)
                                .map_err(|e| format!("无法初始化数据库: {}", e))?;
                            db::update_task(&conn, &task_clone)
                                .map_err(|e| format!("无法更新任务: {}", e))
                        })
                        .await
                        .map_err(|e| format!("数据库操作失败: {}", e))??;
                        
                        return Err(format!("SRT转JSON失败: {}", e));
                    }
                }
            }
            Err(e) => {
                eprintln!("字幕下载失败: {}", e);
                let _ = app.emit(&stderr_event_name, &format!("字幕下载失败: {}\n", e));
                // 对于URL资源，如果字幕获取失败，返回错误（不尝试whisper转写）
                task.status = "failed".to_string();
                task.error = Some(format!("无法从URL获取字幕: {}。请确保视频有字幕且yt-dlp已正确安装。", e));
                task.completed_at = Some(Utc::now().to_rfc3339());
                
                let db_path_clone = db_path.clone();
                let task_clone = task.clone();
                tokio::task::spawn_blocking(move || {
                    let conn = db::init_database(&db_path_clone)
                        .map_err(|e| format!("无法初始化数据库: {}", e))?;
                    db::update_task(&conn, &task_clone)
                        .map_err(|e| format!("无法更新任务: {}", e))
                })
                .await
                .map_err(|e| format!("数据库操作失败: {}", e))??;
                
                return Err(format!("无法从URL获取字幕: {}。请确保视频有字幕且yt-dlp已正确安装。", e));
            }
            } // 闭合 match 语句
        } else {
            // 非 YouTube URL 资源，暂时不支持
            task.status = "failed".to_string();
            task.error = Some("暂不支持此类型的 URL 资源。目前仅支持 YouTube 视频。".to_string());
            task.completed_at = Some(Utc::now().to_rfc3339());
            
            let db_path_clone = db_path.clone();
            let task_clone = task.clone();
            tokio::task::spawn_blocking(move || {
                let conn = db::init_database(&db_path_clone)
                    .map_err(|e| format!("无法初始化数据库: {}", e))?;
                db::update_task(&conn, &task_clone)
                    .map_err(|e| format!("无法更新任务: {}", e))
            })
            .await
            .map_err(|e| format!("数据库操作失败: {}", e))??;
            
            return Err("暂不支持此类型的 URL 资源。目前仅支持 YouTube 视频。".to_string());
        }
    }
    
    // 调用 whisper-cli 进行转写（文件资源）
    // 如果是视频资源，使用提取的音频路径；否则使用原始文件路径
    let audio_path = match resource.resource_type {
        ResourceType::Video => {
            if let Some(extracted_path) = &resource.extracted_audio_path {
                PathBuf::from(extracted_path)
            } else {
                return Err("视频资源尚未提取音频，请先提取音频".to_string());
            }
        }
        ResourceType::Audio => PathBuf::from(&resource.file_path),
    };
    let output_dir = app_data_dir.join("transcription_results");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("无法创建结果目录: {}", e))?;
    
    let output_file = output_dir.join(format!("{}.json", task_id));
    
    // 获取模型目录和模型路径
    let models_dir = app_data_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("无法创建模型目录: {}", e))?;
    
    let model_name = task.params.model.as_deref().unwrap_or("base");
    let language = task.params.language.as_deref().unwrap_or("zh");
    
    // whisper.cpp 使用的模型格式是 ggml-{model_name}.bin
    // 对于 multi-language 模型，文件名格式为 ggml-{model_name}.bin
    let model_file_name = format!("ggml-{}.bin", model_name);
    let model_path = models_dir.join(&model_file_name);
    
    // 检查模型文件是否存在
    if !model_path.exists() {
        let err_msg = format!("模型文件不存在: {}。请先下载模型。", model_path.display());
        eprintln!("{}", err_msg);
        
        task.status = "failed".to_string();
        task.error = Some(err_msg.clone());
        task.completed_at = Some(Utc::now().to_rfc3339());
        
        let db_path_clone = db_path.clone();
        let task_clone = task.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::update_task(&conn, &task_clone)
                .map_err(|e| format!("无法更新任务: {}", e))
        })
        .await
        .map_err(|e| format!("数据库操作失败: {}", e))??;
        
        return Err(err_msg);
    }
    
    // 获取 whisper-cli 路径
    let whisper_cli = get_whisper_cli_path(&app)?;
    
    // 构建 whisper-cli 命令
    // whisper-cli 参数：
    // -m: 模型路径
    // -l: 语言（zh, en, auto 等）
    // -f: 输入音频文件
    // -oj: 输出 JSON 格式
    // -of: 输出文件路径（不带扩展名）
    // -tr: 翻译为英文（如果设置了 translate 参数）
    let output_file_stem = output_file.file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无法获取输出文件名")?;
    let output_file_dir = output_file.parent()
        .ok_or("无法获取输出文件目录")?;
    
    let translate = task.params.translate.unwrap_or(false);
    
    eprintln!("开始执行 whisper-cli: {}", whisper_cli.display());
    eprintln!("音频文件路径: {}", audio_path.display());
    eprintln!("模型路径: {}", model_path.display());
    eprintln!("输出文件路径: {}", output_file.display());
    eprintln!("翻译: {}", translate);
    
    let mut cmd = tokio::process::Command::new(&whisper_cli);
    cmd.arg("-m")
        .arg(&model_path)
        .arg("-l")
        .arg(language)
        .arg("-f")
        .arg(&audio_path)
        .arg("-oj")  // 输出 JSON 格式
        .arg("-of")
        .arg(output_file_dir.join(output_file_stem));
        // 移除 -np 参数，以便能看到实时输出
    
    // 如果设置了翻译参数，添加 -tr 参数
    if translate {
        cmd.arg("-tr");
    }
    
    // 设置 stdout 和 stderr 为管道，以便实时读取
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| {
            let err_msg = format!("无法执行 whisper-cli: {}。请确保工具已正确安装。", e);
            eprintln!("{}", err_msg);
            err_msg
        })?;
    
    // 获取 stdout 和 stderr 的句柄
    let stdout = child.stdout.take()
        .ok_or("无法获取 stdout 句柄")?;
    let stderr = child.stderr.take()
        .ok_or("无法获取 stderr 句柄")?;
    
    // 将进程句柄存储到 RunningTasks 中，以便可以停止
    let running_tasks: State<'_, RunningTasks> = app.state();
    running_tasks.insert(task_id.clone(), child).await;
    
    // 创建事件名称：始终使用固定的 task_id 作为事件名，这样前端可以随时重新订阅
    // 不再使用 event_id，因为监听和运行已经分离
    let stdout_event_name = format!("transcription-stdout-{}", task_id);
    let stderr_event_name = format!("transcription-stderr-{}", task_id);
    
    // 使用辅助函数并发读取 stdout 和 stderr，实时发送事件
    let stdout_handle = spawn_stream_reader(
        stdout,
        app.clone(),
        stdout_event_name,
        "stdout",
        true, // 启用调试日志
    );
    
    let stderr_handle = spawn_stream_reader(
        stderr,
        app.clone(),
        stderr_event_name,
        "stderr",
        true, // 启用调试日志
    );
    
    // 等待进程完成
    // 注意：child 已经存储在 RunningTasks 中，stop_transcription_task 可以访问它
    // 我们需要定期检查进程状态，如果 child 不在 RunningTasks 中，说明任务已被停止
    let running_tasks_clone: State<'_, RunningTasks> = app.state();
    
    // 使用循环定期检查进程状态
    let status = loop {
        // 检查 child 是否还在 RunningTasks 中
        if let Some(child_arc) = running_tasks_clone.get(&task_id).await {
            // 尝试等待进程完成（非阻塞）
            let mut child_guard = child_arc.lock().await;
            if let Ok(Some(exit_status)) = child_guard.try_wait() {
                // 进程已完成，从 RunningTasks 中移除
                let _ = running_tasks_clone.remove(&task_id).await;
                break exit_status;
            }
            // 释放锁，等待一段时间后重试
            drop(child_guard);
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        } else {
            // child 不在 RunningTasks 中，说明任务已被停止
            // 返回一个表示被中断的退出码
            break std::process::ExitStatus::from_raw(130); // SIGINT 退出码
        }
    };
    
    // 获取 stdout 和 stderr 的输出
    let stdout_output = stdout_handle.await
        .map_err(|e| format!("读取 stdout 失败: {}", e))?;
    let stderr_output = stderr_handle.await
        .map_err(|e| format!("读取 stderr 失败: {}", e))?;
    
    // 合并日志
    let mut log_buffer = String::new();
    if !stdout_output.is_empty() {
        log_buffer.push_str("=== STDOUT ===\n");
        log_buffer.push_str(&stdout_output);
    }
    if !stderr_output.is_empty() {
        if !log_buffer.is_empty() {
            log_buffer.push('\n');
        }
        log_buffer.push_str("=== STDERR ===\n");
        log_buffer.push_str(&stderr_output);
    }
    
    // 保存日志到任务
    task.log = Some(log_buffer);
    
    eprintln!("whisper-cli stdout: {}", stdout_output);
    eprintln!("whisper-cli stderr: {}", stderr_output);
    eprintln!("whisper-cli 退出码: {:?}", status.code());
    
    if !status.success() {
        let error_msg = if !stderr_output.is_empty() {
            stderr_output.trim().to_string()
        } else if !stdout_output.is_empty() {
            stdout_output.trim().to_string()
        } else {
            format!("whisper-cli 执行失败，退出码: {:?}", status.code())
        };
        
        eprintln!("转写失败: {}", error_msg);
        
        task.status = "failed".to_string();
        task.error = Some(error_msg.clone());
        task.completed_at = Some(Utc::now().to_rfc3339());
        
        let db_path_clone = db_path.clone();
        let task_clone = task.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::update_task(&conn, &task_clone)
                .map_err(|e| format!("无法更新任务: {}", e))
        })
        .await
        .map_err(|e| format!("数据库操作失败: {}", e))??;
        
        return Err(format!("转写失败: {}", error_msg));
    }
    
    // 检查输出文件是否存在
    if !output_file.exists() {
        let err_msg = format!("转写完成但未生成输出文件: {}", output_file.display());
        eprintln!("{}", err_msg);
        
        task.status = "failed".to_string();
        task.error = Some(err_msg.clone());
        task.completed_at = Some(Utc::now().to_rfc3339());
        
        let db_path_clone = db_path.clone();
        let task_clone = task.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::update_task(&conn, &task_clone)
                .map_err(|e| format!("无法更新任务: {}", e))
        })
        .await
        .map_err(|e| format!("数据库操作失败: {}", e))??;
        
        return Err(err_msg);
    }
    
    eprintln!("转写成功，输出文件: {}", output_file.display());
    
    // 更新任务状态为 completed
    task.status = "completed".to_string();
    task.completed_at = Some(Utc::now().to_rfc3339());
    task.result = Some(output_file.to_string_lossy().to_string());
    // log 已经在上面保存了
    
    // 更新资源的最新转写成功的任务 ID
    resource.latest_completed_task_id = Some(task_id.clone());
    resource.updated_at = Utc::now().to_rfc3339();
    
    let db_path_clone = db_path.clone();
    let task_clone = task.clone();
    let resource_clone = resource.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::update_task(&conn, &task_clone)
            .map_err(|e| format!("无法更新任务: {}", e))?;
        db::update_resource(&conn, &resource_clone)
            .map_err(|e| format!("无法更新资源: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(output_file.to_string_lossy().to_string())
}

// 停止转写任务
#[tauri::command]
async fn stop_transcription_task(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let running_tasks: State<'_, RunningTasks> = app.state();
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 从数据库读取任务
    let mut task = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let task_id = task_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_task(&conn, &task_id)
                .map_err(|e| format!("无法读取任务: {}", e))?
                .ok_or_else(|| format!("任务 {} 不存在", task_id))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 如果任务状态不是 RUNNING，不允许停止
    if task.status != "running" {
        return Err(format!("任务 {} 不在运行中（当前状态: {}）", task_id, task.status));
    }
    
    // 检查任务是否在 running_tasks 中（实际有进程在运行）
    if running_tasks.contains(&task_id).await {
        // 从 HashMap 中获取进程句柄
        if let Some(child_arc) = running_tasks.get(&task_id).await {
            // 获取 child 的锁
            let mut child = child_arc.lock().await;
            
            // 尝试优雅地终止进程（发送 SIGTERM）
            if let Err(e) = child.kill().await {
                eprintln!("终止进程失败: {}", e);
                // 即使终止失败，也继续更新任务状态为失败
            } else {
                // 释放锁，等待进程退出
                drop(child);
                
                // 等待进程退出
                let mut child = child_arc.lock().await;
                let _ = child.wait().await;
            }
            
            // 从 RunningTasks 中移除
            let _ = running_tasks.remove(&task_id).await;
            
            eprintln!("已停止任务: {}", task_id);
        }
    } else {
        // 任务状态是 RUNNING，但不在 running_tasks 中（可能是进程已崩溃或卡住）
        eprintln!("任务 {} 状态为 RUNNING，但不在运行列表中，直接标记为失败", task_id);
    }
    
    // 更新任务状态为 failed（因为是被用户停止的）
    task.status = "failed".to_string();
    task.error = Some("任务已被用户停止".to_string());
    task.completed_at = Some(Utc::now().to_rfc3339());
    
    let db_path_clone = db_path.clone();
    let task_clone = task.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::update_task(&conn, &task_clone)
            .map_err(|e| format!("无法更新任务: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(())
}

// 获取所有转写资源
#[tauri::command]
async fn get_transcription_resources(
    app: tauri::AppHandle,
) -> Result<Vec<TranscriptionResource>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::get_all_resources(&conn)
            .map_err(|e| format!("无法从数据库读取资源: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 获取转写任务列表
#[tauri::command]
async fn get_transcription_tasks(
    resource_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<TranscriptionTask>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        if let Some(res_id) = resource_id {
            db::get_tasks_by_resource(&conn, &res_id)
                .map_err(|e| format!("无法从数据库读取任务: {}", e))
        } else {
            db::get_all_tasks(&conn)
                .map_err(|e| format!("无法从数据库读取任务: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 获取单个转写任务
#[tauri::command]
async fn get_transcription_task(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<TranscriptionTask, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::get_task(&conn, &task_id)
            .map_err(|e| format!("无法从数据库读取任务: {}", e))?
            .ok_or_else(|| format!("转写任务不存在: {}", task_id))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 删除转写资源
#[tauri::command]
async fn delete_transcription_resource(
    resource_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let mut conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        // 检查资源是否存在
        if db::get_resource(&conn, &resource_id)
            .map_err(|e| format!("无法查询资源: {}", e))?
            .is_none() {
            return Err(format!("转写资源不存在: {}", resource_id));
        }
        
        // 先获取所有关联的任务，以便删除它们的结果文件
        let tasks = db::get_tasks_by_resource(&conn, &resource_id)
            .map_err(|e| format!("无法查询关联任务: {}", e))?;
        
        // 使用事务保护数据库操作
        let tx = conn.transaction()
            .map_err(|e| format!("无法开始事务: {}", e))?;
        
        // 在事务中删除所有关联的任务
        db::delete_tasks_by_resource(&tx, &resource_id)
            .map_err(|e| format!("无法删除关联任务: {}", e))?;
        
        // 在事务中删除资源
        db::delete_resource(&tx, &resource_id)
            .map_err(|e| format!("无法删除资源: {}", e))?;
        
        // 提交事务
        tx.commit()
            .map_err(|e| format!("无法提交事务: {}", e))?;
        
        // 事务成功后，删除所有任务的结果文件（文件删除失败不影响数据库操作）
        for task in &tasks {
            if let Some(ref result_path) = task.result {
                let result_file = PathBuf::from(result_path);
                if result_file.exists() {
                    let _ = std::fs::remove_file(&result_file);
                }
            }
        }
        
        Ok(())
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 删除转写任务
#[tauri::command]
async fn delete_transcription_task(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        // 读取任务信息，以便删除关联的结果文件
        let task = db::get_task(&conn, &task_id)
            .map_err(|e| format!("无法查询任务: {}", e))?
            .ok_or_else(|| format!("转写任务不存在: {}", task_id))?;
        
        // 删除结果文件（如果存在）
        if let Some(result_path) = task.result {
            let result_file = PathBuf::from(&result_path);
            if result_file.exists() {
                let _ = std::fs::remove_file(&result_file);
            }
        }
        
        db::delete_task(&conn, &task_id)
            .map_err(|e| format!("无法删除任务: {}", e))?;
        
        Ok(())
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 读取转写结果文件内容
#[tauri::command]
async fn read_transcription_result(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let task = db::get_task(&conn, &task_id)
            .map_err(|e| format!("无法查询任务: {}", e))?
            .ok_or_else(|| format!("转写任务不存在: {}", task_id))?;
        
        if let Some(result_path) = task.result {
            let result_file = PathBuf::from(&result_path);
            if result_file.exists() {
                let content = std::fs::read_to_string(&result_file)
                    .map_err(|e| format!("无法读取结果文件: {}", e))?;
                Ok(content)
            } else {
                Err("结果文件不存在".to_string())
            }
        } else {
            Err("转写任务尚未完成或没有结果".to_string())
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// whisper-cli 环境检测结果
#[derive(Debug, Serialize, Deserialize)]
pub struct FastWhisperStatus {
    pub whisper_cli_available: bool,
    pub whisper_cli_path: Option<String>,
    pub error: Option<String>,
}

// 检测 whisper-cli 环境
#[tauri::command]
async fn check_fast_whisper_status(app: tauri::AppHandle) -> Result<FastWhisperStatus, String> {
    match get_whisper_cli_path(&app) {
        Ok(path) => {
            // 检查文件是否可执行
            let available = path.exists() && path.is_file();
            Ok(FastWhisperStatus {
                whisper_cli_available: available,
                whisper_cli_path: if available {
                    Some(path.to_string_lossy().to_string())
                } else {
                    None
                },
                error: if !available {
                    Some("whisper-cli 文件不存在或不可执行".to_string())
                } else {
                    None
                },
            })
        }
        Err(e) => {
            Ok(FastWhisperStatus {
                whisper_cli_available: false,
                whisper_cli_path: None,
                error: Some(e),
            })
        }
    }
}

// 安装 faster-whisper（已废弃，工具已打包在应用中）
#[tauri::command]
async fn install_faster_whisper(app: tauri::AppHandle) -> Result<String, String> {
    // whisper-cli 已经打包在应用中，不需要安装
    // 如果检测不到，可能是打包或路径配置问题
    match get_whisper_cli_path(&app) {
        Ok(path) => {
            Ok(format!("whisper-cli 工具已就绪，路径: {}", path.display()))
        }
        Err(e) => {
            Err(format!("未找到 whisper-cli 工具: {}。请确保工具已正确打包到应用中。", e))
        }
    }
}

// 获取模型目录路径
#[tauri::command]
async fn get_models_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let models_dir = app_data_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("无法创建模型目录: {}", e))?;
    Ok(models_dir.to_string_lossy().to_string())
}

// 已下载的模型信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: Option<u64>,
    pub downloaded: bool,
}

// 下载进度信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ModelDownloadProgress {
    pub model_name: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub progress: f64, // 0-100
}

// 获取已下载的模型列表
#[tauri::command]
async fn get_downloaded_models(app: tauri::AppHandle) -> Result<Vec<ModelInfo>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let models_dir = app_data_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("无法创建模型目录: {}", e))?;

    let available_models = vec!["tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3"];
    
    let mut models = Vec::new();

    // whisper.cpp 使用的模型格式是 ggml-{model_name}.bin
    for model_name in &available_models {
        let model_file_name = format!("ggml-{}.bin", model_name);
        let model_path = models_dir.join(&model_file_name);
        
        let downloaded = model_path.exists() && model_path.is_file();

        // 如果已下载，获取文件大小
        let size = if downloaded {
            model_path.metadata()
                .ok()
                .map(|m| m.len())
        } else {
            None
        };

        models.push(ModelInfo {
            name: model_name.to_string(),
            size,
            downloaded,
        });
    }

    Ok(models)
}


// 下载模型
#[tauri::command]
async fn download_model(
    model_name: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // 获取模型目录
    let app_data_dir = get_app_data_dir(&app)?;
    let models_dir = app_data_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("无法创建模型目录: {}", e))?;

    // whisper.cpp 模型文件名格式: ggml-{model_name}.bin
    let model_file_name = format!("ggml-{}.bin", model_name);
    let model_path = models_dir.join(&model_file_name);
    
    // 如果模型已存在，直接返回
    if model_path.exists() {
        return Ok(format!("模型 {} 已存在", model_name));
    }

    // 从 Hugging Face 下载模型
    // whisper.cpp 模型仓库: https://huggingface.co/ggerganov/whisper.cpp
    let model_url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model_file_name
    );

    eprintln!("开始下载模型: {} 从 {}", model_name, model_url);

    // 使用 reqwest 下载文件
    let client = reqwest::Client::new();
    let response = client
        .get(&model_url)
        .send()
        .await
        .map_err(|e| format!("无法连接到下载服务器: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，服务器返回状态码: {}", response.status()));
    }

    let total_size = response.content_length();
    let mut file = tokio::fs::File::create(&model_path)
        .await
        .map_err(|e| format!("无法创建模型文件: {}", e))?;
    
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    
    // 进度事件名称
    let progress_event_name = format!("model-download-progress-{}", model_name);
    
    // 发送初始进度事件（0%）
    let initial_progress = ModelDownloadProgress {
        model_name: model_name.clone(),
        downloaded: 0,
        total: total_size,
        progress: 0.0,
    };
    let _ = app.emit(&progress_event_name, &initial_progress);
    
    let mut last_emitted_progress: f64 = 0.0;
    let mut last_emitted_bytes: u64 = 0;

    use futures_util::StreamExt;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("下载过程中出错: {}", e))?;
        use tokio::io::AsyncWriteExt;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;
        
        // 计算进度
        let progress = if let Some(total) = total_size {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        
        // 发送进度事件（每 0.5% 或每 512KB 发送一次，确保及时更新）
        let should_emit = if let Some(_total) = total_size {
            let progress_diff = progress - last_emitted_progress;
            progress_diff >= 0.5 || (downloaded - last_emitted_bytes) >= 512 * 1024
        } else {
            (downloaded - last_emitted_bytes) >= 512 * 1024
        };
        
        if should_emit {
            let progress_info = ModelDownloadProgress {
                model_name: model_name.clone(),
                downloaded,
                total: total_size,
                progress,
            };
            let _ = app.emit(&progress_event_name, &progress_info);
            last_emitted_progress = progress;
            last_emitted_bytes = downloaded;
        }
        
        eprintln!("下载进度: {:.1}% ({}/{} bytes)", progress, downloaded, total_size.unwrap_or(0));
    }
    
    // 发送完成事件（100%）
    if let Some(total) = total_size {
        let progress_info = ModelDownloadProgress {
            model_name: model_name.clone(),
            downloaded: total,
            total: Some(total),
            progress: 100.0,
        };
        let _ = app.emit(&progress_event_name, &progress_info);
    }

    file.sync_all()
        .await
        .map_err(|e| format!("同步文件失败: {}", e))?;

    eprintln!("模型下载完成: {}", model_path.display());
    Ok(format!("模型 {} 下载成功", model_name))
}

// 删除已下载的模型
#[tauri::command]
async fn delete_model(
    model_name: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let models_dir = app_data_dir.join("whisper_models");
    let model_file_name = format!("ggml-{}.bin", model_name);
    let model_path = models_dir.join(&model_file_name);

    if !model_path.exists() {
        return Err(format!("模型 {} 未下载", model_name));
    }

    tokio::fs::remove_file(&model_path)
        .await
        .map_err(|e| format!("删除模型文件失败: {}", e))?;

    Ok(format!("模型 {} 已删除", model_name))
}

// 命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandExecutionResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

// 执行命令（通用）
#[tauri::command]
async fn execute_command(
    command: String,
    args: Vec<String>,
    event_id: String,
    working_dir: Option<String>,
    app: tauri::AppHandle,
) -> Result<CommandExecutionResult, String> {
    // 构建命令
    let mut cmd = tokio::process::Command::new(&command);
    
    // 添加参数
    for arg in args {
        cmd.arg(arg);
    }
    
    // 设置工作目录（如果提供）
    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }
    
    // 设置 stdout 和 stderr 为管道，以便实时读取
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| format!("无法执行命令 {}: {}", command, e))?;
    
    // 获取 stdout 和 stderr 的句柄
    let stdout = child.stdout.take()
        .ok_or("无法获取 stdout 句柄")?;
    let stderr = child.stderr.take()
        .ok_or("无法获取 stderr 句柄")?;
    
    // 创建事件名称
    let stdout_event_name = format!("cmd-stdout-{}", event_id);
    let stderr_event_name = format!("cmd-stderr-{}", event_id);
    
    // 使用辅助函数并发读取 stdout 和 stderr，实时发送事件
    let stdout_handle = spawn_stream_reader(
        stdout,
        app.clone(),
        stdout_event_name,
        "stdout",
        false, // 启用调试日志
    );
    
    let stderr_handle = spawn_stream_reader(
        stderr,
        app.clone(),
        stderr_event_name,
        "stderr",
        false, // 启用调试日志
    );
    
    // 等待进程完成
    let status = child.wait().await
        .map_err(|e| format!("等待进程完成失败: {}", e))?;
    
    // 获取 stdout 和 stderr 的输出
    let stdout_output = stdout_handle.await
        .map_err(|e| format!("读取 stdout 失败: {}", e))?;
    let stderr_output = stderr_handle.await
        .map_err(|e| format!("读取 stderr 失败: {}", e))?;
    
    // 获取退出码
    let exit_code = status.code();
    let success = status.success();
    
    Ok(CommandExecutionResult {
        exit_code,
        stdout: stdout_output,
        stderr: stderr_output,
        success,
    })
}

// 从视频中提取音频
#[tauri::command]
async fn extract_audio_from_video(
    resource_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 从数据库读取资源
    let mut resource = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let resource_id = resource_id.clone();
        move || {
            let conn = db::init_database(&db_path)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_resource(&conn, &resource_id)
                .map_err(|e| format!("无法读取资源: {}", e))?
                .ok_or_else(|| format!("转写资源不存在: {}", resource_id))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    // 检查资源类型
    match resource.resource_type {
        ResourceType::Audio => {
            return Err("该资源是音频文件，无需提取".to_string());
        }
        ResourceType::Video => {
            // 继续处理
        }
    }
    
    // 检查是否是 URL 资源，URL 资源不需要提取音频（会直接使用 yt-dlp 获取字幕）
    if matches!(resource.source_type, SourceType::Url) || is_url(&resource.file_path) {
        return Err("URL资源无需提取音频，转写任务会直接使用 yt-dlp 获取字幕".to_string());
    }
    
    // 检查是否已经有提取的音频
    if resource.extracted_audio_path.is_some() {
        let audio_path = resource.extracted_audio_path.as_ref().unwrap();
        if PathBuf::from(audio_path).exists() {
            return Ok(format!("音频已提取: {}", audio_path));
        }
    }
    
    // 检查是否正在提取中
    let running_extractions: State<'_, RunningExtractions> = app.state();
    if running_extractions.contains(&resource_id).await {
        return Ok("音频提取正在进行中".to_string());
    }
    
    // 获取 ffmpeg 路径
    let ffmpeg_path = get_ffmpeg_path(&app)?;
    
    // 准备输出文件路径
    let extracted_audio_dir = app_data_dir.join("extracted_audio");
    std::fs::create_dir_all(&extracted_audio_dir)
        .map_err(|e| format!("无法创建提取音频目录: {}", e))?;
    
    let video_path = PathBuf::from(&resource.file_path);
    let output_file_name = format!("{}.wav", resource_id);
    let output_path = extracted_audio_dir.join(&output_file_name);
    
    // 构建 ffmpeg 命令
    // ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav
    // -vn: 不包含视频
    // -acodec pcm_s16le: 音频编码为 PCM 16-bit little-endian
    // -ar 16000: 采样率为 16000 Hz（适合 whisper）
    // -ac 1: 单声道
    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.arg("-i")
        .arg(&video_path)
        .arg("-vn")  // 不包含视频
        .arg("-acodec")
        .arg("pcm_s16le")  // PCM 16-bit little-endian
        .arg("-ar")
        .arg("16000")  // 采样率 16000 Hz
        .arg("-ac")
        .arg("1")  // 单声道
        .arg("-y")  // 覆盖输出文件
        .arg(&output_path);
    
    // 设置 stdout 和 stderr 为管道
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| {
            let err_msg = format!("无法执行 ffmpeg: {}。请确保工具已正确安装。", e);
            eprintln!("{}", err_msg);
            err_msg
        })?;
    
    // 获取 stdout 和 stderr 的句柄
    let stdout = child.stdout.take()
        .ok_or("无法获取 stdout 句柄")?;
    let stderr = child.stderr.take()
        .ok_or("无法获取 stderr 句柄")?;
    
    // 将进程句柄存储到 RunningExtractions 中
    running_extractions.insert(resource_id.clone(), child).await;
    
    // 创建事件名称
    let log_event_name = format!("extraction-log-{}", resource_id);
    
    // 读取 stdout（通常为空，但保留以防万一）
    let stdout_handle = spawn_stream_reader(
        stdout,
        app.clone(),
        log_event_name.clone(),
        "stdout",
        false,
    );
    
    // 读取 stderr 并发送日志事件（ffmpeg 的进度信息在 stderr 中）
    let stderr_handle = spawn_ffmpeg_progress_reader(
        stderr,
        app.clone(),
        log_event_name,
    );
    
    // 等待进程完成
    let running_extractions_clone: State<'_, RunningExtractions> = app.state();
    let status = loop {
        if let Some(child_arc) = running_extractions_clone.get(&resource_id).await {
            let mut child_guard = child_arc.lock().await;
            if let Ok(Some(exit_status)) = child_guard.try_wait() {
                let _ = running_extractions_clone.remove(&resource_id).await;
                break exit_status;
            }
            drop(child_guard);
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        } else {
            break std::process::ExitStatus::from_raw(130);
        }
    };
    
    // 获取输出
    let _stdout_output = stdout_handle.await
        .map_err(|e| format!("读取 stdout 失败: {}", e))?;
    let stderr_output = stderr_handle.await
        .map_err(|e| format!("读取 stderr 失败: {}", e))?;
    
    eprintln!("ffmpeg stdout: {}", _stdout_output);
    eprintln!("ffmpeg stderr: {}", stderr_output);
    eprintln!("ffmpeg 退出码: {:?}", status.code());
    
    if !status.success() {
        let error_msg = if !stderr_output.is_empty() {
            stderr_output.trim().to_string()
        } else {
            format!("ffmpeg 执行失败，退出码: {:?}", status.code())
        };
        
        eprintln!("音频提取失败: {}", error_msg);
        
        return Err(format!("音频提取失败: {}", error_msg));
    }
    
    // 检查输出文件是否存在
    if !output_path.exists() {
        let err_msg = format!("提取完成但未生成输出文件: {}", output_path.display());
        eprintln!("{}", err_msg);
        
        return Err(err_msg);
    }
    
    eprintln!("音频提取成功，输出文件: {}", output_path.display());
    
    // 保存提取的音频路径
    resource.extracted_audio_path = Some(output_path.to_string_lossy().to_string());
    resource.updated_at = Utc::now().to_rfc3339();
    
    let db_path_clone = db_path.clone();
    let resource_clone = resource.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::update_resource(&conn, &resource_clone)
            .map_err(|e| format!("无法更新资源: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(output_path.to_string_lossy().to_string())
}

// 检查文件是否存在
#[tauri::command]
async fn check_file_exists(file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    Ok(path.exists() && path.is_file())
}

// 创建临时字幕文件并返回路径
#[tauri::command]
async fn create_temp_subtitle_file(
    task_id: String,
    vtt_content: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let subtitles_dir = app_data_dir.join("subtitles");
    std::fs::create_dir_all(&subtitles_dir)
        .map_err(|e| format!("无法创建字幕目录: {}", e))?;
    
    let subtitle_file = subtitles_dir.join(format!("{}.vtt", task_id));
    std::fs::write(&subtitle_file, vtt_content)
        .map_err(|e| format!("无法创建字幕文件: {}", e))?;
    
    Ok(subtitle_file.to_string_lossy().to_string())
}

// 获取所有 AI 配置
#[tauri::command]
async fn get_ai_configs(
    app: tauri::AppHandle,
) -> Result<Vec<AIConfig>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::get_all_ai_configs(&conn)
            .map_err(|e| format!("无法从数据库读取 AI 配置: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
}

// 创建 AI 配置
#[tauri::command]
async fn create_ai_config(
    name: String,
    base_url: String,
    api_key: String,
    model: String,
    app: tauri::AppHandle,
) -> Result<AIConfig, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let config = AIConfig {
        id: id.clone(),
        name,
        base_url,
        api_key,
        model,
        created_at: now.clone(),
        updated_at: now,
    };
    
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    let config_clone = config.clone();
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::create_ai_config(&conn, &config_clone)
            .map_err(|e| format!("无法保存 AI 配置到数据库: {}", e))?;
        Ok::<AIConfig, String>(config_clone)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(config)
}

// 更新 AI 配置
#[tauri::command]
async fn update_ai_config(
    id: String,
    name: String,
    base_url: String,
    api_key: String,
    model: String,
    app: tauri::AppHandle,
) -> Result<AIConfig, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 先获取现有配置以获取 created_at
    let id_clone = id.clone();
    let existing_config = tokio::task::spawn_blocking({
        let db_path_clone = db_path.clone();
        move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_ai_config(&conn, &id_clone)
                .map_err(|e| format!("无法从数据库读取 AI 配置: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    let existing_config = existing_config.ok_or("AI 配置不存在")?;
    
    let updated_config = AIConfig {
        id: id.clone(),
        name,
        base_url,
        api_key,
        model,
        created_at: existing_config.created_at,
        updated_at: Utc::now().to_rfc3339(),
    };
    
    let config_clone = updated_config.clone();
    let db_path_clone = db_path.clone();
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::update_ai_config(&conn, &config_clone)
            .map_err(|e| format!("无法更新 AI 配置: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(updated_config)
}

// 删除 AI 配置
#[tauri::command]
async fn delete_ai_config(
    id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::delete_ai_config(&conn, &id)
            .map_err(|e| format!("无法删除 AI 配置: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    Ok(())
}

// 获取所有 MCP 配置
#[tauri::command]
async fn get_mcp_configs(
    app: tauri::AppHandle,
) -> Result<Vec<MCPServerInfo>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    let config = tokio::task::spawn_blocking(move || {
        mcp::load_mcp_config(&config_path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    let mut servers = Vec::new();
    
    // 首先添加默认服务（固定在第一行）
    // 确保默认服务的 enabled 始终为 true
    let mut default_server_info = default_mcp::get_default_server_info();
    default_server_info.config.enabled = Some(true);
    servers.push(default_server_info);
    
        // 然后添加用户配置的服务
    for (name, mut server_config) in config.mcp_servers {
        // 跳过默认服务（如果用户配置中有同名服务，忽略它）
        if name == default_mcp::DEFAULT_MCP_SERVER_NAME {
            continue;
        }
        
        // 如果 enabled 字段不存在，默认为 true
        if server_config.enabled.is_none() {
            server_config.enabled = Some(true);
        }
        
        // 优先使用配置中的 name 字段，如果没有则使用配置键名
        let display_name = server_config.name.as_ref().unwrap_or(&name).clone();
        
        // 测试连接并获取工具列表
        match mcp::test_mcp_connection(&name, &server_config).await {
            Ok(tools) => {
                servers.push(MCPServerInfo {
                    name: display_name,
                    key: Some(name.clone()), // 保存原始键名
                    config: server_config.clone(),
                    status: "connected".to_string(),
                    tools: Some(tools),
                    error: None,
                    is_default: Some(false),
                });
            }
            Err(e) => {
                servers.push(MCPServerInfo {
                    name: display_name,
                    key: Some(name.clone()), // 保存原始键名
                    config: server_config.clone(),
                    status: "error".to_string(),
                    tools: None,
                    error: Some(e),
                    is_default: Some(false),
                });
            }
        }
    }
    
    Ok(servers)
}

// 获取完整的 MCP 配置
#[tauri::command]
async fn get_mcp_config_full(
    app: tauri::AppHandle,
) -> Result<MCPConfig, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || {
        mcp::load_mcp_config(&config_path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)
}

// 保存 MCP 配置（添加或更新单个服务器）
#[tauri::command]
async fn save_mcp_config(
    server_name: String,
    server_config: MCPServerConfig,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    tokio::task::spawn_blocking({
        let config_path_clone = config_path.clone();
        move || {
            let mut config = mcp::load_mcp_config(&config_path_clone)?;
            config.mcp_servers.insert(server_name, server_config);
            mcp::save_mcp_config(&config_path_clone, &config)
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 保存整个 MCP 配置
#[tauri::command]
async fn save_mcp_config_full(
    config: MCPConfig,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    tokio::task::spawn_blocking({
        let config_path_clone = config_path.clone();
        move || {
            mcp::save_mcp_config(&config_path_clone, &config)
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 删除 MCP 配置
#[tauri::command]
async fn delete_mcp_config(
    server_name: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 获取所有服务器信息，检查是否是默认服务
    let servers = get_mcp_configs(app.clone()).await?;
    let server_info = servers.iter().find(|s| {
        s.key.as_ref().map(|k| k == &server_name).unwrap_or(false)
            || s.name == server_name
    });
    
    // 防止删除默认服务
    if let Some(server) = server_info {
        if server.is_default == Some(true) {
            return Err("无法删除系统默认服务".to_string());
        }
    }
    
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    tokio::task::spawn_blocking({
        let config_path_clone = config_path.clone();
        move || {
            let mut config = mcp::load_mcp_config(&config_path_clone)?;
            config.mcp_servers.shift_remove(&server_name);
            mcp::save_mcp_config(&config_path_clone, &config)
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 更新 MCP 配置的 enabled 状态
#[tauri::command]
async fn update_mcp_enabled(
    server_name: String,
    enabled: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 获取所有服务器信息，检查是否是默认服务
    let servers = get_mcp_configs(app.clone()).await?;
    let server_info = servers.iter().find(|s| {
        s.key.as_ref().map(|k| k == &server_name).unwrap_or(false)
            || s.name == server_name
    });
    
    // 防止修改默认服务的 enabled 状态
    if let Some(server) = server_info {
        if server.is_default == Some(true) {
            return Err("无法修改系统默认服务的启用状态".to_string());
        }
    }
    
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    tokio::task::spawn_blocking({
        let config_path_clone = config_path.clone();
        move || {
            let mut config = mcp::load_mcp_config(&config_path_clone)?;
            if let Some(server_config) = config.mcp_servers.get_mut(&server_name) {
                server_config.enabled = Some(enabled);
                mcp::save_mcp_config(&config_path_clone, &config)
            } else {
                Err(format!("MCP 服务器 {} 不存在", server_name))
            }
        }
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 测试 MCP 连接并获取工具列表
#[tauri::command]
async fn test_mcp_connection(
    server_name: String,
    server_config: MCPServerConfig,
) -> Result<MCPServerInfo, String> {
    // 优先使用配置中的 name 字段，如果没有则使用 server_name
    let display_name = server_config.name.as_ref().unwrap_or(&server_name).clone();
    
    match mcp::test_mcp_connection(&server_name, &server_config).await {
        Ok(tools) => Ok(MCPServerInfo {
            name: display_name,
            key: Some(server_name.clone()), // 保存原始键名
            config: server_config,
            status: "connected".to_string(),
            tools: Some(tools),
            error: None,
            is_default: Some(false),
        }),
        Err(e) => Ok(MCPServerInfo {
            name: display_name,
            key: Some(server_name.clone()), // 保存原始键名
            config: server_config,
            status: "error".to_string(),
            tools: None,
            error: Some(e),
            is_default: Some(false),
        }),
    }
}

// AI 流式对话
#[tauri::command]
async fn chat_completion(
    config_id: String,
    messages: Vec<ai::ChatMessage>,
    tools: Option<Vec<MCPTool>>,
    system_message: Option<String>,
    event_id: Option<String>,
    app: tauri::AppHandle,
    streams: State<'_, RunningStreams>,
) -> Result<String, String> {
    // 获取 AI 配置
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let ai_config = tokio::task::spawn_blocking({
        let db_path_clone = db_path.clone();
        let config_id_clone = config_id.clone();
        move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_ai_config(&conn, &config_id_clone)
                .map_err(|e| format!("无法从数据库读取 AI 配置: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    let ai_config = ai_config.ok_or("AI 配置不存在")?;
    
    // 构建消息列表（添加 system message）
    let mut chat_messages = Vec::new();
    if let Some(system_msg) = system_message {
        chat_messages.push(ai::ChatMessage {
            role: "system".to_string(),
            content: Some(system_msg),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        });
    }
    chat_messages.extend(messages);
    
    // 转换 MCP 工具为 OpenAI 工具
    let openai_tools = if let Some(mcp_tools) = tools {
        Some(
            mcp_tools
                .iter()
                .map(ai::mcp_tool_to_openai_tool)
                .collect(),
        )
    } else {
        None
    };
    
    // 构建请求
    let request = ai::ChatCompletionRequest {
        model: ai_config.model.clone(),
        messages: chat_messages.clone(),
        tools: openai_tools.clone(),
        tool_choice: Some("auto".to_string()),
        stream: true,
        temperature: Some(0.7),
    };
    
    eprintln!("[AI Stream] 准备发送请求");
    eprintln!("[AI Stream] URL: {}", ai::build_chat_url(&ai_config.base_url));
    eprintln!("[AI Stream] Model: {}", ai_config.model);
    eprintln!("[AI Stream] Messages 数量: {}", chat_messages.len());
    eprintln!("[AI Stream] Tools 数量: {}", openai_tools.as_ref().map(|t| t.len()).unwrap_or(0));
    eprintln!("[AI Stream] Request JSON: {}", serde_json::to_string(&request).unwrap_or_default());
    
    // 构建 URL
    let url = ai::build_chat_url(&ai_config.base_url);
    
    // 创建 HTTP 客户端
    let client = reqwest::Client::new();
    
    // 发送请求
    eprintln!("[AI Stream] 发送 HTTP POST 请求到: {}", url);
    eprintln!("[AI Stream] Base URL: {}", ai_config.base_url);
    eprintln!("[AI Stream] API Key 前缀: {}", if ai_config.api_key.len() > 10 { &ai_config.api_key[..10] } else { "too short" });
    
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", ai_config.api_key))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[AI Stream] 发送请求失败: {}", e);
            format!("发送请求失败: {}", e)
        })?;
    
    eprintln!("[AI Stream] 收到响应，状态码: {}", response.status());
    eprintln!("[AI Stream] 响应头: {:#?}", response.headers());
    
    // 检查响应状态
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        eprintln!("[AI Stream] 响应失败，状态码: {}, 错误内容: {}", status, error_text);
        eprintln!("[AI Stream] 使用的 URL: {}", url);
        eprintln!("[AI Stream] 请检查 base_url 配置是否正确，应该是类似 https://api.openai.com/v1 的格式");
        return Err(format!("AI API 返回错误: {} - {}\n使用的 URL: {}", status, error_text, url));
    }
    
    // 生成事件 ID（如果未提供，则生成新的）
    let event_id = event_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let event_name = format!("ai-chat-stream-{}", event_id);
    let event_id_clone = event_id.clone();
    
    // 读取流式响应
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut current_tool_calls: HashMap<u32, ai::ToolCallChunk> = HashMap::new();
    
    use futures_util::StreamExt;
    
    // 在后台任务中处理流
    let app_clone = app.clone();
    let event_name_clone = event_name.clone();
    let streams_clone = streams.inner().clone();
    let handle = tokio::spawn(async move {
        eprintln!("[AI Stream] 开始接收流式响应，事件 ID: {}", event_id_clone);
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    let text = String::from_utf8_lossy(chunk.as_ref());
                    eprintln!("[AI Stream] 收到原始数据块: {}", text);
                    buffer.push_str(&text);
                    
                    // 按行处理 SSE 数据
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();
                        
                        eprintln!("[AI Stream] 处理行: {}", line);
                        
                        if line.starts_with("data: ") {
                            let data = &line[6..];
                            eprintln!("[AI Stream] SSE 数据: {}", data);
                            
                            if data == "[DONE]" {
                                // 流结束
                                eprintln!("[AI Stream] 收到 [DONE]，流结束");
                                eprintln!("[AI Stream] 发送完成事件，事件名称: {}", event_name_clone);
                                let emit_result = app_clone.emit(&event_name_clone, &json!({
                                    "type": "done",
                                    "event_id": event_id_clone
                                }));
                                if let Err(e) = emit_result {
                                    eprintln!("[AI Stream] 发送完成事件失败: {}", e);
                                } else {
                                    eprintln!("[AI Stream] 完成事件发送成功");
                                }
                                // 清理流式任务
                                streams_clone.remove(&event_id_clone).await;
                                return;
                            }
                            
                            // 解析 JSON
                            match serde_json::from_str::<ai::ChatCompletionChunk>(data) {
                                Ok(chunk_data) => {
                                    eprintln!("[AI Stream] 解析成功，chunk: {:#?}", chunk_data);
                                    if let Some(choice) = chunk_data.choices.first() {
                                        let delta = &choice.delta;
                                        
                                        // 处理内容增量
                                        if let Some(content) = &delta.content {
                                            eprintln!("[AI Stream] 发送内容: {}", content);
                                            eprintln!("[AI Stream] 事件名称: {}", event_name_clone);
                                            let emit_result = app_clone.emit(&event_name_clone, &json!({
                                                "type": "content",
                                                "content": content,
                                                "event_id": event_id_clone
                                            }));
                                            if let Err(e) = emit_result {
                                                eprintln!("[AI Stream] 发送事件失败: {}", e);
                                            } else {
                                                eprintln!("[AI Stream] 事件发送成功");
                                            }
                                        }
                                        
                                        // 处理 thinking/reasoning 内容
                                        if let Some(reasoning) = &delta.reasoning {
                                            eprintln!("[AI Stream] 发送 reasoning: {}", reasoning);
                                            let emit_result = app_clone.emit(&event_name_clone, &json!({
                                                "type": "reasoning",
                                                "content": reasoning,
                                                "event_id": event_id_clone
                                            }));
                                            if let Err(e) = emit_result {
                                                eprintln!("[AI Stream] 发送 reasoning 事件失败: {}", e);
                                            }
                                        }
                                        
                                        // 处理工具调用
                                        if let Some(tool_calls) = &delta.tool_calls {
                                            eprintln!("[AI Stream] 收到工具调用增量: {:#?}", tool_calls);
                                            for tool_call_chunk in tool_calls {
                                                if let Some(index) = tool_call_chunk.index {
                                                    let tool_call = current_tool_calls
                                                        .entry(index)
                                                        .or_insert_with(|| ai::ToolCallChunk {
                                                            index: Some(index),
                                                            id: None,
                                                            call_type: None,
                                                            function: None,
                                                        });
                                                    
                                                    if let Some(id) = &tool_call_chunk.id {
                                                        tool_call.id = Some(id.clone());
                                                    }
                                                    if let Some(call_type) = &tool_call_chunk.call_type {
                                                        tool_call.call_type = Some(call_type.clone());
                                                    }
                                                    if let Some(function) = &tool_call_chunk.function {
                                                        let func = tool_call.function.get_or_insert_with(|| ai::FunctionCallChunk {
                                                            name: None,
                                                            arguments: None,
                                                        });
                                                        if let Some(name) = &function.name {
                                                            func.name = Some(name.clone());
                                                        }
                                                        if let Some(args) = &function.arguments {
                                                            func.arguments = Some(
                                                                func.arguments.as_ref()
                                                                    .map(|a| format!("{}{}", a, args))
                                                                    .unwrap_or_else(|| args.clone())
                                                            );
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                
                                        // 如果完成，发送工具调用
                                        if let Some(finish_reason) = &choice.finish_reason {
                                            eprintln!("[AI Stream] finish_reason: {}", finish_reason);
                                            if finish_reason == "tool_calls" && !current_tool_calls.is_empty() {
                                                eprintln!("[AI Stream] 发送完整工具调用，数量: {}", current_tool_calls.len());
                                                let tool_calls: Vec<serde_json::Value> = current_tool_calls
                                                    .values()
                                                    .map(|tc| {
                                                        json!({
                                                            "id": tc.id.as_ref().unwrap_or(&"".to_string()),
                                                            "type": tc.call_type.as_ref().unwrap_or(&"function".to_string()),
                                                            "function": {
                                                                "name": tc.function.as_ref()
                                                                    .and_then(|f| f.name.as_ref())
                                                                    .unwrap_or(&"".to_string()),
                                                                "arguments": tc.function.as_ref()
                                                                    .and_then(|f| f.arguments.as_ref())
                                                                    .unwrap_or(&"".to_string()),
                                                            }
                                                        })
                                                    })
                                                    .collect();
                                                
                                                eprintln!("[AI Stream] 工具调用 JSON: {}", serde_json::to_string(&tool_calls).unwrap_or_default());
                                                eprintln!("[AI Stream] 发送工具调用事件，事件名称: {}", event_name_clone);
                                                let emit_result = app_clone.emit(&event_name_clone, &json!({
                                                    "type": "tool_calls",
                                                    "tool_calls": tool_calls,
                                                    "event_id": event_id_clone
                                                }));
                                                if let Err(e) = emit_result {
                                                    eprintln!("[AI Stream] 发送工具调用事件失败: {}", e);
                                                } else {
                                                    eprintln!("[AI Stream] 工具调用事件发送成功");
                                                }
                                                current_tool_calls.clear();
                                            } else if finish_reason != "tool_calls" {
                                                // 正常完成
                                                eprintln!("[AI Stream] 正常完成，finish_reason: {}", finish_reason);
                                                eprintln!("[AI Stream] 发送完成事件，事件名称: {}", event_name_clone);
                                                let emit_result = app_clone.emit(&event_name_clone, &json!({
                                                    "type": "done",
                                                    "event_id": event_id_clone
                                                }));
                                                if let Err(e) = emit_result {
                                                    eprintln!("[AI Stream] 发送完成事件失败: {}", e);
                                                } else {
                                                    eprintln!("[AI Stream] 完成事件发送成功");
                                                }
                                                // 清理流式任务
                                                streams_clone.remove(&event_id_clone).await;
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[AI Stream] JSON 解析失败: {}, 原始数据: {}", e, data);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[AI Stream] 读取数据块失败: {}", e);
                }
            }
        }
        eprintln!("[AI Stream] 流处理结束");
        // 清理流式任务
        streams_clone.remove(&event_id_clone).await;
    });
    
    // 存储 AbortHandle 以便可以停止任务
    streams.insert(event_id.clone(), handle.abort_handle()).await;
    
    Ok(event_id)
}

// 停止 AI 流式对话
#[tauri::command]
async fn stop_chat_completion(
    event_id: String,
    streams: State<'_, RunningStreams>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    eprintln!("[AI Stream] 收到停止请求，事件 ID: {}", event_id);
    
    // 停止流式任务
    if streams.abort(&event_id).await {
        eprintln!("[AI Stream] 已停止流式任务: {}", event_id);
        
        // 发送停止完成事件
        let event_name = format!("ai-chat-stream-{}", event_id);
        let _ = app.emit(&event_name, &json!({
            "type": "stopped",
            "event_id": event_id
        }));
        
        Ok(())
    } else {
        eprintln!("[AI Stream] 未找到流式任务: {}", event_id);
        Err("未找到指定的流式任务".to_string())
    }
}

// 执行 MCP 工具调用
#[tauri::command]
async fn execute_mcp_tool_call(
    server_name: String,
    tool_name: String,
    arguments: serde_json::Value,
    app: tauri::AppHandle,
    current_resource_id: Option<String>,
    current_task_id: Option<String>,
) -> Result<serde_json::Value, String> {
    // 获取所有服务器信息，检查是否是默认服务
    let servers = get_mcp_configs(app.clone()).await?;
    
    // 查找对应的服务器
    let server_info = servers.iter().find(|s| {
        s.key.as_ref().map(|k| k == &server_name).unwrap_or(false)
            || s.name == server_name
    });
    
    // 如果是默认服务，直接调用默认工具
    if let Some(server) = server_info {
        if server.is_default == Some(true) {
            return default_mcp::call_default_tool(
                &tool_name,
                arguments,
                app,
                current_resource_id,
                current_task_id,
            )
            .await;
        }
    }
    
    // 获取 MCP 配置
    let app_data_dir = get_app_data_dir(&app)?;
    let config_path = mcp::get_mcp_config_path(&app_data_dir);
    
    let config = tokio::task::spawn_blocking(move || {
        mcp::load_mcp_config(&config_path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
    .map_err(|e| e)?;
    
    let server_config = config.mcp_servers.get(&server_name)
        .ok_or_else(|| format!("MCP 服务器 {} 不存在", server_name))?;
    
    // 检查是否是 HTTP 传输（支持两种格式）
    let http_url = if let Some(transport_value) = &server_config.transport {
        if let Some(transport_obj) = transport_value.as_object() {
            if let Some(transport_type) = transport_obj.get("type").and_then(|v| v.as_str()) {
                if transport_type == "http" {
                    transport_obj.get("url").and_then(|v| v.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    } else if let Some(url) = &server_config.url {
        // Cursor 兼容格式
        Some(url.clone())
    } else {
        None
    };
    
    if let Some(url) = http_url {
        // HTTP 传输：通过 HTTP API 调用工具
        let client = reqwest::Client::new();
        
        // 构建工具调用请求
        let tool_call_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        });
        
        let response = client
            .post(&url)
            .json(&tool_call_request)
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败: {}", e))?;
        
        let result: serde_json::Value = response.json().await
            .map_err(|e| format!("解析响应失败: {}", e))?;
        
        // 提取结果
        if let Some(result_obj) = result.get("result") {
            if let Some(content) = result_obj.get("content") {
                return Ok(content.clone());
            }
            return Ok(result_obj.clone());
        }
        
        if let Some(error) = result.get("error") {
            return Err(format!("工具调用失败: {}", error));
        }
        
        return Ok(result);
    }
    
    // stdio 传输：启动 MCP 服务器并调用工具
    let command = server_config.command.as_ref()
        .ok_or_else(|| format!("stdio 传输需要 command 字段，或 HTTP 传输需要 transport 或 url 字段"))?;
    
    let mut cmd = tokio::process::Command::new(command);
    
    if let Some(args) = &server_config.args {
        for arg in args {
            cmd.arg(arg);
        }
    }
    
    if let Some(env) = &server_config.env {
        for (key, value) in env {
            cmd.env(key, value);
        }
    }
    
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    let mut child = cmd.spawn()
        .map_err(|e| format!("无法启动 MCP 服务器: {}", e))?;
    
    let mut stdin = child.stdin.take().ok_or("无法获取 stdin")?;
    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    
    // 发送 initialize 请求
    let init_request = json!({
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
    
    use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
    let mut writer = tokio::io::BufWriter::new(&mut stdin);
    writer.write_all(format!("{}\n", serde_json::to_string(&init_request).unwrap()).as_bytes()).await
        .map_err(|e| format!("无法发送初始化请求: {}", e))?;
    writer.flush().await.map_err(|e| format!("无法刷新 stdin: {}", e))?;
    
    // 读取初始化响应
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let timeout = tokio::time::Duration::from_secs(5);
    let _ = tokio::time::timeout(timeout, reader.read_line(&mut line)).await;
    
    // 发送 initialized 通知
    let initialized_notification = json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    });
    writer.write_all(format!("{}\n", serde_json::to_string(&initialized_notification).unwrap()).as_bytes()).await
        .map_err(|e| format!("无法发送 initialized 通知: {}", e))?;
    writer.flush().await.map_err(|e| format!("无法刷新 stdin: {}", e))?;
    
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // 调用工具
    let call_request = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    });
    
    writer.write_all(format!("{}\n", serde_json::to_string(&call_request).unwrap()).as_bytes()).await
        .map_err(|e| format!("无法发送工具调用请求: {}", e))?;
    writer.flush().await.map_err(|e| format!("无法刷新 stdin: {}", e))?;
    
    // 读取响应
    let mut response_line = String::new();
    let response_result = tokio::time::timeout(timeout, reader.read_line(&mut response_line)).await
        .map_err(|_| "读取工具调用响应超时")?;
    
    response_result.map_err(|e| format!("读取响应失败: {}", e))?;
    
    drop(writer);
    
    // 解析响应
    let response: serde_json::Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("无法解析响应: {}", e))?;
    
    if let Some(error) = response.get("error") {
        return Err(format!("工具调用失败: {}", error));
    }
    
    if let Some(result) = response.get("result") {
        Ok(result.clone())
    } else {
        Err("响应中没有结果".to_string())
    }
}

// 创建新 chat
#[tauri::command]
async fn create_chat(
    title: String,
    app: tauri::AppHandle,
) -> Result<Chat, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let chat = tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let chat_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        let chat = Chat {
            id: chat_id.clone(),
            title: if title.is_empty() { "新话题".to_string() } else { title },
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        
        db::create_chat(&conn, &chat)
            .map_err(|e| format!("无法创建 chat: {}", e))?;
        
        Ok(chat)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?;
    
    chat
}

// 获取所有 chats（包含最后消息时间）
#[tauri::command]
async fn get_all_chats(
    app: tauri::AppHandle,
) -> Result<Vec<ChatListItem>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let chats = tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let all_chats = db::get_all_chats(&conn)
            .map_err(|e| format!("无法获取 chats: {}", e))?;
        
        let mut chat_items = Vec::new();
        for chat in all_chats {
            let last_message = db::get_last_message_by_chat(&conn, &chat.id)
                .map_err(|e| format!("无法获取最后消息: {}", e))?;
            
            let message_count = db::get_message_count_by_chat(&conn, &chat.id)
                .map_err(|e| format!("无法获取消息数量: {}", e))?;
            
            chat_items.push(ChatListItem {
                id: chat.id,
                title: chat.title,
                created_at: chat.created_at,
                updated_at: chat.updated_at,
                last_message_at: last_message.map(|m| m.created_at),
                message_count,
            });
        }
        
        Ok(chat_items)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?;
    
    chats
}

// 获取单个 chat
#[tauri::command]
async fn get_chat(
    chat_id: String,
    app: tauri::AppHandle,
) -> Result<Option<Chat>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let chat = tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::get_chat(&conn, &chat_id)
            .map_err(|e| format!("无法获取 chat: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?;
    
    chat
}

// 更新 chat 标题
#[tauri::command]
async fn update_chat_title(
    chat_id: String,
    title: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let mut chat = db::get_chat(&conn, &chat_id)
            .map_err(|e| format!("无法获取 chat: {}", e))?
            .ok_or_else(|| "Chat 不存在".to_string())?;
        
        chat.title = title;
        chat.updated_at = Utc::now().to_rfc3339();
        
        db::update_chat(&conn, &chat)
            .map_err(|e| format!("无法更新 chat: {}", e))?;
        
        Ok(())
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 使用 AI 总结 chat 标题
#[tauri::command]
async fn summarize_chat_title(
    chat_id: String,
    config_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    // 获取 chat 的所有 messages
    let messages = tokio::task::spawn_blocking({
        let db_path_clone = db_path.clone();
        let chat_id_clone = chat_id.clone();
        move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            db::get_messages_by_chat(&conn, &chat_id_clone)
                .map_err(|e| format!("无法获取 messages: {}", e))
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    if messages.is_empty() {
        return Err("Chat 中没有消息，无法生成标题".to_string());
    }
    
    // 获取 AI 配置
    let ai_config = tokio::task::spawn_blocking({
        let db_path_clone = db_path.clone();
        let config_id_clone = config_id.clone();
        move || {
            let conn = db::init_database(&db_path_clone)
                .map_err(|e| format!("无法初始化数据库: {}", e))?;
            
            // 如果提供了 config_id，使用它；否则使用第一个配置
            if let Some(cid) = config_id_clone {
                db::get_ai_config(&conn, &cid)
                    .map_err(|e| format!("无法从数据库读取 AI 配置: {}", e))
            } else {
                let configs = db::get_all_ai_configs(&conn)
                    .map_err(|e| format!("无法获取 AI 配置列表: {}", e))?;
                if configs.is_empty() {
                    Err("没有可用的 AI 配置".to_string())
                } else {
                    Ok(Some(configs[0].clone()))
                }
            }
        }
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))??;
    
    let ai_config = ai_config.ok_or("AI 配置不存在")?;
    
    // 构建消息列表：只包含 user 和 assistant 消息，用于总结
    let mut chat_messages: Vec<ai::ChatMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| ai::ChatMessage {
            role: m.role.clone(),
            content: Some(m.content.clone()),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        })
        .collect();
    
    // 限制消息数量，避免请求过长（最多取前 10 条消息）
    if chat_messages.len() > 10 {
        chat_messages = chat_messages[..10].to_vec();
    }
    
    // 添加 system message，要求生成简短标题
    let system_message = ai::ChatMessage {
        role: "system".to_string(),
        content: Some("请根据以下对话内容，生成一个简洁的标题，纯文本，不超过 20 个字符。只返回标题，不要包含其他内容，不包含emoji。".to_string()),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    };
    
    let mut all_messages = vec![system_message];
    all_messages.extend(chat_messages);
    
    // 构建非流式请求
    let request = ai::ChatCompletionRequest {
        model: ai_config.model.clone(),
        messages: all_messages,
        tools: None,
        tool_choice: None,
        stream: false,
        temperature: Some(0.3), // 使用较低的温度以获得更稳定的标题
    };
    
    // 构建 URL
    let url = ai::build_chat_url(&ai_config.base_url);
    
    // 创建 HTTP 客户端
    let client = reqwest::Client::new();
    
    // 发送请求
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", ai_config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("发送请求失败: {}", e))?;
    
    // 检查响应状态
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("AI API 返回错误: {} - {}", status, error_text));
    }
    
    // 解析响应
    let completion_response: ai::ChatCompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    // 提取标题
    let title = completion_response
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_ref())
        .map(|content| content.trim().to_string())
        .ok_or("AI 响应中没有内容")?;
    
    // 限制标题长度
    let title = if title.len() > 50 {
        title.chars().take(50).collect::<String>() + "..."
    } else {
        title
    };
    
    // 更新 chat 标题
    let db_path_clone = db_path.clone();
    let chat_id_clone = chat_id.clone();
    let title_clone = title.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = db::init_database(&db_path_clone)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let mut chat = db::get_chat(&conn, &chat_id_clone)
            .map_err(|e| format!("无法获取 chat: {}", e))?
            .ok_or_else(|| "Chat 不存在".to_string())?;
        
        chat.title = title_clone;
        chat.updated_at = Utc::now().to_rfc3339();
        
        db::update_chat(&conn, &chat)
            .map_err(|e| format!("无法更新 chat: {}", e))?;
        
        Ok(())
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(title)
}

// 删除 chat
#[tauri::command]
async fn delete_chat(
    chat_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::delete_chat(&conn, &chat_id)
            .map_err(|e| format!("无法删除 chat: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?
    .map_err(|e| e)?;
    
    Ok(())
}

// 获取 chat 的所有 messages
#[tauri::command]
async fn get_messages_by_chat(
    chat_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Message>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let messages = tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        db::get_messages_by_chat(&conn, &chat_id)
            .map_err(|e| format!("无法获取 messages: {}", e))
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?;
    
    messages
}

// 保存 message
#[tauri::command]
async fn save_message(
    chat_id: String,
    role: String,
    content: String,
    tool_calls: Option<String>,
    tool_call_id: Option<String>,
    name: Option<String>,
    reasoning: Option<String>,
    app: tauri::AppHandle,
) -> Result<Message, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let db_path = db::get_db_path(&app_data_dir);
    
    let message = tokio::task::spawn_blocking(move || {
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        let message_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        let message = Message {
            id: message_id.clone(),
            chat_id: chat_id.clone(),
            role,
            content,
            tool_calls,
            tool_call_id,
            name,
            reasoning,
            created_at: now.clone(),
        };
        
        db::create_message(&conn, &message)
            .map_err(|e| format!("无法保存 message: {}", e))?;
        
        // 更新 chat 的 updated_at
        if let Ok(Some(mut chat)) = db::get_chat(&conn, &chat_id) {
            chat.updated_at = now;
            let _ = db::update_chat(&conn, &chat);
        }
        
        Ok(message)
    })
    .await
    .map_err(|e| format!("数据库操作失败: {}", e))?;
    
    message
}

// 从URL下载字幕（使用yt-dlp）- 内部函数，支持实时日志
async fn download_subtitle_from_url_internal(
    url: String,
    app: tauri::AppHandle,
    task_id: Option<String>,
) -> Result<String, String> {
    // 获取 yt-dlp 路径
    let ytdlp_path = get_ytdlp_path(&app)?;
    
    // 获取应用数据目录
    let app_data_dir = get_app_data_dir(&app)?;
    let subtitles_dir = app_data_dir.join("subtitles");
    std::fs::create_dir_all(&subtitles_dir)
        .map_err(|e| format!("无法创建字幕目录: {}", e))?;
    
    // 生成临时文件名
    let subtitle_id = Uuid::new_v4().to_string();
    let srt_file_path = subtitles_dir.join(format!("{}.srt", subtitle_id));
    
    // 构建 yt-dlp 命令
    // yt-dlp --skip-download --write-auto-sub --all-subs --convert-subs srt -o output.srt URL
    // 注意：--write-auto-sub 下载自动生成的字幕，--all-subs 下载所有可用字幕，--convert-subs srt 转换为 SRT 格式
    let mut cmd = tokio::process::Command::new(&ytdlp_path);
    cmd.arg("--skip-download")  // 跳过视频下载
        .arg("--write-auto-sub")  // 写入自动生成的字幕
        .arg("--all-subs")  // 下载所有可用的字幕（包括手动和自动）
        .arg("--convert-subs")  // 转换字幕格式
        .arg("srt")  // 转换为 SRT 格式
        .arg("-o")  // 输出文件
        .arg(&srt_file_path)
        .arg(&url);
    
    // 设置 stdout 和 stderr 为管道
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    
    // 如果有 task_id，实时发送日志
    if let Some(ref task_id) = task_id {
        let stdout_event_name = format!("transcription-stdout-{}", task_id);
        let stderr_event_name = format!("transcription-stderr-{}", task_id);
        
        // 发送开始消息
        let _ = app.emit(&stdout_event_name, "开始使用 yt-dlp 下载字幕...\n");
        
        // 启动进程
        let mut child = cmd.spawn()
            .map_err(|e| format!("无法执行 yt-dlp: {}。请确保 yt-dlp 已正确安装。", e))?;
        
        // 获取 stdout 和 stderr 的句柄
        let stdout = child.stdout.take()
            .ok_or("无法获取 stdout 句柄")?;
        let stderr = child.stderr.take()
            .ok_or("无法获取 stderr 句柄")?;
        
        // 使用辅助函数并发读取 stdout 和 stderr，实时发送事件
        let stdout_handle = spawn_stream_reader(
            stdout,
            app.clone(),
            stdout_event_name.clone(),
            "stdout",
            false, // 不启用调试日志
        );
        
        let stderr_handle = spawn_stream_reader(
            stderr,
            app.clone(),
            stderr_event_name.clone(),
            "stderr",
            false, // 不启用调试日志
        );
        
        // 等待进程完成
        let status = child.wait().await
            .map_err(|e| format!("等待 yt-dlp 进程失败: {}", e))?;
        
        // 获取 stdout 和 stderr 的输出
        let stdout_output = stdout_handle.await
            .map_err(|e| format!("读取 stdout 失败: {}", e))?;
        let stderr_output = stderr_handle.await
            .map_err(|e| format!("读取 stderr 失败: {}", e))?;
        
        let stderr = stderr_output;
        let stdout = stdout_output;
        
        // 检查文件是否存在（可能是 .srt 或 .vtt 格式）
        let mut found_file: Option<PathBuf> = None;
        
        // 首先检查预期的文件路径
        if srt_file_path.exists() {
            found_file = Some(srt_file_path.clone());
        } else {
            // 尝试查找生成的文件（yt-dlp 可能会修改文件名，可能是 .srt 或 .vtt）
            // yt-dlp 可能生成类似 "xxx.srt.zh-Hans.vtt" 的文件名
            if let Ok(entries) = std::fs::read_dir(&subtitles_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    
                    // 检查文件名是否以 subtitle_id 开头
                    if file_name.starts_with(&subtitle_id) {
                        // 检查是否是字幕文件（.srt 或 .vtt 扩展名，或文件名中包含这些扩展名）
                        let file_name_lower = file_name.to_lowercase();
                        if file_name_lower.ends_with(".srt") || 
                           file_name_lower.ends_with(".vtt") ||
                           file_name_lower.contains(".srt") ||
                           file_name_lower.contains(".vtt") {
                            found_file = Some(path);
                            break;
                        }
                    }
                }
            }
        }
        
        // 如果找到了字幕文件，即使有错误也认为成功
        if found_file.is_some() {
            // 文件已生成，继续处理
            let _ = app.emit(&stdout_event_name, "字幕文件下载成功\n");
        } else if !status.success() {
            // 如果命令失败且没有找到文件，才返回错误
            return Err(format!("yt-dlp 执行失败且未找到字幕文件: {}\n{}", stderr, stdout));
        }
        
        // 使用找到的文件（如果之前找到了）
        if found_file.is_none() {
            found_file = Some(srt_file_path.clone());
        }
        
        if let Some(file) = found_file {
            // 检查是否是 VTT 格式（文件名包含 .vtt）
            let file_path_str = file.to_string_lossy().to_string();
            let file_name_lower = file_path_str.to_lowercase();
            if file_name_lower.ends_with(".vtt") || file_name_lower.contains(".vtt") {
                // 将 VTT 转换为 SRT
                let _ = app.emit(&stdout_event_name, "检测到 VTT 格式，正在转换为 SRT...\n");
                let srt_path = convert_vtt_to_srt(&file)?;
                let _ = app.emit(&stdout_event_name, "VTT 转换完成\n");
                return Ok(srt_path);
            } else {
                return Ok(file_path_str);
            }
        } else {
            return Err("字幕文件未生成。可能该视频没有字幕，或 yt-dlp 无法访问该视频。".to_string());
        }
    } else {
        // 没有 task_id，使用原来的同步方式
        // 执行命令
        let output = cmd.output().await
            .map_err(|e| format!("无法执行 yt-dlp: {}。请确保 yt-dlp 已正确安装。", e))?;
        
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        
        // 即使 yt-dlp 返回非零退出码，也可能已经成功下载了字幕
        // 先检查文件是否存在，如果文件存在，就认为成功
        // 检查文件是否存在（可能是 .srt 或 .vtt 格式）
        let mut found_file: Option<PathBuf> = None;
        
        // 首先检查预期的文件路径
        if srt_file_path.exists() {
            found_file = Some(srt_file_path.clone());
        } else {
            // 尝试查找生成的文件（yt-dlp 可能会修改文件名，可能是 .srt 或 .vtt）
            // yt-dlp 可能生成类似 "xxx.srt.zh-Hans.vtt" 的文件名
            if let Ok(entries) = std::fs::read_dir(&subtitles_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    
                    // 检查文件名是否以 subtitle_id 开头
                    if file_name.starts_with(&subtitle_id) {
                        // 检查是否是字幕文件（.srt 或 .vtt 扩展名，或文件名中包含这些扩展名）
                        let file_name_lower = file_name.to_lowercase();
                        if file_name_lower.ends_with(".srt") || 
                           file_name_lower.ends_with(".vtt") ||
                           file_name_lower.contains(".srt") ||
                           file_name_lower.contains(".vtt") {
                            found_file = Some(path);
                            break;
                        }
                    }
                }
            }
        }
        
        // 如果找到了字幕文件，即使有错误也认为成功
        if found_file.is_some() {
            // 文件已生成，继续处理
        } else if !output.status.success() {
            // 如果命令失败且没有找到文件，才返回错误
            return Err(format!("yt-dlp 执行失败且未找到字幕文件: {}\n{}", stderr, stdout));
        }
        
        // 使用找到的文件（如果之前找到了）
        if found_file.is_none() {
            found_file = Some(srt_file_path.clone());
        }
        
        if let Some(file) = found_file {
            // 检查是否是 VTT 格式（文件名包含 .vtt）
            let file_path_str = file.to_string_lossy().to_string();
            let file_name_lower = file_path_str.to_lowercase();
            if file_name_lower.ends_with(".vtt") || file_name_lower.contains(".vtt") {
                // 将 VTT 转换为 SRT
                let srt_path = convert_vtt_to_srt(&file)?;
                return Ok(srt_path);
            } else {
                return Ok(file_path_str);
            }
        } else {
            return Err("字幕文件未生成。可能该视频没有字幕，或 yt-dlp 无法访问该视频。".to_string());
        }
    }
}

// 从URL下载字幕（使用yt-dlp）- 公开的 Tauri 命令
#[tauri::command]
async fn download_subtitle_from_url(
    url: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    download_subtitle_from_url_internal(url, app, None).await
}

// 将时间戳转换为秒数（浮点数），支持 SRT (HH:MM:SS,mmm) 和 VTT (HH:MM:SS.mmm) 格式
fn subtitle_time_to_seconds(time_str: &str) -> Result<f64, String> {
    // 支持两种格式：
    // SRT格式: HH:MM:SS,mmm (逗号分隔)
    // VTT格式: HH:MM:SS.mmm (点分隔)
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return Err(format!("无效的时间格式: {}", time_str));
    }
    
    let hours: f64 = parts[0].parse()
        .map_err(|_| format!("无法解析小时: {}", parts[0]))?;
    let minutes: f64 = parts[1].parse()
        .map_err(|_| format!("无法解析分钟: {}", parts[1]))?;
    
    // 尝试用逗号分隔（SRT格式）
    let seconds_parts: Vec<&str> = parts[2].split(',').collect();
    let (seconds_str, milliseconds_str) = if seconds_parts.len() == 2 {
        (seconds_parts[0], seconds_parts[1])
    } else {
        // 尝试用点分隔（VTT格式）
        let vtt_parts: Vec<&str> = parts[2].split('.').collect();
        if vtt_parts.len() == 2 {
            (vtt_parts[0], vtt_parts[1])
        } else {
            return Err(format!("无效的秒数格式: {}", parts[2]));
        }
    };
    
    let seconds: f64 = seconds_str.parse()
        .map_err(|_| format!("无法解析秒数: {}", seconds_str))?;
    let milliseconds: f64 = milliseconds_str.parse()
        .map_err(|_| format!("无法解析毫秒: {}", milliseconds_str))?;
    
    Ok(hours * 3600.0 + minutes * 60.0 + seconds + milliseconds / 1000.0)
}

// 将SRT时间戳转换为秒数（浮点数）- 保持向后兼容
#[allow(dead_code)]
fn srt_time_to_seconds(time_str: &str) -> Result<f64, String> {
    subtitle_time_to_seconds(time_str)
}

// 将秒数转换为时间戳字符串（用于JSON格式）
fn seconds_to_timestamp(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u32;
    let minutes = ((seconds % 3600.0) / 60.0) as u32;
    let secs = (seconds % 60.0) as u32;
    let ms = ((seconds % 1.0) * 1000.0) as u32;
    
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, secs, ms)
}

// 将 VTT 文件转换为 SRT 文件
fn convert_vtt_to_srt(vtt_path: &PathBuf) -> Result<String, String> {
    let content = std::fs::read_to_string(vtt_path)
        .map_err(|e| format!("无法读取VTT文件: {}", e))?;
    
    let lines: Vec<&str> = content.lines().collect();
    let mut srt_lines: Vec<String> = Vec::new();
    let mut i = 0;
    let mut sequence = 1;
    
    // 跳过 WEBVTT 头部
    while i < lines.len() {
        let line = lines[i].trim();
        if line == "WEBVTT" || line.starts_with("WEBVTT") {
            i += 1;
            // 跳过可能的空行和元数据
            while i < lines.len() && (lines[i].trim().is_empty() || !lines[i].trim().contains("-->")) {
                i += 1;
            }
            break;
        }
        i += 1;
    }
    
    // 解析 VTT 内容
    while i < lines.len() {
        // 跳过空行
        if lines[i].trim().is_empty() {
            i += 1;
            continue;
        }
        
        // 读取时间戳行：00:00:00.000 --> 00:00:05.000
        let time_line = lines[i].trim();
        if !time_line.contains("-->") {
            i += 1;
            continue;
        }
        
        let time_parts: Vec<&str> = time_line.split("-->").collect();
        if time_parts.len() != 2 {
            i += 1;
            continue;
        }
        
        let from_time_str = time_parts[0].trim();
        let to_time_str = time_parts[1].trim();
        
        // 将 VTT 时间格式（点）转换为 SRT 时间格式（逗号）
        let from_srt = from_time_str.replace('.', ",");
        let to_srt = to_time_str.replace('.', ",");
        
        i += 1;
        
        // 读取文本内容（可能有多行）
        let mut text_lines = Vec::new();
        while i < lines.len() && !lines[i].trim().is_empty() {
            let text_line = lines[i].trim();
            // 跳过 VTT 的样式标记（如 <c>, <b> 等）
            let clean_text = text_line
                .replace("<c>", "")
                .replace("</c>", "")
                .replace("<b>", "")
                .replace("</b>", "")
                .replace("<i>", "")
                .replace("</i>", "")
                .replace("<u>", "")
                .replace("</u>", "");
            if !clean_text.is_empty() {
                text_lines.push(clean_text);
            }
            i += 1;
        }
        
        let text = text_lines.join(" ").trim().to_string();
        
        if text.is_empty() {
            continue;
        }
        
        // 构建 SRT 格式
        srt_lines.push(sequence.to_string());
        srt_lines.push(format!("{} --> {}", from_srt, to_srt));
        srt_lines.push(text);
        srt_lines.push(String::new());
        
        sequence += 1;
    }
    
    // 创建 SRT 文件
    let srt_path = vtt_path.with_extension("srt");
    let srt_content = srt_lines.join("\n");
    std::fs::write(&srt_path, srt_content)
        .map_err(|e| format!("无法写入SRT文件: {}", e))?;
    
    Ok(srt_path.to_string_lossy().to_string())
}

// 解析SRT或VTT文件并转换为JSON格式
fn convert_srt_to_transcription_json(srt_path: &PathBuf) -> Result<String, String> {
    let content = std::fs::read_to_string(srt_path)
        .map_err(|e| format!("无法读取字幕文件: {}", e))?;
    
    let mut segments: Vec<serde_json::Value> = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;
    
    // 检查是否是 VTT 格式（以 WEBVTT 开头）
    let is_vtt = lines.iter().any(|line| line.trim().starts_with("WEBVTT"));
    
    if is_vtt {
        // 跳过 WEBVTT 头部
        while i < lines.len() {
            let line = lines[i].trim();
            if line == "WEBVTT" || line.starts_with("WEBVTT") {
                i += 1;
                // 跳过可能的空行和元数据
                while i < lines.len() && (lines[i].trim().is_empty() || !lines[i].trim().contains("-->")) {
                    i += 1;
                }
                break;
            }
            i += 1;
        }
    }
    
    while i < lines.len() {
        // 跳过空行
        if lines[i].trim().is_empty() {
            i += 1;
            continue;
        }
        
        // 读取序号（SRT格式，VTT格式没有序号）
        if !is_vtt {
            while i < lines.len() && lines[i].trim().parse::<u32>().is_ok() {
                i += 1;
            }
        }
        
        if i >= lines.len() {
            break;
        }
        
        // 读取时间戳行：00:00:00,000 --> 00:00:05,000 (SRT) 或 00:00:00.000 --> 00:00:05.000 (VTT)
        let time_line = lines[i].trim();
        if !time_line.contains("-->") {
            i += 1;
            continue;
        }
        
        let time_parts: Vec<&str> = time_line.split("-->").collect();
        if time_parts.len() != 2 {
            i += 1;
            continue;
        }
        
        let from_time_str = time_parts[0].trim();
        let to_time_str = time_parts[1].trim();
        
        let from_seconds = subtitle_time_to_seconds(from_time_str)
            .map_err(|e| format!("解析开始时间失败: {}", e))?;
        let to_seconds = subtitle_time_to_seconds(to_time_str)
            .map_err(|e| format!("解析结束时间失败: {}", e))?;
        
        i += 1;
        
        // 读取文本内容（可能有多行）
        let mut text_lines = Vec::new();
        while i < lines.len() && !lines[i].trim().is_empty() {
            let text_line = lines[i].trim();
            // 如果是 VTT 格式，移除 HTML 标签
            let clean_text = if is_vtt {
                text_line
                    .replace("<c>", "")
                    .replace("</c>", "")
                    .replace("<b>", "")
                    .replace("</b>", "")
                    .replace("<i>", "")
                    .replace("</i>", "")
                    .replace("<u>", "")
                    .replace("</u>", "")
            } else {
                text_line.to_string()
            };
            if !clean_text.is_empty() {
                text_lines.push(clean_text);
            }
            i += 1;
        }
        
        let text = text_lines.join(" ").trim().to_string();
        
        if text.is_empty() {
            continue;
        }
        
        // 构建segment
        let segment = json!({
            "timestamps": {
                "from": seconds_to_timestamp(from_seconds),
                "to": seconds_to_timestamp(to_seconds)
            },
            "offsets": {
                "from": from_seconds,
                "to": to_seconds
            },
            "text": text
        });
        
        segments.push(segment);
        
        // 跳过空行
        while i < lines.len() && lines[i].trim().is_empty() {
            i += 1;
        }
    }
    
    // 构建完整的JSON结果
    let result = json!({
        "transcription": segments,
        "result": {
            "language": "zh"
        }
    });
    
    serde_json::to_string_pretty(&result)
        .map_err(|e| format!("无法序列化JSON: {}", e))
}

// 从SRT文件转换为转写结果JSON
#[tauri::command]
async fn convert_srt_to_transcription_json_command(
    srt_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(srt_path);
    convert_srt_to_transcription_json(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RunningTasks::new())
        .manage(RunningExtractions::new())
        .manage(RunningStreams::new())
        .invoke_handler(tauri::generate_handler![
            create_transcription_resource,
            create_transcription_resource_from_url,
            create_transcription_task,
            execute_transcription_task,
            stop_transcription_task,
            get_transcription_resources,
            get_transcription_tasks,
            get_transcription_task,
            delete_transcription_resource,
            delete_transcription_task,
            read_transcription_result,
            check_fast_whisper_status,
            install_faster_whisper,
            get_models_dir,
            get_downloaded_models,
            download_model,
            delete_model,
            execute_command,
            check_file_exists,
            extract_audio_from_video,
            create_temp_subtitle_file,
            download_subtitle_from_url,
            convert_srt_to_transcription_json_command,
            get_ai_configs,
            create_ai_config,
            update_ai_config,
            delete_ai_config,
            get_mcp_configs,
            get_mcp_config_full,
            save_mcp_config,
            save_mcp_config_full,
            delete_mcp_config,
            update_mcp_enabled,
            test_mcp_connection,
            chat_completion,
            stop_chat_completion,
            execute_mcp_tool_call,
            create_chat,
            get_all_chats,
            get_chat,
            update_chat_title,
            summarize_chat_title,
            delete_chat,
            get_messages_by_chat,
            save_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
