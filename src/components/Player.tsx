import { memo, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import Plyr from 'plyr-react'
import 'plyr-react/plyr.css'
import type { Options } from 'plyr'
import type PlyrInstance from 'plyr'

export interface PlayerRef {
  seek: (time: number) => void
  getCurrentTime: () => number
  onTimeUpdate: (callback: (time: number) => void) => () => void
}

interface PlayerProps {
  src: string
  type?: 'audio' | 'video'
  subtitleUrl?: string | null 
  onError?: (error: unknown) => void
  options?: Partial<Options>
  className?: string
}

const Player = memo(
  forwardRef<PlayerRef, PlayerProps>(
    ({
      src,
      type = 'audio',
      subtitleUrl,
      onError,
      options,
      className,
    }, ref) => {
      const plyrComponentRef = useRef<{ plyr: PlyrInstance } | null>(null)
      const plyrInstanceRef = useRef<PlyrInstance | null>(null)
      const timeUpdateCallbacksRef = useRef<Set<(time: number) => void>>(new Set())
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

    // 暴露播放器控制方法
    useImperativeHandle(ref, () => ({
      seek: (time: number) => {
        const player = plyrInstanceRef.current
        if (player) {
          player.currentTime = time
        }
      },
      getCurrentTime: () => {
        return plyrInstanceRef.current?.currentTime ?? 0
      },
      onTimeUpdate: (callback: (time: number) => void) => {
        timeUpdateCallbacksRef.current.add(callback)
        // 返回清理函数
        return () => {
          timeUpdateCallbacksRef.current.delete(callback)
        }
      },
    }), [])

    // 监听播放器实例并设置时间更新监听
    useEffect(() => {
      if (!plyrComponentRef.current) return

      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let mediaElement: HTMLMediaElement | null = null
      let handleTimeUpdate: (() => void) | null = null

      // 延迟获取播放器实例，确保组件已完全挂载
      const checkPlayer = () => {
        try {
          // 根据 plyr-react 文档，ref.current.plyr 是播放器实例
          const player = plyrComponentRef.current?.plyr
          if (!player) {
            // 如果播放器还没准备好，继续等待
            timeoutId = setTimeout(checkPlayer, 100)
            return
          }

          // 获取底层的 HTML5 媒体元素
          // Plyr 实例的 media 属性在运行时存在，但类型定义可能不完整
          const media = (player as any).media as HTMLMediaElement
          if (!media) {
            timeoutId = setTimeout(checkPlayer, 100)
            return
          }

          // 保存引用以便清理
          mediaElement = media
          plyrInstanceRef.current = player

          // 监听时间更新事件（使用 HTML5 媒体元素的标准事件）
          handleTimeUpdate = () => {
            const currentTime = media.currentTime
            timeUpdateCallbacksRef.current.forEach(callback => {
              callback(currentTime)
            })
          }

          media.addEventListener('timeupdate', handleTimeUpdate)
        } catch (err) {
          console.error('获取播放器实例失败:', err)
          // 如果出错，继续尝试
          timeoutId = setTimeout(checkPlayer, 100)
        }
      }

      // 开始检查播放器
      timeoutId = setTimeout(checkPlayer, 100)

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        if (mediaElement && handleTimeUpdate) {
          try {
            mediaElement.removeEventListener('timeupdate', handleTimeUpdate)
          } catch (err) {
            // 忽略清理错误
          }
        }
      }
    }, [src, type])

    return (
      <div className={className}>
        <Plyr
          ref={plyrComponentRef}
          source={source}
          options={mergedOptions}
          onError={onError}
        />
      </div>
    )
  },
))

Player.displayName = 'Player'

export default Player
