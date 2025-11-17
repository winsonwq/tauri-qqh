import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import { formatDateTime } from '../../../utils/format'
import { useAppDispatch } from '../../../redux/hooks'
import { setCurrentPage } from '../../../redux/slices/featureKeysSlice'
import { HiVideoCamera, HiSpeakerWave } from 'react-icons/hi2'

interface ResourceListProps {
  props: ComponentProps
}

interface ResourceItem {
  id: string
  name: string
  file_path: string
  resource_type: 'audio' | 'video'
  extracted_audio_path?: string
  status: string
  created_at: string
  updated_at: string
  task_count: number
}

const ResourceList: React.FC<ResourceListProps> = ({ props }) => {
  const dispatch = useAppDispatch()
  const { resources, keyword, count } = props as {
    resources: ResourceItem[]
    keyword: string
    count: number
  }

  const handleResourceClick = (resourceId: string) => {
    dispatch(setCurrentPage({ feature: 'home', page: `resource:${resourceId}` }))
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="resource-list-component bg-base-100 rounded-lg p-4 border border-base-300">
        <div className="text-sm font-semibold text-base-content mb-2">
          搜索结果
        </div>
        <div className="text-sm text-base-content/70">
          {keyword ? `未找到匹配关键词 "${keyword}" 的资源` : '暂无资源'}
        </div>
      </div>
    )
  }

  return (
    <div className="resource-list-component bg-base-100 rounded-lg p-4 border border-base-300">
      <div className="text-sm font-semibold text-base-content mb-3">
        {keyword ? `搜索结果（关键词: "${keyword}"，共 ${count} 条）` : `资源列表（共 ${count} 条）`}
      </div>
      <div className="space-y-2">
        {resources.map((resource) => (
          <div
            key={resource.id}
            onClick={() => handleResourceClick(resource.id)}
            className="bg-base-200 rounded-lg p-3 border border-base-300 hover:border-primary hover:bg-base-300 transition-all cursor-pointer flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {resource.resource_type === 'video' ? (
                <HiVideoCamera className="w-5 h-5 flex-shrink-0 text-primary" />
              ) : (
                <HiSpeakerWave className="w-5 h-5 flex-shrink-0 text-secondary" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-base-content truncate">
                  {resource.name || '-'}
                </div>
                {resource.created_at && (
                  <div className="text-xs text-base-content/60 mt-1">
                    {formatDateTime(new Date(resource.created_at))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-base-content/40 group-hover:text-primary transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
            {/* ID（隐藏但保留在 DOM 中供 AI 识别） */}
            <div className="hidden" data-resource-id={resource.id} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResourceList

