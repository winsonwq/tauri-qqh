// whisper-cli 环境状态
export interface FastWhisperStatus {
  whisper_cli_available: boolean;
  whisper_cli_path?: string;
  error?: string;
}

// 模型信息
export interface ModelInfo {
  name: string;
  size?: number;
  downloaded: boolean;
}

// 模型下载进度信息
export interface ModelDownloadProgress {
  model_name: string;
  downloaded: number;
  total?: number;
  progress: number; // 0-100
}

