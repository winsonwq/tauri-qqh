import { memo, useMemo, RefObject } from 'react'
import Player, { PlayerRef } from '../../../components/Player'
import { TranscriptionResource, ResourceType } from '../../../models'
import { useAppSelector } from '../../../redux/hooks'

interface ResourceInfoCardProps {
  resource: TranscriptionResource
  audioSrc: string | null
  videoSrc: string | null
  subtitleUrl?: string | null // WebVTT 字幕的 URL
  onAudioError: (error: string) => void
  onVideoError: (error: string) => void
  playerRef?: RefObject<PlayerRef | null>
}

const ResourceInfoCard = memo(({
  resource,
  audioSrc,
  videoSrc,
  subtitleUrl,
  onAudioError,
  onVideoError,
  playerRef,
}: ResourceInfoCardProps) => {
  const extractionState = useAppSelector(
    (state) => state.videoExtraction.extractions[resource.id]
  )
  const isExtracting = extractionState?.isExtracting ?? false
  const isVideo = resource.resource_type === ResourceType.VIDEO
  
  // 使用 useMemo 稳定 Player 的 props
  const playerKey = useMemo(() => {
    return isVideo ? `video-${resource.id}-${videoSrc}` : `audio-${resource.id}-${audioSrc}`
  }, [isVideo, resource.id, videoSrc, audioSrc])

  return (
    <div className="h-full flex flex-col p-6">
      {/* 视频/音频预览 */}
      <div className="mb-4 pb-4 border-b border-base-300">
        {isVideo ? (
          // 视频资源：显示视频播放器
          videoSrc ? (
            <div className="space-y-2">
              <Player
                ref={playerRef}
                key={playerKey}
                src={videoSrc}
                type="video"
                subtitleUrl={subtitleUrl}
                onError={(error: unknown) => {
                  console.error('视频加载失败:', error)
                  onVideoError(
                    '视频文件无法播放，可能是文件格式不支持或文件已损坏',
                  )
                }}
              />
              {/* 提取进度显示 */}
              {isExtracting && (
                <div className="flex items-center gap-2 text-sm text-base-content/70">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>正在提取音频...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-base-content/50">
              视频文件加载中...
            </div>
          )
        ) : (
          // 音频资源：显示音频播放器
          audioSrc ? (
            <div className="space-y-2">
              <Player
                ref={playerRef}
                key={playerKey}
                src={audioSrc}
                type="audio"
                onError={(error: unknown) => {
                  console.error('音频加载失败:', error)
                  onAudioError(
                    '音频文件无法播放，可能是文件格式不支持或文件已损坏',
                  )
                }}
              />
            </div>
          ) : (
            <div className="text-sm text-base-content/50">
              音频文件加载中...
            </div>
          )
        )}
      </div>

      {/* 基础信息 */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 text-base-content break-words flex-1 min-w-0">
            <span className="font-semibold text-xl truncate block tooltip tooltip-top">
              {resource.name}
            </span>
            <div className="text-xs text-base-content/60 break-all">
              <span
                className="truncate block tooltip tooltip-top"
                data-tip={resource.file_path}
              >
                {resource.file_path}
              </span>
            </div>
          </div>
        </div>

        <div className="text-sm text-base-content/50">
          <span className="mr-1">创建于</span>
          {new Date(resource.created_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
})

ResourceInfoCard.displayName = 'ResourceInfoCard'

export default ResourceInfoCard
