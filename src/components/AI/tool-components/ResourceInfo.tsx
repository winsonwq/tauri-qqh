import React, { useMemo, useRef } from 'react'
import { ComponentProps } from '../ComponentRegistry'
import { convertFileSrc } from '@tauri-apps/api/core'
import ResourceInfoCard from '../../../pages/resource-detail/components/ResourceInfoCard'
import { TranscriptionResource, ResourceType, SourceType } from '../../../models'
import { PlayerRef } from '../../Player'
import { isUrl } from '../../../utils/urlUtils'

interface ResourceInfoProps {
  props: ComponentProps
}

const ResourceInfo: React.FC<ResourceInfoProps> = ({ props }) => {
  const {
    id,
    name,
    file_path,
    resource_type,
    extracted_audio_path,
    latest_completed_task_id,
    created_at,
    updated_at,
    task_count,
    source_type,
  } = props

  const playerRef = useRef<PlayerRef>(null)

  // 检测是否是 URL 资源
  const isUrlResource = useMemo(() => {
    // 优先使用 source_type 字段
    if (source_type === SourceType.URL || source_type === 'url') {
      return true
    }
    // 备用方案：检测 file_path 是否是 URL
    return file_path ? isUrl(file_path) : false
  }, [source_type, file_path])

  // 将 props 转换为 TranscriptionResource 格式
  const resource: TranscriptionResource | null = useMemo(() => {
    if (!id || !name || !file_path || !resource_type) {
      return null
    }

    return {
      id,
      name,
      file_path,
      resource_type: resource_type as ResourceType,
      source_type: isUrlResource ? SourceType.URL : SourceType.FILE,
      extracted_audio_path,
      latest_completed_task_id,
      created_at: created_at || new Date().toISOString(),
      updated_at: updated_at || new Date().toISOString(),
    }
  }, [id, name, file_path, resource_type, extracted_audio_path, latest_completed_task_id, created_at, updated_at, isUrlResource])

  // 生成播放 URL
  const audioSrc = useMemo(() => {
    if (!resource) return null
    if (resource.resource_type === ResourceType.VIDEO) {
      // 视频资源使用提取的音频路径（仅文件资源）
      if (isUrlResource) {
        // URL 资源：视频资源通常不提供音频源
        return null
      }
      return resource.extracted_audio_path
        ? convertFileSrc(resource.extracted_audio_path)
        : null
    } else {
      // 音频资源
      if (isUrlResource) {
        // URL 资源：直接使用 URL
        return file_path
      }
      // 文件资源：使用 convertFileSrc 转换
      return file_path ? convertFileSrc(file_path) : null
    }
  }, [resource, file_path, isUrlResource])

  const videoSrc = useMemo(() => {
    if (!resource || resource.resource_type !== ResourceType.VIDEO) {
      return null
    }
    if (isUrlResource) {
      // URL 资源：直接使用 URL
      return file_path
    }
    // 文件资源：使用 convertFileSrc 转换
    return file_path ? convertFileSrc(file_path) : null
  }, [resource, file_path, isUrlResource])

  // 错误处理回调
  const handleAudioError = (error: string) => {
    console.error('音频加载失败:', error)
  }

  const handleVideoError = (error: string) => {
    console.error('视频加载失败:', error)
  }

  if (!resource) {
    return (
      <div className="resource-info-component bg-base-100 rounded-lg p-3 border border-base-300">
        <div className="text-sm text-base-content/70">资源信息不完整</div>
      </div>
    )
  }

  return (
    <div className="resource-info-component bg-base-100 rounded-lg border border-base-300">
      <ResourceInfoCard
        resource={resource}
        audioSrc={audioSrc}
        videoSrc={videoSrc}
        onAudioError={handleAudioError}
        onVideoError={handleVideoError}
        playerRef={playerRef}
      />
      {/* 任务数量信息 */}
      {task_count !== undefined && (
        <div className="px-6 pb-4 text-xs text-base-content/60">
          {task_count} 个任务
        </div>
      )}
      {/* ID（隐藏但保留在 DOM 中供 AI 识别） */}
      <div className="hidden" data-resource-id={id} />
    </div>
  )
}

export default ResourceInfo

