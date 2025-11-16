import { TranscriptionResource } from '../../../models'
import { HiFolder, HiClock, HiTrash } from 'react-icons/hi2'
import Tooltip from '../../../componets/Tooltip'
import ResourceNameWithIcon from '../../../componets/ResourceNameWithIcon'
import { formatDateTime } from '../../../utils/format'

interface ResourceCardProps {
  resource: TranscriptionResource
  onClick: (resourceId: string) => void
  onDelete?: (resource: TranscriptionResource) => void
}

const ResourceCard = ({ resource, onClick, onDelete }: ResourceCardProps) => {
  return (
    <div
      className="card card-border bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group"
      onClick={() => onClick(resource.id)}
    >
      {onDelete && (
        <button
          type="button"
          className="btn btn-xs btn-ghost text-error absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-base-100/90 backdrop-blur z-10 transition-opacity w-6 h-6 p-0 flex items-center justify-center"
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onDelete(resource)
          }}
          aria-label="删除资源"
        >
          <HiTrash className="w-4 h-4" />
        </button>
      )}
      <div className="card-body flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <h3
            className="card-title text-base flex-1 min-w-0"
            title={resource.name}
          >
            <ResourceNameWithIcon
              resourceType={resource.resource_type}
              name={resource.name}
            />
          </h3>
        </div>

        <div className="mt-auto space-y-2">
          <Tooltip
            content={resource.file_path}
            className="w-full"
            contentClassName="p-4 font-mono text-xs"
          >
            <div className="text-xs text-base-content/50 flex items-center gap-1">
              <HiFolder className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{resource.file_path}</span>
            </div>
          </Tooltip>

          <div className="text-xs text-base-content/50 flex items-center gap-1">
            <HiClock className="w-3 h-3 flex-shrink-0" />
            <span>{formatDateTime(resource.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResourceCard
