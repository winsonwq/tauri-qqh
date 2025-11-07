// 转写结果 JSON 数据类型定义

export interface TranscriptionResultJson {
  systeminfo?: string;
  model?: TranscriptionModelInfo;
  params?: TranscriptionResultParams;
  result?: TranscriptionResultInfo;
  transcription?: TranscriptionSegment[];
}

export interface TranscriptionModelInfo {
  type: string;
  multilingual: boolean;
  vocab: number;
  audio: TranscriptionModelLayer;
  text: TranscriptionModelLayer;
  mels: number;
  ftype: number;
}

export interface TranscriptionModelLayer {
  ctx: number;
  state: number;
  head: number;
  layer: number;
}

export interface TranscriptionResultParams {
  model: string;
  language: string;
  translate: boolean;
}

export interface TranscriptionResultInfo {
  language: string;
}

export interface TranscriptionSegment {
  timestamps: TranscriptionTimestamps;
  offsets: TranscriptionOffsets;
  text: string;
}

export interface TranscriptionTimestamps {
  from: string;
  to: string;
}

export interface TranscriptionOffsets {
  from: number;
  to: number;
}

