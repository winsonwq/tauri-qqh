import { memo, useMemo } from 'react'
import Plyr from 'plyr-react'
import 'plyr-react/plyr.css'
import type { Options } from 'plyr'

interface PlayerProps {
  src: string
  type?: 'audio' | 'video'
  subtitleUrl?: string | null 
  onError?: (error: unknown) => void
  options?: Partial<Options>
  className?: string
}

const Player = memo(
  ({
    src,
    type = 'audio',
    subtitleUrl,
    onError,
    options,
    className,
  }: PlayerProps) => {
    // 默认配置 - 使用 useMemo 稳定引用
    const defaultOptions: Options = useMemo(
      () => ({
        controls: ['play', 'progress', 'current-time', 'mute', 'settings', 'fullscreen'],
        settings: ['speed'],
      }),
      [],
    )

    // 合并用户配置和默认配置 - 使用 useMemo 稳定引用
    const mergedOptions = useMemo(() => {
      const merged = {
        ...defaultOptions,
        ...options,
        // 确保 controls 和 settings 正确合并
        controls: options?.controls || defaultOptions.controls,
        settings: options?.settings || defaultOptions.settings,
      }

      // 如果有字幕，添加到 settings 中
      if (subtitleUrl && type === 'video') {
        merged.settings = [...(merged.settings || []), 'captions']
      }

      return merged
    }, [defaultOptions, options, subtitleUrl, type])

    // 稳定 source 对象引用
    const source = useMemo(() => {
      const sourceObj: any = {
        type,
        sources: [{ src }],
      }

      // 如果有字幕，添加 tracks
      if (subtitleUrl && type === 'video') {
        sourceObj.tracks = [
          {
            kind: 'captions',
            label: '中文字幕',
            srclang: 'zh',
            src: subtitleUrl,
            default: true,
          },
        ]
      }

      return sourceObj
    }, [type, src, subtitleUrl])

    return (
      <div className={className}>
        <Plyr source={source} options={mergedOptions} onError={onError} />
      </div>
    )
  },
)

Player.displayName = 'Player'

export default Player
