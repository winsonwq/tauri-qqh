import { useCallback, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import {
  ResourceType,
  TranscriptionResource,
  TranscriptionTask,
} from '../../../models';
import { loadSubtitleFromTasks } from '../../../utils/subtitleUtils';

export type MessageApi = {
  success: (content: string, duration?: number) => void;
  error: (content: string, duration?: number) => void;
  warning: (content: string, duration?: number) => void;
  info: (content: string, duration?: number) => void;
};

type UseResourceMediaParams = {
  resourceId: string | null;
  message: MessageApi;
};

type UseResourceMediaResult = {
  resource: TranscriptionResource | null;
  audioSrc: string | null;
  videoSrc: string | null;
  subtitleUrl: string | null;
  setResourceData: (resource: TranscriptionResource | null) => Promise<void>;
  refreshResource: () => Promise<TranscriptionResource | null>;
  refreshSubtitle: (
    tasks: TranscriptionTask[],
    resourceOverride?: TranscriptionResource | null
  ) => Promise<void>;
  clearMedia: () => void;
};

const createFileSrc = (path: string) => {
  try {
    return convertFileSrc(path);
  } catch (err) {
    console.error('转换文件路径失败:', err);
    return null;
  }
};

const useResourceMedia = ({
  resourceId,
  message,
}: UseResourceMediaParams): UseResourceMediaResult => {
  const [resource, setResource] = useState<TranscriptionResource | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

  const clearMedia = useCallback(() => {
    setAudioSrc(null);
    setVideoSrc(null);
    setSubtitleUrl(null);
  }, []);

  const configureMediaFromResource = useCallback(
    async (current: TranscriptionResource | null) => {
      if (!current) {
        clearMedia();
        return;
      }

      try {
        const fileExists = await exists(current.file_path);
        if (!fileExists) {
          message.error(`文件不存在: ${current.file_path}`);
          clearMedia();
          return;
        }
      } catch (err) {
        console.error('检查文件失败:', err);
        message.error(`无法访问文件: ${current.file_path}`);
        clearMedia();
        return;
      }

      if (current.resource_type === ResourceType.VIDEO) {
        const videoPath = createFileSrc(current.file_path);
        setVideoSrc(videoPath);
        setAudioSrc(null);

        if (current.extracted_audio_path) {
          try {
            const audioExists = await exists(current.extracted_audio_path);
            if (audioExists) {
              const audioPath = createFileSrc(current.extracted_audio_path);
              setAudioSrc(audioPath);
            } else {
              console.warn('提取的音频文件不存在:', current.extracted_audio_path);
            }
          } catch (err) {
            console.error('检查提取的音频文件失败:', err);
          }
        }
      } else {
        const audioPath = createFileSrc(current.file_path);
        if (!audioPath) {
          message.error('无法创建音频播放器');
        }
        setAudioSrc(audioPath);
        setVideoSrc(null);
      }
    },
    [clearMedia, message]
  );

  const setResourceData = useCallback(
    async (current: TranscriptionResource | null) => {
      setResource(current);
      await configureMediaFromResource(current);
    },
    [configureMediaFromResource]
  );

  const refreshResource = useCallback(async () => {
    if (!resourceId) {
      await setResourceData(null);
      return null;
    }

    try {
      const resources = await invoke<TranscriptionResource[]>(
        'get_transcription_resources'
      );
      const found = resources.find((item) => item.id === resourceId) || null;
      await setResourceData(found);
      return found;
    } catch (err) {
      console.error('加载资源失败:', err);
      message.error(err instanceof Error ? err.message : '加载资源失败');
      await setResourceData(null);
      return null;
    }
  }, [message, resourceId, setResourceData]);

  const refreshSubtitle = useCallback(
    async (
      tasks: TranscriptionTask[],
      resourceOverride?: TranscriptionResource | null
    ) => {
      const targetResource = resourceOverride ?? resource;
      if (!targetResource || targetResource.resource_type !== ResourceType.VIDEO) {
        setSubtitleUrl(null);
        return;
      }
      if (tasks.length === 0) {
        setSubtitleUrl(null);
        return;
      }
      const url = await loadSubtitleFromTasks(tasks);
      setSubtitleUrl(url);
    },
    [resource?.id, resource?.resource_type] // 只依赖关键属性，避免对象引用变化
  );

  return {
    resource,
    audioSrc,
    videoSrc,
    subtitleUrl,
    setResourceData,
    refreshResource,
    refreshSubtitle,
    clearMedia,
  };
};

export default useResourceMedia;


