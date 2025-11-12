use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;
use serde_json;
use crate::{TranscriptionResource, TranscriptionTask, TranscriptionParams, ResourceType, AIConfig};

// 获取数据库路径
pub fn get_db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("transcription.db")
}

// 初始化数据库（创建表结构）
pub fn init_database(db_path: &PathBuf) -> SqlResult<Connection> {
    let conn = Connection::open(db_path)?;
    
    // 创建转写资源表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcription_resources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            extracted_audio_path TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    
    // 创建转写任务表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcription_tasks (
            id TEXT PRIMARY KEY,
            resource_id TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            result TEXT,
            error TEXT,
            log TEXT,
            params TEXT NOT NULL,
            FOREIGN KEY (resource_id) REFERENCES transcription_resources(id)
        )",
        [],
    )?;
    
    // 创建索引以提高查询性能
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_resource_id ON transcription_tasks(resource_id)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_resources_created_at ON transcription_resources(created_at)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON transcription_tasks(created_at)",
        [],
    )?;
    
    // 创建 AI 配置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_configs_created_at ON ai_configs(created_at)",
        [],
    )?;
    
    Ok(conn)
}

// 资源类型转换
fn resource_type_to_string(resource_type: &ResourceType) -> String {
    match resource_type {
        ResourceType::Audio => "audio".to_string(),
        ResourceType::Video => "video".to_string(),
    }
}

fn string_to_resource_type(s: &str) -> ResourceType {
    match s {
        "video" => ResourceType::Video,
        _ => ResourceType::Audio,
    }
}

// 资源 CRUD 操作
pub fn create_resource(conn: &Connection, resource: &TranscriptionResource) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO transcription_resources 
         (id, name, file_path, resource_type, extracted_audio_path, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            resource.extracted_audio_path,
            resource.status,
            resource.created_at,
            resource.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_resource(conn: &Connection, resource_id: &str) -> SqlResult<Option<TranscriptionResource>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, status, created_at, updated_at
         FROM transcription_resources WHERE id = ?1"
    )?;
    
    let resource_iter = stmt.query_map(params![resource_id], |row| {
        Ok(TranscriptionResource {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
            extracted_audio_path: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    
    for resource in resource_iter {
        return Ok(Some(resource?));
    }
    Ok(None)
}

pub fn get_all_resources(conn: &Connection) -> SqlResult<Vec<TranscriptionResource>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, status, created_at, updated_at
         FROM transcription_resources
         ORDER BY created_at DESC"
    )?;
    
    let resource_iter = stmt.query_map([], |row| {
        Ok(TranscriptionResource {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
            extracted_audio_path: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    
    let mut resources = Vec::new();
    for resource in resource_iter {
        resources.push(resource?);
    }
    Ok(resources)
}

pub fn update_resource(conn: &Connection, resource: &TranscriptionResource) -> SqlResult<()> {
    conn.execute(
        "UPDATE transcription_resources
         SET name = ?2, file_path = ?3, resource_type = ?4, extracted_audio_path = ?5,
             status = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            resource.extracted_audio_path,
            resource.status,
            resource.updated_at,
        ],
    )?;
    Ok(())
}

pub fn delete_resource(conn: &Connection, resource_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM transcription_resources WHERE id = ?1",
        params![resource_id],
    )?;
    Ok(())
}

// 任务 CRUD 操作
pub fn create_task(conn: &Connection, task: &TranscriptionTask) -> SqlResult<()> {
    let params_json = serde_json::to_string(&task.params)
        .map_err(|_e| rusqlite::Error::InvalidColumnType(0, "params".to_string(), rusqlite::types::Type::Text))?;
    
    conn.execute(
        "INSERT INTO transcription_tasks
         (id, resource_id, status, created_at, completed_at, result, error, log, params)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            task.id,
            task.resource_id,
            task.status,
            task.created_at,
            task.completed_at,
            task.result,
            task.error,
            task.log,
            params_json,
        ],
    )?;
    Ok(())
}

pub fn get_task(conn: &Connection, task_id: &str) -> SqlResult<Option<TranscriptionTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params
         FROM transcription_tasks WHERE id = ?1"
    )?;
    
    let task_iter = stmt.query_map(params![task_id], |row| {
        let params_json: String = row.get(8)?;
        let params: TranscriptionParams = serde_json::from_str(&params_json)
            .map_err(|_| rusqlite::Error::InvalidColumnType(8, "params".to_string(), rusqlite::types::Type::Text))?;
        
        Ok(TranscriptionTask {
            id: row.get(0)?,
            resource_id: row.get(1)?,
            status: row.get(2)?,
            created_at: row.get(3)?,
            completed_at: row.get(4)?,
            result: row.get(5)?,
            error: row.get(6)?,
            log: row.get(7)?,
            params,
        })
    })?;
    
    for task in task_iter {
        return Ok(Some(task?));
    }
    Ok(None)
}

pub fn get_tasks_by_resource(conn: &Connection, resource_id: &str) -> SqlResult<Vec<TranscriptionTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params
         FROM transcription_tasks
         WHERE resource_id = ?1
         ORDER BY created_at DESC"
    )?;
    
    let task_iter = stmt.query_map(params![resource_id], |row| {
        let params_json: String = row.get(8)?;
        let params: TranscriptionParams = serde_json::from_str(&params_json)
            .map_err(|_| rusqlite::Error::InvalidColumnType(8, "params".to_string(), rusqlite::types::Type::Text))?;
        
        Ok(TranscriptionTask {
            id: row.get(0)?,
            resource_id: row.get(1)?,
            status: row.get(2)?,
            created_at: row.get(3)?,
            completed_at: row.get(4)?,
            result: row.get(5)?,
            error: row.get(6)?,
            log: row.get(7)?,
            params,
        })
    })?;
    
    let mut tasks = Vec::new();
    for task in task_iter {
        tasks.push(task?);
    }
    Ok(tasks)
}

pub fn get_all_tasks(conn: &Connection) -> SqlResult<Vec<TranscriptionTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params
         FROM transcription_tasks
         ORDER BY created_at DESC"
    )?;
    
    let task_iter = stmt.query_map([], |row| {
        let params_json: String = row.get(8)?;
        let params: TranscriptionParams = serde_json::from_str(&params_json)
            .map_err(|_| rusqlite::Error::InvalidColumnType(8, "params".to_string(), rusqlite::types::Type::Text))?;
        
        Ok(TranscriptionTask {
            id: row.get(0)?,
            resource_id: row.get(1)?,
            status: row.get(2)?,
            created_at: row.get(3)?,
            completed_at: row.get(4)?,
            result: row.get(5)?,
            error: row.get(6)?,
            log: row.get(7)?,
            params,
        })
    })?;
    
    let mut tasks = Vec::new();
    for task in task_iter {
        tasks.push(task?);
    }
    Ok(tasks)
}

pub fn update_task(conn: &Connection, task: &TranscriptionTask) -> SqlResult<()> {
    let params_json = serde_json::to_string(&task.params)
        .map_err(|_e| rusqlite::Error::InvalidColumnType(0, "params".to_string(), rusqlite::types::Type::Text))?;
    
    conn.execute(
        "UPDATE transcription_tasks
         SET resource_id = ?2, status = ?3, created_at = ?4, completed_at = ?5,
             result = ?6, error = ?7, log = ?8, params = ?9
         WHERE id = ?1",
        params![
            task.id,
            task.resource_id,
            task.status,
            task.created_at,
            task.completed_at,
            task.result,
            task.error,
            task.log,
            params_json,
        ],
    )?;
    Ok(())
}

pub fn delete_task(conn: &Connection, task_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM transcription_tasks WHERE id = ?1",
        params![task_id],
    )?;
    Ok(())
}

// AI 配置 CRUD 操作
pub fn create_ai_config(conn: &Connection, config: &AIConfig) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO ai_configs (id, name, base_url, api_key, model, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            config.id,
            config.name,
            config.base_url,
            config.api_key,
            config.model,
            config.created_at,
            config.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_ai_config(conn: &Connection, config_id: &str) -> SqlResult<Option<AIConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, api_key, model, created_at, updated_at
         FROM ai_configs WHERE id = ?1"
    )?;
    
    let config_iter = stmt.query_map(params![config_id], |row| {
        Ok(AIConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            api_key: row.get(3)?,
            model: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    
    for config in config_iter {
        return Ok(Some(config?));
    }
    Ok(None)
}

pub fn get_all_ai_configs(conn: &Connection) -> SqlResult<Vec<AIConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, api_key, model, created_at, updated_at
         FROM ai_configs
         ORDER BY created_at DESC"
    )?;
    
    let config_iter = stmt.query_map([], |row| {
        Ok(AIConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            api_key: row.get(3)?,
            model: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    
    let mut configs = Vec::new();
    for config in config_iter {
        configs.push(config?);
    }
    Ok(configs)
}

pub fn update_ai_config(conn: &Connection, config: &AIConfig) -> SqlResult<()> {
    conn.execute(
        "UPDATE ai_configs
         SET name = ?2, base_url = ?3, api_key = ?4, model = ?5, updated_at = ?6
         WHERE id = ?1",
        params![
            config.id,
            config.name,
            config.base_url,
            config.api_key,
            config.model,
            config.updated_at,
        ],
    )?;
    Ok(())
}

pub fn delete_ai_config(conn: &Connection, config_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM ai_configs WHERE id = ?1",
        params![config_id],
    )?;
    Ok(())
}

