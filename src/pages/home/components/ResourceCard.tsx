import { TranscriptionResource } from '../../../models';

interface ResourceCardProps {
  resource: TranscriptionResource;
  onClick: (resourceId: string) => void;
}

const ResourceCard = ({ resource, onClick }: ResourceCardProps) => {
  return (
    <div
      className="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
      onClick={() => onClick(resource.id)}
    >
      <div className="card-body">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="card-title text-base truncate" title={resource.name}>
              {resource.name}
            </h3>
          </div>
        </div>

        <div className="text-xs text-base-content/50 mb-4 line-clamp-2" title={resource.file_path}>
          {resource.file_path}
        </div>

        <div className="text-xs text-base-content/50 mb-4">
          创建时间: {new Date(resource.created_at).toLocaleString('zh-CN')}
        </div>
      </div>
    </div>
  );
};

export default ResourceCard;

