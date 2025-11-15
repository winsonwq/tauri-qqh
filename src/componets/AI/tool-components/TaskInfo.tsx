import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import { formatDateTime } from '../../../utils/format'

interface TaskInfoProps {
  props: ComponentProps
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
    log,
    params,
  } = props

  return (
    <div className="task-info-component bg-base-100 rounded-lg p-4 border border-base-300">
      <div className="text-sm font-semibold text-base-content mb-3">任务信息</div>
      <div className="space-y-4 text-sm">
        {/* 任务状态 */}
        <div className="flex flex-col">
          <span className="text-base-content/70 mb-1">状态</span>
          <span className="text-base-content">
            <span className={`badge badge-sm ${
              status === 'completed' ? 'badge-success' :
              status === 'processing' ? 'badge-warning' :
              status === 'failed' ? 'badge-error' :
              'badge-neutral'
            }`}>
              {status || '-'}
            </span>
          </span>
        </div>

        {/* 关联资源 */}
        {resource_name && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">资源</span>
            <span className="text-base-content">
              <span className="font-medium">{resource_name}</span>
              {resource_type && (
                <span className={`badge badge-sm ml-2 ${resource_type === 'audio' ? 'badge-info' : 'badge-primary'}`}>
                  {resource_type === 'audio' ? '音频' : '视频'}
                </span>
              )}
            </span>
          </div>
        )}

        {/* 创建时间 */}
        {created_at && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">创建时间</span>
            <span className="text-base-content/90">{formatDateTime(new Date(created_at))}</span>
          </div>
        )}

        {/* 完成时间 */}
        {completed_at && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">完成时间</span>
            <span className="text-base-content/90">{formatDateTime(new Date(completed_at))}</span>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">错误</span>
            <span className="text-error break-all">{error}</span>
          </div>
        )}

        {/* 结果 */}
        {result && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">结果</span>
            <div>
              {typeof result === 'string' ? (
                <pre className="text-xs text-base-content/90 whitespace-pre-wrap break-words bg-base-300 p-2 rounded">
                  {result}
                </pre>
              ) : (
                <pre className="text-xs text-base-content/90 whitespace-pre-wrap break-words bg-base-300 p-2 rounded">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* 日志 */}
        {log && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">日志</span>
            <div>
              <pre className="text-xs text-base-content/90 whitespace-pre-wrap break-words bg-base-300 p-2 rounded max-h-48 overflow-auto">
                {typeof log === 'string' ? log : JSON.stringify(log, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* 参数 */}
        {params && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">参数</span>
            <div>
              <pre className="text-xs text-base-content/90 whitespace-pre-wrap break-words bg-base-300 p-2 rounded max-h-48 overflow-auto">
                {typeof params === 'string' ? params : JSON.stringify(params, null, 2)}
              </pre>
            </div>
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

