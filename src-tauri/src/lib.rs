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

// 转写资源模型
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptionResource {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub status: String, // "pending" | "processing" | "completed" | "failed"
    pub created_at: String,
    pub updated_at: String,
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

// 创建转写资源
#[tauri::command]
async fn create_transcription_resource(
    name: String,
    file_path: String,
    app: tauri::AppHandle,
) -> Result<TranscriptionResource, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let resource = TranscriptionResource {
        id: id.clone(),
        name,
        file_path,
        status: "pending".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    
    // 保存到文件
    let app_data_dir = get_app_data_dir(&app)?;
    let resources_dir = app_data_dir.join("transcription_resources");
    std::fs::create_dir_all(&resources_dir)
        .map_err(|e| format!("无法创建资源目录: {}", e))?;
    
    let resource_file = resources_dir.join(format!("{}.json", id));
    let json = serde_json::to_string_pretty(&resource)
        .map_err(|e| format!("无法序列化资源: {}", e))?;
    
    std::fs::write(&resource_file, json)
        .map_err(|e| format!("无法保存资源文件: {}", e))?;
    
    Ok(resource)
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
    
    // 保存到文件
    let app_data_dir = get_app_data_dir(&app)?;
    let tasks_dir = app_data_dir.join("transcription_tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("无法创建任务目录: {}", e))?;
    
    let task_file = tasks_dir.join(format!("{}.json", id));
    let json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("无法序列化任务: {}", e))?;
    
    std::fs::write(&task_file, json)
        .map_err(|e| format!("无法保存任务文件: {}", e))?;
    
    Ok(task)
}

// 执行转写任务（调用 faster-whisper）
#[tauri::command]
async fn execute_transcription_task(
    task_id: String,
    resource_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // 读取资源文件获取音频文件路径
    let app_data_dir = get_app_data_dir(&app)?;
    let resources_dir = app_data_dir.join("transcription_resources");
    let resource_file = resources_dir.join(format!("{}.json", resource_id));
    
    let resource_content = std::fs::read_to_string(&resource_file)
        .map_err(|e| format!("无法读取资源文件: {}", e))?;
    
    let mut resource: TranscriptionResource = serde_json::from_str(&resource_content)
        .map_err(|e| format!("无法解析资源文件: {}", e))?;
    
    // 更新资源状态为 processing
    resource.status = "processing".to_string();
    resource.updated_at = Utc::now().to_rfc3339();
    let resource_json = serde_json::to_string_pretty(&resource)
        .map_err(|e| format!("无法序列化资源: {}", e))?;
    std::fs::write(&resource_file, resource_json)
        .map_err(|e| format!("无法更新资源文件: {}", e))?;
    
    // 读取任务文件
    let tasks_dir = app_data_dir.join("transcription_tasks");
    let task_file = tasks_dir.join(format!("{}.json", task_id));
    
    let task_content = std::fs::read_to_string(&task_file)
        .map_err(|e| format!("无法读取任务文件: {}", e))?;
    
    let mut task: TranscriptionTask = serde_json::from_str(&task_content)
        .map_err(|e| format!("无法解析任务文件: {}", e))?;
    
    // 检查任务是否已经在运行
    let running_tasks: State<'_, RunningTasks> = app.state();
    if running_tasks.contains(&task_id).await {
        eprintln!("任务 {} 已经在运行中，跳过重复执行", task_id);
        // 如果任务状态不是 running，更新为 running（可能是在重新进入页面时）
        if task.status != "running" {
            task.status = "running".to_string();
            let task_json = serde_json::to_string_pretty(&task)
                .map_err(|e| format!("无法序列化任务: {}", e))?;
            std::fs::write(&task_file, task_json)
                .map_err(|e| format!("无法更新任务文件: {}", e))?;
        }
        // 返回一个占位符，表示任务已经在运行
        return Ok("任务已经在运行中".to_string());
    }
    
    // 更新任务状态为 running
    task.status = "running".to_string();
    let task_json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("无法序列化任务: {}", e))?;
    std::fs::write(&task_file, task_json)
        .map_err(|e| format!("无法更新任务文件: {}", e))?;
    
    // 调用 whisper-cli 进行转写
    let audio_path = PathBuf::from(&resource.file_path);
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
        
        let task_json = serde_json::to_string_pretty(&task)
            .map_err(|e| format!("无法序列化任务: {}", e))?;
        std::fs::write(&task_file, task_json)
            .map_err(|e| format!("无法更新任务文件: {}", e))?;
        
        resource.status = "failed".to_string();
        resource.updated_at = Utc::now().to_rfc3339();
        let resource_json = serde_json::to_string_pretty(&resource)
            .map_err(|e| format!("无法序列化资源: {}", e))?;
        std::fs::write(&resource_file, resource_json)
            .map_err(|e| format!("无法更新资源文件: {}", e))?;
        
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
        
        let task_json = serde_json::to_string_pretty(&task)
            .map_err(|e| format!("无法序列化任务: {}", e))?;
        std::fs::write(&task_file, task_json)
            .map_err(|e| format!("无法更新任务文件: {}", e))?;
        
        resource.status = "failed".to_string();
        resource.updated_at = Utc::now().to_rfc3339();
        let resource_json = serde_json::to_string_pretty(&resource)
            .map_err(|e| format!("无法序列化资源: {}", e))?;
        std::fs::write(&resource_file, resource_json)
            .map_err(|e| format!("无法更新资源文件: {}", e))?;
        
        return Err(format!("转写失败: {}", error_msg));
    }
    
    // 检查输出文件是否存在
    if !output_file.exists() {
        let err_msg = format!("转写完成但未生成输出文件: {}", output_file.display());
        eprintln!("{}", err_msg);
        
        task.status = "failed".to_string();
        task.error = Some(err_msg.clone());
        task.completed_at = Some(Utc::now().to_rfc3339());
        
        let task_json = serde_json::to_string_pretty(&task)
            .map_err(|e| format!("无法序列化任务: {}", e))?;
        std::fs::write(&task_file, task_json)
            .map_err(|e| format!("无法更新任务文件: {}", e))?;
        
        resource.status = "failed".to_string();
        resource.updated_at = Utc::now().to_rfc3339();
        let resource_json = serde_json::to_string_pretty(&resource)
            .map_err(|e| format!("无法序列化资源: {}", e))?;
        std::fs::write(&resource_file, resource_json)
            .map_err(|e| format!("无法更新资源文件: {}", e))?;
        
        return Err(err_msg);
    }
    
    eprintln!("转写成功，输出文件: {}", output_file.display());
    
    // 更新任务状态为 completed
    task.status = "completed".to_string();
    task.completed_at = Some(Utc::now().to_rfc3339());
    task.result = Some(output_file.to_string_lossy().to_string());
    // log 已经在上面保存了
    
    let task_json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("无法序列化任务: {}", e))?;
    std::fs::write(&task_file, task_json)
        .map_err(|e| format!("无法更新任务文件: {}", e))?;
    
    // 更新资源状态为 completed
    resource.status = "completed".to_string();
    resource.updated_at = Utc::now().to_rfc3339();
    let resource_json = serde_json::to_string_pretty(&resource)
        .map_err(|e| format!("无法序列化资源: {}", e))?;
    std::fs::write(&resource_file, resource_json)
        .map_err(|e| format!("无法更新资源文件: {}", e))?;
    
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
    let tasks_dir = app_data_dir.join("transcription_tasks");
    let task_file = tasks_dir.join(format!("{}.json", task_id));
    
    // 首先读取任务文件，检查任务状态
    if !task_file.exists() {
        return Err(format!("任务 {} 不存在", task_id));
    }
    
    let task_content = std::fs::read_to_string(&task_file)
        .map_err(|e| format!("无法读取任务文件: {}", e))?;
    
    let mut task: TranscriptionTask = serde_json::from_str(&task_content)
        .map_err(|e| format!("无法解析任务文件: {}", e))?;
    
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
    
    let task_json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("无法序列化任务: {}", e))?;
    std::fs::write(&task_file, task_json)
        .map_err(|e| format!("无法更新任务文件: {}", e))?;
    
    Ok(())
}

// 获取所有转写资源
#[tauri::command]
async fn get_transcription_resources(
    app: tauri::AppHandle,
) -> Result<Vec<TranscriptionResource>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let resources_dir = app_data_dir.join("transcription_resources");
    
    if !resources_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut resources = Vec::new();
    
    let entries = std::fs::read_dir(&resources_dir)
        .map_err(|e| format!("无法读取资源目录: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("无法读取目录项: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("无法读取文件 {}: {}", path.display(), e))?;
            
            let resource: TranscriptionResource = serde_json::from_str(&content)
                .map_err(|e| format!("无法解析文件 {}: {}", path.display(), e))?;
            
            resources.push(resource);
        }
    }
    
    // 按创建时间排序
    resources.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    
    Ok(resources)
}

// 获取转写任务列表
#[tauri::command]
async fn get_transcription_tasks(
    resource_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<TranscriptionTask>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let tasks_dir = app_data_dir.join("transcription_tasks");
    
    if !tasks_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut tasks = Vec::new();
    
    let entries = std::fs::read_dir(&tasks_dir)
        .map_err(|e| format!("无法读取任务目录: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("无法读取目录项: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("无法读取文件 {}: {}", path.display(), e))?;
            
            let task: TranscriptionTask = serde_json::from_str(&content)
                .map_err(|e| format!("无法解析文件 {}: {}", path.display(), e))?;
            
            if resource_id.is_none() || task.resource_id == *resource_id.as_ref().unwrap() {
                tasks.push(task);
            }
        }
    }
    
    // 按创建时间排序
    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    
    Ok(tasks)
}

// 获取单个转写任务
#[tauri::command]
async fn get_transcription_task(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<TranscriptionTask, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let tasks_dir = app_data_dir.join("transcription_tasks");
    let task_file = tasks_dir.join(format!("{}.json", task_id));
    
    if !task_file.exists() {
        return Err(format!("转写任务不存在: {}", task_id));
    }
    
    let content = std::fs::read_to_string(&task_file)
        .map_err(|e| format!("无法读取任务文件: {}", e))?;
    
    let task: TranscriptionTask = serde_json::from_str(&content)
        .map_err(|e| format!("无法解析任务文件: {}", e))?;
    
    Ok(task)
}

// 删除转写资源
#[tauri::command]
async fn delete_transcription_resource(
    resource_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let resources_dir = app_data_dir.join("transcription_resources");
    let resource_file = resources_dir.join(format!("{}.json", resource_id));
    
    if !resource_file.exists() {
        return Err(format!("转写资源不存在: {}", resource_id));
    }
    
    // 删除资源文件
    std::fs::remove_file(&resource_file)
        .map_err(|e| format!("无法删除资源文件: {}", e))?;
    
    // 注意：不删除关联的任务，任务可以独立存在
    
    Ok(())
}

// 删除转写任务
#[tauri::command]
async fn delete_transcription_task(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let tasks_dir = app_data_dir.join("transcription_tasks");
    let task_file = tasks_dir.join(format!("{}.json", task_id));
    
    if !task_file.exists() {
        return Err(format!("转写任务不存在: {}", task_id));
    }
    
    // 读取任务信息，以便删除关联的结果文件
    let task_content = std::fs::read_to_string(&task_file)
        .map_err(|e| format!("无法读取任务文件: {}", e))?;
    
    let task: TranscriptionTask = serde_json::from_str(&task_content)
        .map_err(|e| format!("无法解析任务文件: {}", e))?;
    
    // 删除结果文件（如果存在）
    if let Some(result_path) = task.result {
        let result_file = PathBuf::from(&result_path);
        if result_file.exists() {
            let _ = std::fs::remove_file(&result_file);
        }
    }
    
    // 删除任务文件
    std::fs::remove_file(&task_file)
        .map_err(|e| format!("无法删除任务文件: {}", e))?;
    
    Ok(())
}

// 读取转写结果文件内容
#[tauri::command]
async fn read_transcription_result(
    task_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    let tasks_dir = app_data_dir.join("transcription_tasks");
    let task_file = tasks_dir.join(format!("{}.json", task_id));
    
    if !task_file.exists() {
        return Err(format!("转写任务不存在: {}", task_id));
    }
    
    let task_content = std::fs::read_to_string(&task_file)
        .map_err(|e| format!("无法读取任务文件: {}", e))?;
    
    let task: TranscriptionTask = serde_json::from_str(&task_content)
        .map_err(|e| format!("无法解析任务文件: {}", e))?;
    
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

// 检查文件是否存在
#[tauri::command]
async fn check_file_exists(file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    Ok(path.exists() && path.is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RunningTasks::new())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
