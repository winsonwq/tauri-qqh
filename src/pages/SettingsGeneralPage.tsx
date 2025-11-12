import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { openPath } from '@tauri-apps/plugin-opener'
import { ModelInfo, ModelDownloadProgress } from '../models'
import { HiXCircle, HiArrowDownTray, HiFolderOpen } from 'react-icons/hi2'
import { useMessage } from '../componets/Toast'

const SettingsGeneralPage = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsDir, setModelsDir] = useState<string>('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)

  // 加载模型列表
  const loadModels = async () => {
    try {
      setLoadingModels(true)
      const [modelsList, dir] = await Promise.all([
        invoke<ModelInfo[]>('get_downloaded_models'),
        invoke<string>('get_models_dir'),
      ])
      setModels(modelsList)
      setModelsDir(dir)
    } catch (err) {
      console.error('加载模型列表失败:', err)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    loadModels()
  }, [])

  // 打开模型文件夹
  const handleOpenFolder = async () => {
    try {
      if (modelsDir) {
        await openPath(modelsDir)
      }
    } catch (err) {
      console.error('打开文件夹失败:', err)
    }
  }

  // 获取已下载的模型列表
  const downloadedModels = models.filter((model) => model.downloaded)

  return (
    <div className="space-y-6 p-6 h-full">
      {/* Whisper 模型管理 */}
      <div className="card card-border bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title">Whisper 模型管理</h2>
          {loadingModels ? (
            <div className="flex items-center justify-center py-8">
              <span className="loading loading-spinner loading-md"></span>
              <span className="ml-2">加载模型列表中...</span>
            </div>
          ) : (
            <div>
              {downloadedModels.length === 0 ? (
                <div className="text-center py-8 text-base-content/50">
                  <p>暂无已下载的模型</p>
                  <p className="text-sm mt-2">点击【模型下载】按钮下载模型</p>
                </div>
              ) : (
                <p className="text-base-content/70">
                  已下载的模型：
                  {downloadedModels.map((model, index) => (
                    <span key={model.name}>
                      {model.name}
                      {index < downloadedModels.length - 1 && ' / '}
                    </span>
                  ))}
                </p>
              )}
              <div className="flex items-center gap-2 mt-4">
                <button
                  className="btn"
                  onClick={() => setShowDownloadModal(true)}
                  title="模型下载"
                >
                  <HiArrowDownTray className="h-4 w-4" />
                  <span className="ml-1">模型下载</span>
                </button>
                <button
                  className="btn"
                  onClick={handleOpenFolder}
                  title="打开文件夹"
                >
                  <HiFolderOpen className="h-4 w-4" />
                  <span className="ml-1">打开文件夹</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 模型下载弹出框 */}
      {showDownloadModal && (
        <ModelDownloadModal
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
          onModelDownloaded={loadModels}
        />
      )}
    </div>
  )
}

// 模型下载弹出框组件
interface ModelDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  onModelDownloaded: () => void
}

const ModelDownloadModal = ({
  isOpen,
  onClose,
  onModelDownloaded,
}: ModelDownloadModalProps) => {
  const message = useMessage()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelDownloadProgress>>({})
  const [error, setError] = useState<string | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)

  // 加载模型列表
  const loadModels = async () => {
    try {
      setLoadingModels(true)
      const modelsList = await invoke<ModelInfo[]>('get_downloaded_models')
      setModels(modelsList)
    } catch (err) {
      console.error('加载模型列表失败:', err)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadModels()
    }
    
    // 清理函数：关闭事件监听
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [isOpen])

  // 下载模型
  const handleDownloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName)
      setError(null)
      setDownloadProgress(prev => ({
        ...prev,
        [modelName]: {
          model_name: modelName,
          downloaded: 0,
          total: undefined,
          progress: 0,
        }
      }))
      
      // 清理之前的事件监听
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      
      // 监听下载进度事件
      const progressEventName = `model-download-progress-${modelName}`
      const unlisten = await listen<ModelDownloadProgress>(progressEventName, (event) => {
        const progress = event.payload
        setDownloadProgress(prev => ({
          ...prev,
          [modelName]: progress
        }))
      })
      unlistenRef.current = unlisten
      
      // 开始下载
      await invoke<string>('download_model', { modelName })
      
      // 清理事件监听
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      
      // 清除进度信息
      setDownloadProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[modelName]
        return newProgress
      })
      
      // 显示成功 toast
      message.success(`模型 ${modelName} 下载成功`)
      // 重新加载模型列表
      await loadModels()
      // 通知父组件刷新
      onModelDownloaded()
    } catch (err) {
      console.error('下载模型失败:', err)
      const errorMsg = err instanceof Error ? err.message : '下载模型失败'
      setError(errorMsg)
      message.error(`模型 ${modelName} 下载失败: ${errorMsg}`)
      
      // 清理事件监听
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      
      // 清除进度信息
      setDownloadProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[modelName]
        return newProgress
      })
    } finally {
      setDownloadingModel(null)
    }
  }

  // 格式化文件大小
  const formatSize = (bytes?: number) => {
    if (!bytes) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
  
  // 获取模型的下载进度
  const getModelProgress = (modelName: string): ModelDownloadProgress | undefined => {
    return downloadProgress[modelName]
  }

  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">模型下载</h3>

        {loadingModels ? (
          <div className="flex items-center justify-center py-8">
            <span className="loading loading-spinner loading-md"></span>
            <span className="ml-2">加载模型列表中...</span>
          </div>
        ) : (
          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {models.map((model) => {
              const progress = getModelProgress(model.name)
              const isDownloading = downloadingModel === model.name && progress !== undefined
              
              return (
                <div
                  key={model.name}
                  className="flex flex-col p-3 bg-base-200 rounded-lg gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{model.name}</div>
                      <div className="text-sm text-base-content/70">
                        {model.downloaded
                          ? `已下载 (${formatSize(model.size)})`
                          : isDownloading && progress
                          ? `下载中... ${progress.progress.toFixed(1)}%`
                          : '未下载'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {model.downloaded ? (
                        <div className="badge badge-success">已安装</div>
                      ) : (
                        <button
                          className={`btn ${
                            downloadingModel === model.name ? 'loading' : ''
                          }`}
                          onClick={() => handleDownloadModel(model.name)}
                          disabled={downloadingModel !== null}
                          title="下载模型"
                        >
                          {downloadingModel !== model.name && (
                            <HiArrowDownTray className="h-4 w-4" />
                          )}
                          <span className="ml-1">下载</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {isDownloading && progress && (
                    <div className="w-full">
                      <progress
                        className="progress progress-primary w-full"
                        value={progress.progress}
                        max="100"
                      ></progress>
                      <div className="flex justify-between text-xs text-base-content/60 mt-1">
                        <span>{formatSize(progress.downloaded)}</span>
                        {progress.total && (
                          <span>{formatSize(progress.total)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="alert alert-error mt-4">
            <HiXCircle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}

export default SettingsGeneralPage
