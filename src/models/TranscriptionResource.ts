// 转写资源类型
export enum ResourceType {
  AUDIO = 'audio',
  VIDEO = 'video',
}

// 资源来源类型
export enum SourceType {
  FILE = 'file',
  URL = 'url',
}

// 视频平台类型
export enum Platform {
  YOUTUBE = 'youtube',
  BILIBILI = 'bilibili',
  OTHER = 'other',
}

// Topic 时间范围
export interface TopicTimeRange {
  start: number; // 开始时间（秒）
  end: number;   // 结束时间（秒）
}

// Topic 模型
export interface Topic {
  name: string;           // topic 名称
  color: string;          // 颜色（hex 格式，如 #FF5733）
  opacity: number;        // 透明度（0.0-1.0）
  time_ranges: TopicTimeRange[]; // 时间范围列表
}

// 转写资源模型
export interface TranscriptionResource {
  id: string; // 唯一标识符
  name: string; // 资源名称
  file_path: string; // 文件地址或URL链接
  resource_type: ResourceType; // 资源类型：音频或视频
  source_type?: SourceType; // 来源类型：文件或URL（默认为file，保持向后兼容）
  platform?: Platform; // 平台类型（仅URL资源有）：youtube、bilibili、other
  extracted_audio_path?: string; // 提取的音频路径（仅视频资源有）
  latest_completed_task_id?: string; // 最新一条转写成功的任务 ID
  cover_url?: string; // 封面 URL（仅URL资源有）
  created_at: string; // 创建时间
  updated_at: string; // 更新时间
}

