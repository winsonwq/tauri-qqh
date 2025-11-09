import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TranscriptionTask, TranscriptionTaskStatus } from '../models';
import { TranscriptionResultJson } from '../models/TranscriptionResult';
import { convertToWebVTT } from './vttConverter';

/**
 * 加载字幕：查找最新的成功转写任务并转换为 WebVTT 文件路径
 * @param tasks 转写任务列表
 * @returns Promise<string | null> 返回字幕文件的转换后路径，如果没有则返回 null
 */
export async function loadSubtitleFromTasks(
  tasks: TranscriptionTask[]
): Promise<string | null> {
  if (!tasks.length) {
    return null;
  }

  // 查找最新的成功转写任务
  const completedTasks = tasks
    .filter((t) => t.status === TranscriptionTaskStatus.COMPLETED && t.result)
    .sort((a, b) => {
      // 按完成时间降序排序，如果没有完成时间则按创建时间
      const aTime = a.completed_at || a.created_at;
      const bTime = b.completed_at || b.created_at;
      return bTime.localeCompare(aTime);
    });

  if (completedTasks.length === 0) {
    return null;
  }

  // 使用最新的成功转写任务
  const latestTask = completedTasks[0];

  try {
    // 读取转写结果
    const content = await invoke<string>('read_transcription_result', {
      taskId: latestTask.id,
    });

    // 解析 JSON 并转换为 WebVTT
    try {
      const jsonData: TranscriptionResultJson = JSON.parse(content);
      if (jsonData.transcription && jsonData.transcription.length > 0) {
        const vttContent = convertToWebVTT(jsonData);

        // 在 Rust 端创建临时字幕文件并返回路径
        const subtitleFilePath = await invoke<string>('create_temp_subtitle_file', {
          taskId: latestTask.id,
          vttContent: vttContent,
        });

        // 使用 convertFileSrc 转换为可访问的 URL
        const subtitleUrl = convertFileSrc(subtitleFilePath);
        return subtitleUrl;
      }
    } catch (parseErr) {
      console.warn('解析转写结果失败，无法生成字幕:', parseErr);
    }
  } catch (err) {
    console.error('加载字幕失败:', err);
  }

  return null;
}

