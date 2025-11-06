use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;
use chrono::Utc;

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

// 执行转写任务（调用 fast-whisper）
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
    
    // 更新任务状态为 running
    task.status = "running".to_string();
    let task_json = serde_json::to_string_pretty(&task)
        .map_err(|e| format!("无法序列化任务: {}", e))?;
    std::fs::write(&task_file, task_json)
        .map_err(|e| format!("无法更新任务文件: {}", e))?;
    
    // 调用 fast-whisper 进行转写
    let audio_path = PathBuf::from(&resource.file_path);
    let output_dir = app_data_dir.join("transcription_results");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("无法创建结果目录: {}", e))?;
    
    let output_file = output_dir.join(format!("{}.srt", task_id));
    
    // 调用 fast-whisper 进行转写
    // 方式1: 通过 Python 脚本调用 fast-whisper
    // 需要确保系统已安装 Python 和 fast-whisper: pip install fast-whisper
    let model_name = task.params.model.as_deref().unwrap_or("base");
    let language = task.params.language.as_deref().unwrap_or("zh");
    
    // 构建 Python 命令来调用 fast-whisper
    // 注意：这里需要根据实际环境调整 Python 路径和 fast-whisper 的调用方式
    let python_script = format!(
        r#"
import sys
from pathlib import Path
from faster_whisper import WhisperModel

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{{hours:02d}}:{{minutes:02d}}:{{secs:02d}},{{millis:03d}}"

audio_path = r"{}"
output_path = r"{}"
model_name = "{}"
language = "{}"

try:
    # 加载模型
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    
    # 转写音频
    segments, info = model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,
        beam_size=5
    )
    
    # 生成 SRT 格式
    srt_content = []
    index = 1
    for segment in segments:
        start_time = format_timestamp(segment.start)
        end_time = format_timestamp(segment.end)
        text = segment.text.strip()
        srt_content.append(f"{{index}}\n{{start_time}} --> {{end_time}}\n{{text}}\n")
        index += 1
    
    # 保存 SRT 文件
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_content))
    
    print("SUCCESS", flush=True)
except Exception as e:
    import traceback
    error_msg = f"ERROR: {{str(e)}}\n{{traceback.format_exc()}}"
    print(error_msg, file=sys.stderr, flush=True)
    sys.exit(1)
"#,
        audio_path.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\""),
        output_file.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\""),
        model_name,
        language
    );
    
    // 将 Python 脚本保存到临时文件
    let script_file = app_data_dir.join(format!("transcribe_{}.py", task_id));
    std::fs::write(&script_file, python_script)
        .map_err(|e| format!("无法创建 Python 脚本: {}", e))?;
    
    // 执行 Python 脚本
    eprintln!("开始执行 Python 脚本: {}", script_file.display());
    eprintln!("音频文件路径: {}", audio_path.display());
    eprintln!("输出文件路径: {}", output_file.display());
    
    let output = tokio::process::Command::new("python3")
        .arg(script_file.to_string_lossy().to_string())
        .output()
        .await
        .map_err(|e| {
            let err_msg = format!("无法执行 Python 脚本: {}。请确保已安装 Python 3 和 faster-whisper (pip install faster-whisper)", e);
            eprintln!("{}", err_msg);
            err_msg
        })?;
    
    // 清理临时脚本文件
    let _ = std::fs::remove_file(&script_file);
    
    // 打印 Python 脚本的输出
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("Python 脚本 stdout: {}", stdout);
    eprintln!("Python 脚本 stderr: {}", stderr);
    eprintln!("Python 脚本退出码: {:?}", output.status.code());
    
    if !output.status.success() {
        let error_msg = if !stderr.is_empty() {
            stderr.to_string()
        } else if !stdout.is_empty() {
            stdout.to_string()
        } else {
            format!("Python 脚本执行失败，退出码: {:?}", output.status.code())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            create_transcription_resource,
            create_transcription_task,
            execute_transcription_task,
            get_transcription_resources,
            get_transcription_tasks,
            get_transcription_task,
            delete_transcription_task,
            read_transcription_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
