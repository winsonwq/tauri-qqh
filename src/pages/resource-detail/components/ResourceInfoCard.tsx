import Player from '../../../componets/Player'
import { TranscriptionResource } from '../../../models'
import { HiTrash } from 'react-icons/hi2'

interface ResourceInfoCardProps {
  resource: TranscriptionResource
  audioSrc: string | null
  onAudioError: (error: string) => void
  onDelete?: () => void
}

const ResourceInfoCard = ({
  resource,
  audioSrc,
  onAudioError,
  onDelete,
}: ResourceInfoCardProps) => {
  return (
    <div className="h-full flex flex-col p-6">
      {/* 音频预览 */}
      <div className="mb-4 pb-4 border-b border-base-300">
        {audioSrc ? (
          <div className="space-y-2">
            <Player
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
          {onDelete && (
            <button
              className="btn btn-sm btn-error btn-ghost flex-shrink-0"
              onClick={onDelete}
              title="删除资源"
            >
              <HiTrash className="w-4 h-4" />
            </button>
          )}
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
}

export default ResourceInfoCard

