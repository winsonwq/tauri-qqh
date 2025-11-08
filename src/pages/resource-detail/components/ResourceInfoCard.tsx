import { TranscriptionResource } from '../../../models'

interface ResourceInfoCardProps {
  resource: TranscriptionResource
  audioSrc: string | null
  onAudioError: (error: string) => void
}

const ResourceInfoCard = ({
  resource,
  audioSrc,
  onAudioError,
}: ResourceInfoCardProps) => {
  return (
    <div className="card bg-base-100">
      <div className="card-body">
        {/* 音频预览 */}
        <div className="mb-4 pb-4 border-b border-base-300">
          {audioSrc ? (
            <div className="space-y-2">
              <audio
                src={audioSrc}
                controls
                className="w-full"
                onError={(e) => {
                  console.error('音频加载失败:', e)
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
          <div className="flex flex-col gap-1 text-base-content break-words">
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
    </div>
  )
}

export default ResourceInfoCard
