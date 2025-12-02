use rusqlite::{Connection, Result as SqlResult, params};
use std::path::PathBuf;
use serde_json;
use crate::{TranscriptionResource, TranscriptionTask, TranscriptionParams, ResourceType, SourceType, Platform, AIConfig, Chat, Message};

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
            latest_completed_task_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    
    // 迁移：如果 transcription_resources 表存在但没有 latest_completed_task_id 字段，则添加
    let _ = conn.execute(
        "ALTER TABLE transcription_resources ADD COLUMN latest_completed_task_id TEXT",
        [],
    );
    
    // 迁移：添加 source_type 字段（默认为 'file'）
    let _ = conn.execute(
        "ALTER TABLE transcription_resources ADD COLUMN source_type TEXT DEFAULT 'file'",
        [],
    );
    
    // 迁移：添加 platform 字段（可选）
    let _ = conn.execute(
        "ALTER TABLE transcription_resources ADD COLUMN platform TEXT",
        [],
    );
    
    // 迁移：添加 cover_url 字段（可选）
    let _ = conn.execute(
        "ALTER TABLE transcription_resources ADD COLUMN cover_url TEXT",
        [],
    );
    
    // 迁移：添加 topics 字段（可选，JSON 格式）
    let _ = conn.execute(
        "ALTER TABLE transcription_resources ADD COLUMN topics TEXT",
        [],
    );
    
    // 迁移：如果 transcription_resources 表存在但有 status 字段，则移除（SQLite 不支持直接删除列，这里只是标记）
    // 注意：SQLite 不支持 ALTER TABLE DROP COLUMN，如果需要完全移除，需要重建表
    // 这里先保留字段但不使用，后续可以通过重建表来完全移除
    
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
            compressed_content TEXT,
            FOREIGN KEY (resource_id) REFERENCES transcription_resources(id)
        )",
        [],
    )?;
    
    // 迁移：如果 transcription_tasks 表存在但没有 compressed_content 字段，则添加
    let _ = conn.execute(
        "ALTER TABLE transcription_tasks ADD COLUMN compressed_content TEXT",
        [],
    );
    
    // 迁移：如果 transcription_tasks 表存在但没有 topics 字段，则添加
    let _ = conn.execute(
        "ALTER TABLE transcription_tasks ADD COLUMN topics TEXT",
        [],
    );
    
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
    
    // 添加 is_compression_config 字段（如果不存在）
    conn.execute(
        "ALTER TABLE ai_configs ADD COLUMN is_compression_config INTEGER DEFAULT 0",
        [],
    ).ok(); // 如果字段已存在，忽略错误
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_configs_created_at ON ai_configs(created_at)",
        [],
    )?;
    
    // 创建 chats 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC)",
        [],
    )?;
    
    // 创建 messages 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tool_calls TEXT,
            tool_call_id TEXT,
            name TEXT,
            reasoning TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // 迁移：如果 messages 表存在但没有 reasoning 字段，则添加
    let _ = conn.execute(
        "ALTER TABLE messages ADD COLUMN reasoning TEXT",
        [],
    );
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)",
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

// 来源类型转换
fn source_type_to_string(source_type: &SourceType) -> String {
    match source_type {
        SourceType::File => "file".to_string(),
        SourceType::Url => "url".to_string(),
    }
}

fn string_to_source_type(s: &str) -> SourceType {
    match s {
        "url" => SourceType::Url,
        _ => SourceType::File,
    }
}

// 平台类型转换
fn platform_to_string(platform: &Option<Platform>) -> Option<String> {
    platform.as_ref().map(|p| match p {
        Platform::Youtube => "youtube".to_string(),
        Platform::Bilibili => "bilibili".to_string(),
        Platform::Other => "other".to_string(),
    })
}

fn string_to_platform(s: Option<String>) -> Option<Platform> {
    s.as_ref().and_then(|s| match s.as_str() {
        "youtube" => Some(Platform::Youtube),
        "bilibili" => Some(Platform::Bilibili),
        "other" => Some(Platform::Other),
        _ => None,
    })
}

// 将 topics 序列化为 JSON 字符串
fn topics_to_string(topics: &Option<Vec<crate::Topic>>) -> Option<String> {
    topics.as_ref().and_then(|t| {
        serde_json::to_string(t).ok()
    })
}

// 从 JSON 字符串反序列化 topics
fn string_to_topics(s: Option<String>) -> Option<Vec<crate::Topic>> {
    s.and_then(|s| {
        serde_json::from_str(&s).ok()
    })
}

// 资源 CRUD 操作
pub fn create_resource(conn: &Connection, resource: &TranscriptionResource) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO transcription_resources 
         (id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, cover_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            source_type_to_string(&resource.source_type),
            platform_to_string(&resource.platform),
            resource.extracted_audio_path,
            resource.latest_completed_task_id,
            resource.cover_url,
            resource.created_at,
            resource.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_resource(conn: &Connection, resource_id: &str) -> SqlResult<Option<TranscriptionResource>> {
    // 尝试最新格式（包含 source_type, platform 和 cover_url）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, cover_url, created_at, updated_at
         FROM transcription_resources WHERE id = ?1"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![resource_id], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        
        for resource in resource_iter {
            return Ok(Some(resource?));
        }
    }
    
    // 尝试旧格式（没有 cover_url）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources WHERE id = ?1"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![resource_id], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: None, // 默认值
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        
        for resource in resource_iter {
            return Ok(Some(resource?));
        }
    }
    
    // 尝试更旧的格式（没有 source_type 和 platform）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources WHERE id = ?1"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![resource_id], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: SourceType::File, // 默认值
                platform: None, // 默认值
                extracted_audio_path: row.get(4)?,
                latest_completed_task_id: row.get(5)?,
                cover_url: None, // 默认值
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        
        for resource in resource_iter {
            return Ok(Some(resource?));
        }
    }
    
    // 如果新格式失败，尝试更旧的格式（有 status 字段，但忽略它）
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, status, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources WHERE id = ?1"
    )?;
    
    let resource_iter = stmt.query_map(params![resource_id], |row| {
        Ok(TranscriptionResource {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
            source_type: SourceType::File, // 默认值
            platform: None, // 默认值
            extracted_audio_path: row.get(4)?,
            latest_completed_task_id: row.get(6)?, // 跳过 status (5)
            cover_url: None, // 默认值
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    
    for resource in resource_iter {
        return Ok(Some(resource?));
    }
    Ok(None)
}

pub fn get_all_resources(conn: &Connection) -> SqlResult<Vec<TranscriptionResource>> {
    // 尝试最新格式（包含 source_type, platform, cover_url 和 topics）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, cover_url, topics, created_at, updated_at
         FROM transcription_resources
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map([], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: row.get(8)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 尝试旧格式（没有 cover_url）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map([], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: None, // 默认值
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 尝试更旧的格式（没有 source_type 和 platform）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map([], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: SourceType::File, // 默认值
                platform: None, // 默认值
                extracted_audio_path: row.get(4)?,
                latest_completed_task_id: row.get(5)?,
                cover_url: None, // 默认值
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 如果新格式失败，尝试更旧的格式（有 status 字段，但忽略它）
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, status, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         ORDER BY created_at DESC"
    )?;
    
    let resource_iter = stmt.query_map([], |row| {
        Ok(TranscriptionResource {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
            source_type: SourceType::File, // 默认值
            platform: None, // 默认值
            extracted_audio_path: row.get(4)?,
            latest_completed_task_id: row.get(6)?, // 跳过 status (5)
            cover_url: None, // 默认值
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    
    let mut resources = Vec::new();
    for resource in resource_iter {
        resources.push(resource?);
    }
    Ok(resources)
}

pub fn search_resources(conn: &Connection, keyword: &str) -> SqlResult<Vec<TranscriptionResource>> {
    let search_pattern = format!("%{}%", keyword);
    // 尝试最新格式（包含 source_type, platform 和 cover_url）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, cover_url, created_at, updated_at
         FROM transcription_resources
         WHERE name LIKE ?1 OR file_path LIKE ?1
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![search_pattern], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 尝试旧格式（没有 cover_url）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, source_type, platform, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         WHERE name LIKE ?1 OR file_path LIKE ?1
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![search_pattern], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: string_to_source_type(&row.get::<_, String>(4)?),
                platform: string_to_platform(row.get(5)?),
                extracted_audio_path: row.get(6)?,
                latest_completed_task_id: row.get(7)?,
                cover_url: None, // 默认值
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 尝试更旧的格式（没有 source_type 和 platform）
    let stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         WHERE name LIKE ?1 OR file_path LIKE ?1
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
        let resource_iter = stmt.query_map(params![search_pattern], |row| {
            Ok(TranscriptionResource {
                id: row.get(0)?,
                name: row.get(1)?,
                file_path: row.get(2)?,
                resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
                source_type: SourceType::File, // 默认值
                platform: None, // 默认值
                extracted_audio_path: row.get(4)?,
                latest_completed_task_id: row.get(5)?,
                cover_url: None, // 默认值
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        
        let mut resources = Vec::new();
        for resource in resource_iter {
            resources.push(resource?);
        }
        return Ok(resources);
    }
    
    // 如果新格式失败，尝试更旧的格式（有 status 字段，但忽略它）
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, resource_type, extracted_audio_path, status, latest_completed_task_id, created_at, updated_at
         FROM transcription_resources
         WHERE name LIKE ?1 OR file_path LIKE ?1
         ORDER BY created_at DESC"
    )?;
    
    let resource_iter = stmt.query_map(params![search_pattern], |row| {
        Ok(TranscriptionResource {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            resource_type: string_to_resource_type(&row.get::<_, String>(3)?),
            source_type: SourceType::File, // 默认值
            platform: None, // 默认值
            extracted_audio_path: row.get(4)?,
            latest_completed_task_id: row.get(6)?, // 跳过 status (5)
            cover_url: None, // 默认值
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    
    let mut resources = Vec::new();
    for resource in resource_iter {
        resources.push(resource?);
    }
    Ok(resources)
}

pub fn update_resource(conn: &Connection, resource: &TranscriptionResource) -> SqlResult<()> {
    // 尝试最新格式（包含 source_type, platform 和 cover_url）
    let result = conn.execute(
        "UPDATE transcription_resources
         SET name = ?2, file_path = ?3, resource_type = ?4, source_type = ?5, platform = ?6,
             extracted_audio_path = ?7, latest_completed_task_id = ?8, cover_url = ?9, updated_at = ?10
         WHERE id = ?1",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            source_type_to_string(&resource.source_type),
            platform_to_string(&resource.platform),
            resource.extracted_audio_path,
            resource.latest_completed_task_id,
            resource.cover_url,
            resource.updated_at,
        ],
    );
    
    if result.is_ok() {
        return Ok(());
    }
    
    // 如果新格式失败，尝试旧格式（没有 cover_url）
    let result = conn.execute(
        "UPDATE transcription_resources
         SET name = ?2, file_path = ?3, resource_type = ?4, source_type = ?5, platform = ?6,
             extracted_audio_path = ?7, latest_completed_task_id = ?8, updated_at = ?9
         WHERE id = ?1",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            source_type_to_string(&resource.source_type),
            platform_to_string(&resource.platform),
            resource.extracted_audio_path,
            resource.latest_completed_task_id,
            resource.updated_at,
        ],
    );
    
    if result.is_ok() {
        return Ok(());
    }
    
    // 如果还是失败，尝试更旧的格式（没有 source_type 和 platform）
    let result = conn.execute(
        "UPDATE transcription_resources
         SET name = ?2, file_path = ?3, resource_type = ?4, extracted_audio_path = ?5,
             latest_completed_task_id = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            resource.extracted_audio_path,
            resource.latest_completed_task_id,
            resource.updated_at,
        ],
    );
    
    if result.is_ok() {
        return Ok(());
    }
    
    // 如果还是失败，尝试更旧的格式（有 status 字段，但忽略它）
    conn.execute(
        "UPDATE transcription_resources
         SET name = ?2, file_path = ?3, resource_type = ?4, extracted_audio_path = ?5,
             latest_completed_task_id = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            resource.id,
            resource.name,
            resource.file_path,
            resource_type_to_string(&resource.resource_type),
            resource.extracted_audio_path,
            resource.latest_completed_task_id,
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
         (id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content, topics)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            task.compressed_content,
            topics_to_string(&task.topics),
        ],
    )?;
    Ok(())
}

pub fn get_task(conn: &Connection, task_id: &str) -> SqlResult<Option<TranscriptionTask>> {
    // 尝试最新格式（包含 topics）
    let stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content, topics
         FROM transcription_tasks WHERE id = ?1"
    );
    
    if let Ok(mut stmt) = stmt {
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
                compressed_content: row.get(9)?,
                topics: string_to_topics(row.get(10)?),
                params,
            })
        })?;
        
        for task in task_iter {
            return Ok(Some(task?));
        }
    }
    
    // 尝试旧格式（没有 topics）
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content
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
            compressed_content: row.get(9)?,
            topics: None, // 默认值
            params,
        })
    })?;
    
    for task in task_iter {
        return Ok(Some(task?));
    }
    Ok(None)
}

pub fn get_tasks_by_resource(conn: &Connection, resource_id: &str) -> SqlResult<Vec<TranscriptionTask>> {
    // 尝试最新格式（包含 topics）
    let stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content, topics
         FROM transcription_tasks
         WHERE resource_id = ?1
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
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
                compressed_content: row.get(9)?,
                topics: string_to_topics(row.get(10)?),
                params,
            })
        })?;
        
        let mut tasks = Vec::new();
        for task in task_iter {
            tasks.push(task?);
        }
        return Ok(tasks);
    }
    
    // 尝试旧格式（没有 topics）
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content
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
            compressed_content: row.get(9)?,
            topics: None, // 默认值
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
    // 尝试最新格式（包含 topics）
    let stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content, topics
         FROM transcription_tasks
         ORDER BY created_at DESC"
    );
    
    if let Ok(mut stmt) = stmt {
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
                compressed_content: row.get(9)?,
                topics: string_to_topics(row.get(10)?),
                params,
            })
        })?;
        
        let mut tasks = Vec::new();
        for task in task_iter {
            tasks.push(task?);
        }
        return Ok(tasks);
    }
    
    // 尝试旧格式（没有 topics）
    let mut stmt = conn.prepare(
        "SELECT id, resource_id, status, created_at, completed_at, result, error, log, params, compressed_content
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
            compressed_content: row.get(9)?,
            topics: None, // 默认值
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
    
    // 尝试最新格式（包含 topics）
    let result = conn.execute(
        "UPDATE transcription_tasks
         SET resource_id = ?2, status = ?3, created_at = ?4, completed_at = ?5,
             result = ?6, error = ?7, log = ?8, params = ?9, compressed_content = ?10, topics = ?11
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
            task.compressed_content,
            topics_to_string(&task.topics),
        ],
    );
    
    if result.is_ok() {
        return Ok(());
    }
    
    // 尝试旧格式（没有 topics）
    conn.execute(
        "UPDATE transcription_tasks
         SET resource_id = ?2, status = ?3, created_at = ?4, completed_at = ?5,
             result = ?6, error = ?7, log = ?8, params = ?9, compressed_content = ?10
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
            task.compressed_content,
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

pub fn delete_tasks_by_resource(conn: &Connection, resource_id: &str) -> SqlResult<Vec<String>> {
    // 先获取所有任务ID，以便返回给调用者用于删除结果文件
    let tasks = get_tasks_by_resource(conn, resource_id)?;
    let task_ids: Vec<String> = tasks.iter().map(|t| t.id.clone()).collect();
    
    // 删除所有关联的任务
    conn.execute(
        "DELETE FROM transcription_tasks WHERE resource_id = ?1",
        params![resource_id],
    )?;
    
    Ok(task_ids)
}

// AI 配置 CRUD 操作
pub fn create_ai_config(conn: &Connection, config: &AIConfig) -> SqlResult<()> {
    let is_compression = if config.is_compression_config.unwrap_or(false) { 1 } else { 0 };
    conn.execute(
        "INSERT INTO ai_configs (id, name, base_url, api_key, model, created_at, updated_at, is_compression_config)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            config.id,
            config.name,
            config.base_url,
            config.api_key,
            config.model,
            config.created_at,
            config.updated_at,
            is_compression,
        ],
    )?;
    Ok(())
}

pub fn get_ai_config(conn: &Connection, config_id: &str) -> SqlResult<Option<AIConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, api_key, model, created_at, updated_at, is_compression_config
         FROM ai_configs WHERE id = ?1"
    )?;
    
    let config_iter = stmt.query_map(params![config_id], |row| {
        let is_compression: Option<i32> = row.get(7)?;
        Ok(AIConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            api_key: row.get(3)?,
            model: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            is_compression_config: is_compression.map(|v| v != 0),
        })
    })?;
    
    for config in config_iter {
        return Ok(Some(config?));
    }
    Ok(None)
}

pub fn get_all_ai_configs(conn: &Connection) -> SqlResult<Vec<AIConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, api_key, model, created_at, updated_at, is_compression_config
         FROM ai_configs
         ORDER BY created_at DESC"
    )?;
    
    let config_iter = stmt.query_map([], |row| {
        let is_compression: Option<i32> = row.get(7)?;
        Ok(AIConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            api_key: row.get(3)?,
            model: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            is_compression_config: is_compression.map(|v| v != 0),
        })
    })?;
    
    let mut configs = Vec::new();
    for config in config_iter {
        configs.push(config?);
    }
    Ok(configs)
}

pub fn update_ai_config(conn: &Connection, config: &AIConfig) -> SqlResult<()> {
    let is_compression = if config.is_compression_config.unwrap_or(false) { 1 } else { 0 };
    conn.execute(
        "UPDATE ai_configs
         SET name = ?2, base_url = ?3, api_key = ?4, model = ?5, updated_at = ?6, is_compression_config = ?7
         WHERE id = ?1",
        params![
            config.id,
            config.name,
            config.base_url,
            config.api_key,
            config.model,
            config.updated_at,
            is_compression,
        ],
    )?;
    Ok(())
}

// 获取用于压缩的 AI 配置
pub fn get_compression_config(conn: &Connection) -> SqlResult<Option<AIConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, base_url, api_key, model, created_at, updated_at, is_compression_config
         FROM ai_configs WHERE is_compression_config = 1 LIMIT 1"
    )?;
    
    let config_iter = stmt.query_map([], |row| {
        let is_compression: Option<i32> = row.get(7)?;
        Ok(AIConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            base_url: row.get(2)?,
            api_key: row.get(3)?,
            model: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            is_compression_config: is_compression.map(|v| v != 0),
        })
    })?;
    
    for config in config_iter {
        return Ok(Some(config?));
    }
    Ok(None)
}

// 设置压缩配置（确保只有一个配置被标记为压缩配置）
pub fn set_compression_config(conn: &Connection, config_id: &str) -> SqlResult<()> {
    // 先清除所有配置的压缩标记
    conn.execute(
        "UPDATE ai_configs SET is_compression_config = 0",
        [],
    )?;
    
    // 设置指定配置为压缩配置
    conn.execute(
        "UPDATE ai_configs SET is_compression_config = 1 WHERE id = ?1",
        params![config_id],
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

// Chat CRUD 操作
pub fn create_chat(conn: &Connection, chat: &Chat) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO chats (id, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            chat.id,
            chat.title,
            chat.created_at,
            chat.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_chat(conn: &Connection, chat_id: &str) -> SqlResult<Option<Chat>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at
         FROM chats WHERE id = ?1"
    )?;
    
    let chat_iter = stmt.query_map(params![chat_id], |row| {
        Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    
    for chat in chat_iter {
        return Ok(Some(chat?));
    }
    Ok(None)
}

pub fn get_all_chats(conn: &Connection) -> SqlResult<Vec<Chat>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at
         FROM chats
         ORDER BY updated_at DESC"
    )?;
    
    let chat_iter = stmt.query_map([], |row| {
        Ok(Chat {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    
    let mut chats = Vec::new();
    for chat in chat_iter {
        chats.push(chat?);
    }
    Ok(chats)
}

pub fn update_chat(conn: &Connection, chat: &Chat) -> SqlResult<()> {
    conn.execute(
        "UPDATE chats
         SET title = ?2, updated_at = ?3
         WHERE id = ?1",
        params![
            chat.id,
            chat.title,
            chat.updated_at,
        ],
    )?;
    Ok(())
}

pub fn delete_chat(conn: &Connection, chat_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM chats WHERE id = ?1",
        params![chat_id],
    )?;
    Ok(())
}

// Message CRUD 操作
pub fn create_message(conn: &Connection, message: &Message) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO messages (id, chat_id, role, content, tool_calls, tool_call_id, name, reasoning, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            message.id,
            message.chat_id,
            message.role,
            message.content,
            message.tool_calls,
            message.tool_call_id,
            message.name,
            message.reasoning,
            message.created_at,
        ],
    )?;
    Ok(())
}

pub fn get_messages_by_chat(conn: &Connection, chat_id: &str) -> SqlResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, chat_id, role, content, tool_calls, tool_call_id, name, reasoning, created_at
         FROM messages
         WHERE chat_id = ?1
         ORDER BY created_at ASC"
    )?;
    
    let message_iter = stmt.query_map(params![chat_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            tool_calls: row.get(4)?,
            tool_call_id: row.get(5)?,
            name: row.get(6)?,
            reasoning: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    
    let mut messages = Vec::new();
    for message in message_iter {
        messages.push(message?);
    }
    Ok(messages)
}

pub fn get_last_message_by_chat(conn: &Connection, chat_id: &str) -> SqlResult<Option<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, chat_id, role, content, tool_calls, tool_call_id, name, reasoning, created_at
         FROM messages
         WHERE chat_id = ?1
         ORDER BY created_at DESC
         LIMIT 1"
    )?;
    
    let message_iter = stmt.query_map(params![chat_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            chat_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            tool_calls: row.get(4)?,
            tool_call_id: row.get(5)?,
            name: row.get(6)?,
            reasoning: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    
    for message in message_iter {
        return Ok(Some(message?));
    }
    Ok(None)
}

pub fn get_message_count_by_chat(conn: &Connection, chat_id: &str) -> SqlResult<i32> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM messages WHERE chat_id = ?1"
    )?;
    
    let count: i32 = stmt.query_row(params![chat_id], |row| {
        Ok(row.get(0)?)
    })?;
    
    Ok(count)
}

