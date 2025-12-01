import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import { formatDateTime } from '../../../utils/format'

interface TaskInfoProps {
  props: ComponentProps
}

// 状态值转换为中文
const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'completed': '已完成',
    'processing': '处理中',
    'failed': '失败',
    'pending': '待处理',
  }
  return statusMap[status] || status
}

const TaskInfo: React.FC<TaskInfoProps> = ({ props }) => {
  const {
    id,
    resource_id,
    resource_name,
    resource_type,
    status,
    created_at,
    completed_at,
    result,
    error,
    transcription_content,
    has_transcription_content,
  } = props

  return (
    <div className="task-info-component bg-base-100 rounded-lg p-4 border border-base-300">
      <div className="space-y-3 text-sm">
        {/* 任务状态和时间 */}
        {(status || completed_at) && (
          <div className="flex items-center gap-2 flex-wrap">
            {completed_at && (
              <span className="text-xs text-base-content/60">
                {formatDateTime(new Date(completed_at))}
              </span>
            )}
            {status && (
              <span className={`badge badge-sm ${
                status === 'completed' ? 'badge-success' :
                status === 'processing' ? 'badge-warning' :
                status === 'failed' ? 'badge-error' :
                'badge-neutral'
              }`}>
                {getStatusText(status)}
              </span>
            )}
          </div>
        )}

        {/* 关联资源 */}
        {resource_name && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-base-content">{resource_name}</span>
            {resource_type && (
              <span className={`badge badge-sm ${resource_type === 'audio' ? 'badge-info' : 'badge-primary'}`}>
                {resource_type === 'audio' ? '音频' : '视频'}
              </span>
            )}
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="text-error break-all text-xs bg-error/10 p-2 rounded">
            {error}
          </div>
        )}

        {/* ID（隐藏但保留在 DOM 中供 AI 识别） */}
        {id && (
          <div className="hidden" data-task-id={id} />
        )}
        {resource_id && (
          <div className="hidden" data-resource-id={resource_id} />
        )}
      </div>
    </div>
  )
}

export default TaskInfo

