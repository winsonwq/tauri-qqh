import { TranscriptionResultJson, TranscriptionSegment } from '../models/TranscriptionResult';

/**
 * 将时间戳转换为 WebVTT 格式的时间字符串 (HH:MM:SS.mmm)
 * @param timeStr 时间字符串，格式可能是 HH:MM:SS,mmm 或其他格式
 * @returns WebVTT 格式的时间字符串
 */
function formatTimeForVTT(timeStr: string): string {
  // 如果已经是正确的 WebVTT 格式，直接返回
  if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(timeStr)) {
    return timeStr;
  }

  // 尝试解析不同的时间格式
  // 格式1: HH:MM:SS,mmm (SRT 格式) -> 转换为 HH:MM:SS.mmm
  const match1 = timeStr.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (match1) {
    return `${match1[1]}:${match1[2]}:${match1[3]}.${match1[4]}`;
  }

  // 格式2: HH:MM:SS.mmm (已经是 WebVTT 格式)
  const match2 = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (match2) {
    return timeStr;
  }

  // 格式3: 秒数（浮点数）
  const seconds = parseFloat(timeStr);
  if (!isNaN(seconds)) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }

  // 如果无法解析，尝试使用原始字符串并替换逗号为点
  return timeStr.replace(',', '.');
}

/**
 * 将转写结果转换为 WebVTT 格式
 * @param jsonData 转写结果的JSON数据
 * @returns WebVTT 格式的字符串
 */
export function convertToWebVTT(jsonData: TranscriptionResultJson): string {
  if (!jsonData.transcription || jsonData.transcription.length === 0) {
    return 'WEBVTT\n\n';
  }

  const segments: TranscriptionSegment[] = jsonData.transcription;
  const vttLines: string[] = ['WEBVTT', ''];

  segments.forEach((segment) => {
    const startTime = formatTimeForVTT(segment.timestamps.from);
    const endTime = formatTimeForVTT(segment.timestamps.to);
    const text = segment.text.trim();

    // WebVTT 格式：
    // 开始时间 --> 结束时间
    // 文本内容
    // 空行
    vttLines.push(
      `${startTime} --> ${endTime}`,
      text,
      ''
    );
  });

  return vttLines.join('\n');
}

