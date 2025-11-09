mod db;

use serde::{Deserialize, Serialize};
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

// 转写资源模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionResource {
    pub id: String,
    pub name: String,
    pub file_path: String,
    #[serde(default = "default_resource_type")]
    pub resource_type: ResourceType,
    #[serde(default)]
    pub extracted_audio_path: Option<String>, // 提取的音频路径（仅视频资源有）
    pub status: String, // "pending" | "processing" | "completed" | "failed"
    pub created_at: String,
    pub updated_at: String,
}

// 默认资源类型（用于兼容旧数据）
fn default_resource_type() -> ResourceType {
    ResourceType::Audio
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
fn get_whisper_cli_path() -> Result<PathBuf, String> {
    // 获取应用资源目录（tools 文件夹所在位置）
    // 在开发环境中，这通常是项目根目录下的 src-tauri/tools
    // 在生产环境中，这应该是打包后的资源目录
    
    // 首先尝试从环境变量或资源目录获取
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?;
    
    // 获取可执行文件所在目录
    let exe_dir = exe_path.parent()
        .ok_or("无法获取可执行文件目录")?;
    
    // 尝试多个可能的路径
    let possible_paths = vec![
        // 开发环境：从可执行文件目录向上查找
        exe_dir.join("../../tools/whisper/macos-arm64/bin/whisper-cli"),
        exe_dir.join("../tools/whisper/macos-arm64/bin/whisper-cli"),
        // 生产环境：资源目录
        exe_dir.join("resources/tools/whisper/macos-arm64/bin/whisper-cli"),
        // 直接使用绝对路径（开发环境）
        PathBuf::from("/Users/aqiu/projects/qqh-tauri/src-tauri/tools/whisper/macos-arm64/bin/whisper-cli"),
    ];
    
    for path in possible_paths {
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    Err("未找到 whisper-cli 可执行文件。请确保工具已正确打包到 tools 目录中。".to_string())
}

// 获取 ffmpeg 可执行文件路径
fn get_ffmpeg_path() -> Result<PathBuf, String> {
    // 获取应用资源目录（tools 文件夹所在位置）
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?;
    
    let exe_dir = exe_path.parent()
        .ok_or("无法获取可执行文件目录")?;
    
    // 尝试多个可能的路径
    let possible_paths = vec![
        // 开发环境：从可执行文件目录向上查找
        exe_dir.join("../../tools/ffmpeg/macos-arm64/ffmpeg"),
        exe_dir.join("../tools/ffmpeg/macos-arm64/ffmpeg"),
        // 生产环境：资源目录
        exe_dir.join("resources/tools/ffmpeg/macos-arm64/ffmpeg"),
        // 直接使用绝对路径（开发环境）
        PathBuf::from("/Users/aqiu/projects/qqh-tauri/src-tauri/tools/ffmpeg/macos-arm64/ffmpeg"),
    ];
    
    for path in possible_paths {
        if path.exists() && path.is_file() {
            return Ok(path);
        }
    }
    
    Err("未找到 ffmpeg 可执行文件。请确保工具已正确打包到 tools 目录中。".to_string())
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

// 辅助函数：读取 ffmpeg 输出并解析进度，实时发送事件
fn spawn_ffmpeg_progress_reader(
    stream: impl AsyncRead + Send + Unpin + 'static,
    app: tauri::AppHandle,
    log_event_name: String,
    progress_event_name: String,
    total_duration: Option<f64>, // 总时长（秒），如果已知
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
            
            // 尝试解析进度
            // ffmpeg 的 stderr 输出格式示例：
            // frame=  123 fps= 25 q=28.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.0x
            if line.contains("time=") {
                // 提取时间信息
                if let Some(time_start) = line.find("time=") {
                    let time_str = &line[time_start + 5..];
                    if let Some(time_end) = time_str.find(" ") {
                        let time_value = &time_str[..time_end];
                        // 解析时间格式 HH:MM:SS.mmm
                        if let Ok(duration_secs) = parse_time_to_seconds(time_value) {
                            // 如果知道总时长，计算进度百分比
                            if let Some(total) = total_duration {
                                let progress = (duration_secs / total * 100.0).min(100.0);
                                let _ = app.emit(&progress_event_name, &progress);
                            } else {
                                // 只发送当前时间
                                let _ = app.emit(&progress_event_name, &duration_secs);
                            }
                        }
                    }
                }
            }
        }
        output
    })
}

// 解析时间字符串（HH:MM:SS.mmm 或 MM:SS.mmm）为秒数
fn parse_time_to_seconds(time_str: &str) -> Result<f64, String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() == 3 {
        // HH:MM:SS.mmm
        let hours: f64 = parts[0].parse().map_err(|_| "无法解析小时")?;
        let minutes: f64 = parts[1].parse().map_err(|_| "无法解析分钟")?;
        let seconds: f64 = parts[2].parse().map_err(|_| "无法解析秒")?;
        Ok(hours * 3600.0 + minutes * 60.0 + seconds)
    } else if parts.len() == 2 {
        // MM:SS.mmm
        let minutes: f64 = parts[0].parse().map_err(|_| "无法解析分钟")?;
        let seconds: f64 = parts[1].parse().map_err(|_| "无法解析秒")?;
        Ok(minutes * 60.0 + seconds)
    } else {
        Err("时间格式不正确".to_string())
    }
}

// 检测文件类型（根据扩展名）
fn detect_resource_type(file_path: &str) -> ResourceType {
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
        extracted_audio_path: None,
        status: "pending".to_string(),
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
    
    // 更新资源状态为 processing
    resource.status = "processing".to_string();
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
    
    // 调用 whisper-cli 进行转写
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
        
        resource.status = "failed".to_string();
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
        
        return Err(err_msg);
    }
    
    // 获取 whisper-cli 路径
    let whisper_cli = get_whisper_cli_path()?;
    
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
        
        resource.status = "failed".to_string();
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
        
        return Err(format!("转写失败: {}", error_msg));
    }
    
    // 检查输出文件是否存在
    if !output_file.exists() {
        let err_msg = format!("转写完成但未生成输出文件: {}", output_file.display());
        eprintln!("{}", err_msg);
        
        task.status = "failed".to_string();
        task.error = Some(err_msg.clone());
        task.completed_at = Some(Utc::now().to_rfc3339());
        
        resource.status = "failed".to_string();
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
        
        return Err(err_msg);
    }
    
    eprintln!("转写成功，输出文件: {}", output_file.display());
    
    // 更新任务状态为 completed
    task.status = "completed".to_string();
    task.completed_at = Some(Utc::now().to_rfc3339());
    task.result = Some(output_file.to_string_lossy().to_string());
    // log 已经在上面保存了
    
    // 更新资源状态为 completed
    resource.status = "completed".to_string();
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
        let conn = db::init_database(&db_path)
            .map_err(|e| format!("无法初始化数据库: {}", e))?;
        
        // 检查资源是否存在
        if db::get_resource(&conn, &resource_id)
            .map_err(|e| format!("无法查询资源: {}", e))?
            .is_none() {
            return Err(format!("转写资源不存在: {}", resource_id));
        }
        
        db::delete_resource(&conn, &resource_id)
            .map_err(|e| format!("无法删除资源: {}", e))?;
        
        // 注意：不删除关联的任务，任务可以独立存在
        
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
async fn check_fast_whisper_status() -> Result<FastWhisperStatus, String> {
    match get_whisper_cli_path() {
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
async fn install_faster_whisper() -> Result<String, String> {
    // whisper-cli 已经打包在应用中，不需要安装
    // 如果检测不到，可能是打包或路径配置问题
    match get_whisper_cli_path() {
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

    use futures_util::StreamExt;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("下载过程中出错: {}", e))?;
        use tokio::io::AsyncWriteExt;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;
        
        if let Some(total) = total_size {
            let progress = (downloaded as f64 / total as f64) * 100.0;
            eprintln!("下载进度: {:.1}% ({}/{} bytes)", progress, downloaded, total);
        }
    }

    file.sync_all()
        .await
        .map_err(|e| format!("同步文件失败: {}", e))?;

    eprintln!("模型下载完成: {}", model_path.display());
    Ok(format!("模型 {} 下载成功", model_name))
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
    
    // 更新资源状态为 processing
    resource.status = "processing".to_string();
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
    
    // 获取 ffmpeg 路径
    let ffmpeg_path = get_ffmpeg_path()?;
    
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
    let progress_event_name = format!("extraction-progress-{}", resource_id);
    
    // 读取 stdout（通常为空，但保留以防万一）
    let stdout_handle = spawn_stream_reader(
        stdout,
        app.clone(),
        log_event_name.clone(),
        "stdout",
        false,
    );
    
    // 读取 stderr 并解析进度（ffmpeg 的进度信息在 stderr 中）
    // 注意：我们不知道总时长，所以只发送当前时间
    let stderr_handle = spawn_ffmpeg_progress_reader(
        stderr,
        app.clone(),
        log_event_name,
        progress_event_name,
        None, // 暂时不解析总时长
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
        
        resource.status = "failed".to_string();
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
        
        return Err(format!("音频提取失败: {}", error_msg));
    }
    
    // 检查输出文件是否存在
    if !output_path.exists() {
        let err_msg = format!("提取完成但未生成输出文件: {}", output_path.display());
        eprintln!("{}", err_msg);
        
        resource.status = "failed".to_string();
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
        
        return Err(err_msg);
    }
    
    eprintln!("音频提取成功，输出文件: {}", output_path.display());
    
    // 更新资源状态为 completed，保存提取的音频路径
    resource.status = "completed".to_string();
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
    
    // 发送 100% 进度事件
    let progress_event_name = format!("extraction-progress-{}", resource_id);
    let _ = app.emit(&progress_event_name, &100.0);
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RunningTasks::new())
        .manage(RunningExtractions::new())
        .invoke_handler(tauri::generate_handler![
            create_transcription_resource,
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
            execute_command,
            check_file_exists,
            extract_audio_from_video,
            create_temp_subtitle_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
