import { ResourceType } from '../models'
import ResourceTypeIcon from './ResourceTypeIcon'

interface ResourceNameWithIconProps {
  resourceType: ResourceType
  name: string
  iconClassName?: string
  className?: string
}

const DEFAULT_ICON_CLASSNAME = 'w-5 h-5 flex-shrink-0 inline-block mr-1'

const ResourceNameWithIcon = ({
  resourceType,
  name,
  iconClassName,
  className,
}: ResourceNameWithIconProps) => {
  return (
    <div className={className}>
      <ResourceTypeIcon
        resourceType={resourceType}
        className={iconClassName || DEFAULT_ICON_CLASSNAME}
      />
      {name}
    </div>
  )
}

export default ResourceNameWithIcon

