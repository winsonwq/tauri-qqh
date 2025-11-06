// 转写资源模型
export interface TranscriptionResource {
  id: string; // 唯一标识符
  name: string; // 资源名称
  file_path: string; // 文件地址
  status: TranscriptionStatus; // 转写状态
  created_at: string; // 创建时间
  updated_at: string; // 更新时间
}

// 转写状态枚举
export enum TranscriptionStatus {
  PENDING = 'pending', // 待转写
  PROCESSING = 'processing', // 转写中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
}

