import { memo, useMemo, useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import Plyr from 'plyr-react'
import 'plyr-react/plyr.css'
import type { Options } from 'plyr'
import type PlyrInstance from 'plyr'
import { isUrl, convertToEmbedUrl } from '../utils/urlUtils'

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

    // 检测是否是 URL 资源
    const isUrlResource = useMemo(() => isUrl(src), [src])
    
    // 如果是 URL 资源，转换为嵌入 URL（初始状态，不包含时间参数，不自动播放）
    const initialEmbedUrl = useMemo(() => {
      if (isUrlResource && type === 'video') {
        return convertToEmbedUrl(src, undefined, false)
      }
      return null
    }, [isUrlResource, src, type])
    
    // 使用 state 来存储当前的 embedUrl（可以包含时间参数）
    const [embedUrl, setEmbedUrl] = useState<string | null>(initialEmbedUrl)
    
    // 当 src 改变时，重置 embedUrl
    useEffect(() => {
      setEmbedUrl(initialEmbedUrl)
    }, [initialEmbedUrl])

    // 暴露播放器控制方法
    useImperativeHandle(ref, () => ({
      seek: (time: number) => {
        if (isUrlResource && type === 'video') {
          // URL 资源：通过更新 iframe src 来 seek（添加时间参数和自动播放）
          // 传入 autoplay=true 使 seek 后自动播放
          // 注意：不传入 mute，让视频尝试有声音自动播放
          // 如果浏览器阻止，用户需要手动点击播放
          const newEmbedUrl = convertToEmbedUrl(src, time, true, false)
          if (newEmbedUrl) {
            setEmbedUrl(newEmbedUrl)
          }
          return
        }
        // 本地文件资源：直接控制播放器
        const player = plyrInstanceRef.current
        if (player) {
          player.currentTime = time
        }
      },
      getCurrentTime: () => {
        // iframe 嵌入的视频无法直接获取时间，返回 0
        if (isUrlResource) {
          return 0
        }
        return plyrInstanceRef.current?.currentTime ?? 0
      },
      onTimeUpdate: (callback: (time: number) => void) => {
        // iframe 嵌入的视频无法监听时间更新，返回空清理函数
        if (isUrlResource) {
          return () => {}
        }
        timeUpdateCallbacksRef.current.add(callback)
        // 返回清理函数
        return () => {
          timeUpdateCallbacksRef.current.delete(callback)
        }
      },
    }), [isUrlResource, src, type, setEmbedUrl])

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

    // 如果是 URL 资源（视频），使用 iframe 嵌入
    if (isUrlResource && type === 'video') {
      if (embedUrl) {
        // 有有效的嵌入 URL，使用 iframe
        // 使用 key 属性确保当 embedUrl 改变时 iframe 会重新加载
        return (
          <div className={className}>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}> {/* 16:9 比例 */}
              <iframe
                key={embedUrl}
                src={embedUrl}
                className="absolute top-0 left-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="视频播放器"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => {
                  // iframe 加载成功
                  console.log('视频 iframe 加载成功')
                }}
                onError={(e) => {
                  // iframe 加载失败
                  console.error('视频 iframe 加载失败:', e)
                }}
              />
            </div>
          </div>
        )
      } else {
        // 无法转换为嵌入 URL，显示提示信息
        return (
          <div className={className}>
            <div className="flex items-center justify-center h-64 bg-base-200 rounded-lg">
              <div className="text-center">
                <p className="text-base-content/70 mb-2">无法嵌入此视频链接</p>
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  在新窗口中打开
                </a>
              </div>
            </div>
          </div>
        )
      }
    }

    // 本地文件资源，使用 Plyr
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
