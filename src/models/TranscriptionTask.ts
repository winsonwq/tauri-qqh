// 转写任务模型
export interface TranscriptionTask {
  id: string; // 唯一标识符
  resource_id: string; // 关联的转写资源 ID
  status: TranscriptionTaskStatus; // 转写状态
  created_at: string; // 转写时间（创建时间）
  completed_at?: string; // 完成时间
  result?: string; // 转写结果（SRT 内容或文件路径）
  error?: string; // 错误信息
  params: TranscriptionParams; // 转写参数
}

// 转写任务状态枚举
export enum TranscriptionTaskStatus {
  PENDING = 'pending', // 待处理
  RUNNING = 'running', // 运行中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
}

// 转写参数
export interface TranscriptionParams {
  model?: string; // 模型名称，如 'base', 'small', 'medium', 'large'
  language?: string; // 语言代码，如 'zh', 'en'
  device?: 'cpu' | 'cuda'; // 设备类型
  compute_type?: string; // 计算类型
  beam_size?: number; // beam size
  best_of?: number; // best of
  patience?: number; // patience
  condition_on_previous_text?: boolean; // 是否基于前文
  initial_prompt?: string; // 初始提示
  word_timestamps?: boolean; // 是否包含词级时间戳
  temperature?: number; // 温度参数
  compression_ratio_threshold?: number; // 压缩比阈值
  log_prob_threshold?: number; // 对数概率阈值
  no_speech_threshold?: number; // 无语音阈值
}

