import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import StreamJsonDisplay, { StreamJsonDisplayConfig } from './StreamJsonDisplay'

interface PlannerResponseDisplayProps {
  props: ComponentProps
}

const PlannerResponseDisplay: React.FC<PlannerResponseDisplayProps> = ({
  props,
}) => {
  const config: StreamJsonDisplayConfig = {
    responseType: 'planner',
    containerClassName: 'planner-response',
  }

  return <StreamJsonDisplay props={{ ...props, config }} />
}

export default PlannerResponseDisplay
