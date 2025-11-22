import React from 'react'
import { ComponentProps } from '../ComponentRegistry'
import StreamJsonDisplay, { StreamJsonDisplayConfig } from './StreamJsonDisplay'

interface VerifierResponseDisplayProps {
  props: ComponentProps
}

const VerifierResponseDisplay: React.FC<VerifierResponseDisplayProps> = ({
  props,
}) => {
  // 如果 props 中已经有 config，使用它；否则创建新的 config
  const existingConfig = (props as any).config
  const config: StreamJsonDisplayConfig = existingConfig || {
    responseType: 'verifier',
    containerClassName: 'verifier-response',
  }
  
  // 如果已有 config，合并 plannerTodos
  if (existingConfig?.plannerTodos) {
    config.plannerTodos = existingConfig.plannerTodos
  }

  return <StreamJsonDisplay props={{ ...props, config }} />
}

export default VerifierResponseDisplay
