import { ResourceType } from '../models'
import { HiVideoCamera, HiSpeakerWave } from 'react-icons/hi2'

interface ResourceTypeIconProps {
  resourceType: ResourceType
  className?: string
}

const ResourceTypeIcon = ({ resourceType, className = '' }: ResourceTypeIconProps) => {
  const baseClasses = className.replace(/text-(primary|secondary)/g, '').trim()
  const colorClass = resourceType === ResourceType.VIDEO ? 'text-primary' : 'text-secondary'
  const finalClassName = `${baseClasses} ${colorClass}`.trim()

  return resourceType === ResourceType.VIDEO ? (
    <HiVideoCamera className={finalClassName} />
  ) : (
    <HiSpeakerWave className={finalClassName} />
  )
}

export default ResourceTypeIcon

