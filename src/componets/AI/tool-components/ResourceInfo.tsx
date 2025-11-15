import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import { formatDateTime } from '../../../utils/format'

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
    status,
    created_at,
    updated_at,
    task_count,
  } = props

  return (
    <div className="resource-info-component bg-base-200 rounded-lg p-4 border border-base-300">
      <div className="text-sm font-semibold text-base-content mb-3">资源信息</div>
      <div className="space-y-4 text-sm">
        {/* 资源名称 */}
        <div className="flex flex-col">
          <span className="text-base-content/70 mb-1">名称</span>
          <span className="text-base-content font-medium">{name || '-'}</span>
        </div>

        {/* 资源类型 */}
        <div className="flex flex-col">
          <span className="text-base-content/70 mb-1">类型</span>
          <span className="text-base-content">
            <span className={`badge badge-sm ${resource_type === 'audio' ? 'badge-info' : 'badge-primary'}`}>
              {resource_type === 'audio' ? '音频' : '视频'}
            </span>
          </span>
        </div>

        {/* 状态 */}
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

        {/* 文件路径 */}
        {file_path && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">文件路径</span>
            <span className="text-base-content/90 break-all">{file_path}</span>
          </div>
        )}

        {/* 提取的音频路径 */}
        {extracted_audio_path && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">音频路径</span>
            <span className="text-base-content/90 break-all">{extracted_audio_path}</span>
          </div>
        )}

        {/* 任务数量 */}
        {task_count !== undefined && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">任务数</span>
            <span className="text-base-content">{task_count}</span>
          </div>
        )}

        {/* 创建时间 */}
        {created_at && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">创建时间</span>
            <span className="text-base-content/90">{formatDateTime(new Date(created_at))}</span>
          </div>
        )}

        {/* 更新时间 */}
        {updated_at && (
          <div className="flex flex-col">
            <span className="text-base-content/70 mb-1">更新时间</span>
            <span className="text-base-content/90">{formatDateTime(new Date(updated_at))}</span>
          </div>
        )}

        {/* ID（隐藏但保留在 DOM 中供 AI 识别） */}
        {id && (
          <div className="hidden" data-resource-id={id} />
        )}
      </div>
    </div>
  )
}

export default ResourceInfo

