import Plyr from 'plyr-react'
import 'plyr-react/plyr.css'
import type { Options } from 'plyr'

interface PlayerProps {
  src: string
  type?: 'audio' | 'video'
  onError?: (error: unknown) => void
  options?: Partial<Options>
  className?: string
}

const Player = ({
  src,
  type = 'audio',
  onError,
  options,
  className,
}: PlayerProps) => {
  // 默认配置
  const defaultOptions: Options = {
    controls: [
      'play',
      'progress',
      'current-time',
      'mute',
      'settings',
    ],
    settings: ['speed'],
  }

  // 合并用户配置和默认配置
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    // 确保 controls 和 settings 正确合并
    controls: options?.controls || defaultOptions.controls,
    settings: options?.settings || defaultOptions.settings,
  }

  return (
    <div className={className}>
      <Plyr
        source={{
          type,
          sources: [
            {
              src,
            },
          ],
        }}
        options={mergedOptions}
        onError={onError}
      />
    </div>
  )
}

export default Player

