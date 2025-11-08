import { TranscriptionResource } from '../../../models'
import { HiFolder, HiClock } from 'react-icons/hi2'
import Tooltip from '../../../componets/Tooltip'
import { formatDateTime } from '../../../utils/format'

interface ResourceCardProps {
  resource: TranscriptionResource
  onClick: (resourceId: string) => void
}

const ResourceCard = ({ resource, onClick }: ResourceCardProps) => {
  return (
    <div
      className="card card-border bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(resource.id)}
    >
      <div className="card-body flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <h3 className="card-title text-base" title={resource.name}>
            {resource.name}
          </h3>
        </div>

        <div className="mt-auto space-y-2">
          <Tooltip
            content={resource.file_path}
            className='w-full'
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
