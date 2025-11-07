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

