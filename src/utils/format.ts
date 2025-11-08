import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

/**
 * 格式化时间字符串
 * @param timeStr 时间字符串，格式：HH:MM:SS,mmm
 * @returns 格式化后的时间字符串
 */
export const formatSubtitleTime = (timeStr: string) => {
  // 解析时间格式：HH:MM:SS,mmm
  const time = dayjs(timeStr, 'HH:mm:ss,SSS')
  
  // 如果小时为0，只显示分钟和秒
  if (time.hour() === 0) {
    return time.format('mm:ss')
  }
  
  // 如果小时不为0，显示完整格式
  return time.format('HH:mm:ss')
}

