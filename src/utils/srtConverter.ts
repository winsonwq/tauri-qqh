import { TranscriptionResultJson, TranscriptionSegment } from '../models/TranscriptionResult';

/**
 * 将时间戳转换为SRT格式的时间字符串 (HH:MM:SS,mmm)
 * @param timeStr 时间字符串，格式可能是 HH:MM:SS,mmm 或其他格式
 * @returns SRT格式的时间字符串
 */
function formatTimeForSRT(timeStr: string): string {
  // 如果已经是正确的格式，直接返回
  if (/^\d{2}:\d{2}:\d{2},\d{3}$/.test(timeStr)) {
    return timeStr;
  }

  // 尝试解析不同的时间格式
  // 格式1: HH:MM:SS,mmm
  const match1 = timeStr.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (match1) {
    return timeStr;
  }

  // 格式2: 秒数（浮点数）
  const seconds = parseFloat(timeStr);
  if (!isNaN(seconds)) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
  }

  // 如果无法解析，尝试使用原始字符串（可能已经是正确格式）
  return timeStr;
}

/**
 * 将转写结果转换为SRT格式
 * @param jsonData 转写结果的JSON数据
 * @returns SRT格式的字符串
 */
export function convertToSRT(jsonData: TranscriptionResultJson): string {
  if (!jsonData.transcription || jsonData.transcription.length === 0) {
    return '';
  }

  const segments: TranscriptionSegment[] = jsonData.transcription;
  const srtLines: string[] = [];

  segments.forEach((segment, index) => {
    const sequence = index + 1;
    const startTime = formatTimeForSRT(segment.timestamps.from);
    const endTime = formatTimeForSRT(segment.timestamps.to);
    const text = segment.text.trim();

    // SRT格式：
    // 序号
    // 开始时间 --> 结束时间
    // 文本内容
    // 空行
    srtLines.push(
      String(sequence),
      `${startTime} --> ${endTime}`,
      text,
      ''
    );
  });

  return srtLines.join('\n');
}

