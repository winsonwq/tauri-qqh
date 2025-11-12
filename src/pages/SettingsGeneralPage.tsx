import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { openPath } from '@tauri-apps/plugin-opener'
import { ModelInfo, ModelDownloadProgress, AIConfig } from '../models'
import { HiXCircle, HiArrowDownTray, HiFolderOpen, HiPencil, HiTrash, HiPlus, HiCheckCircle } from 'react-icons/hi2'
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title">Whisper 模型管理</h2>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setShowDownloadModal(true)}
                title="模型下载"
              >
                <HiArrowDownTray className="h-4 w-4" />
                <span className="ml-1">模型下载</span>
              </button>
              <button
                className="btn btn-sm"
                onClick={handleOpenFolder}
                title="打开文件夹"
              >
                <HiFolderOpen className="h-4 w-4" />
                <span className="ml-1">打开文件夹</span>
              </button>
            </div>
          </div>
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
            </div>
          )}
        </div>
      </div>

      {/* AI 配置管理 */}
      <AIConfigBlock />

      {/* 模型下载弹出框始终挂载以保留下载状态 */}
      <ModelDownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        onModelDownloaded={loadModels}
      />
    </div>
  )
}

// AI 配置管理组件
const AIConfigBlock = () => {
  const message = useMessage()
  const [configs, setConfigs] = useState<AIConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null)
  const [deletingConfig, setDeletingConfig] = useState<AIConfig | null>(null)

  // 加载配置列表
  const loadConfigs = async () => {
    try {
      setLoading(true)
      const configsList = await invoke<AIConfig[]>('get_ai_configs')
      setConfigs(configsList)
    } catch (err) {
      console.error('加载 AI 配置失败:', err)
      message.error('加载 AI 配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 删除配置
  const handleDelete = async (config: AIConfig) => {
    setDeletingConfig(config)
  }

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!deletingConfig) return
    try {
      await invoke('delete_ai_config', { id: deletingConfig.id })
      message.success('删除成功')
      setDeletingConfig(null)
      await loadConfigs()
    } catch (err) {
      console.error('删除 AI 配置失败:', err)
      message.error('删除失败')
    }
  }

  return (
    <div className="card card-border bg-base-100 shadow-sm">
      <div className="card-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title">AI 配置</h2>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <HiPlus className="h-4 w-4" />
            <span className="ml-1">添加</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="loading loading-spinner loading-md"></span>
            <span className="ml-2">加载配置列表中...</span>
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <p>暂无 AI 配置</p>
            <p className="text-sm mt-2">点击【添加】按钮添加配置</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Base URL</th>
                  <th>API Key</th>
                  <th>Model</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <AIConfigTableRow
                    key={config.id}
                    config={config}
                    onEdit={() => setEditingConfig(config)}
                    onDelete={() => handleDelete(config)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加配置弹窗 */}
      {showAddModal && (
        <AIConfigModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={async () => {
            setShowAddModal(false)
            await loadConfigs()
          }}
        />
      )}

      {/* 编辑配置弹窗 */}
      {editingConfig && (
        <AIConfigModal
          isOpen={!!editingConfig}
          config={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSave={async () => {
            setEditingConfig(null)
            await loadConfigs()
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deletingConfig && (
        <DeleteConfirmModal
          isOpen={!!deletingConfig}
          configName={deletingConfig.name}
          onClose={() => setDeletingConfig(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

// AI 配置表格行组件
interface AIConfigTableRowProps {
  config: AIConfig
  onEdit: () => void
  onDelete: () => void
}

const AIConfigTableRow = ({
  config,
  onEdit,
  onDelete,
}: AIConfigTableRowProps) => {
  return (
    <tr>
      <td className="font-medium">{config.name}</td>
      <td>
        <div className="max-w-xs truncate" title={config.base_url}>
          {config.base_url}
        </div>
      </td>
      <td>
        <div className="font-mono text-sm">
          {config.api_key.substring(0, 10)}...
        </div>
      </td>
      <td>{config.model}</td>
      <td>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-ghost"
            onClick={onEdit}
            title="编辑"
          >
            <HiPencil className="h-4 w-4" />
          </button>
          <button
            className="btn btn-sm btn-ghost text-error"
            onClick={onDelete}
            title="删除"
          >
            <HiTrash className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// AI 配置添加/编辑弹窗
interface AIConfigModalProps {
  isOpen: boolean
  config?: AIConfig | null
  onClose: () => void
  onSave: () => void
}

const AIConfigModal = ({ isOpen, config, onClose, onSave }: AIConfigModalProps) => {
  const message = useMessage()
  const isEditMode = !!config
  const [formData, setFormData] = useState({
    name: '',
    base_url: '',
    api_key: '',
    model: '',
  })

  // 当 config 变化时同步 formData
  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        base_url: config.base_url,
        api_key: config.api_key,
        model: config.model,
      })
    } else {
      setFormData({ name: '', base_url: '', api_key: '', model: '' })
    }
  }, [config])

  const handleSave = async () => {
    if (!formData.name || !formData.base_url || !formData.api_key || !formData.model) {
      message.error('请填写所有字段')
      return
    }

    try {
      if (isEditMode && config) {
        await invoke('update_ai_config', {
          id: config.id,
          name: formData.name,
          baseUrl: formData.base_url,
          apiKey: formData.api_key,
          model: formData.model,
        })
        message.success('更新成功')
      } else {
        await invoke('create_ai_config', {
          name: formData.name,
          baseUrl: formData.base_url,
          apiKey: formData.api_key,
          model: formData.model,
        })
        message.success('添加成功')
        setFormData({ name: '', base_url: '', api_key: '', model: '' })
      }
      onSave()
    } catch (err) {
      console.error(isEditMode ? '更新 AI 配置失败:' : '添加 AI 配置失败:', err)
      message.error(isEditMode ? '更新失败' : '添加失败')
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">{isEditMode ? '编辑 AI 配置' : '添加 AI 配置'}</h3>

        <div className="space-y-4">
          <div>
            <label className="label">
              <span className="label-text">名称</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="配置名称"
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Base URL</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={formData.base_url}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">API Key</span>
            </label>
            <input
              type="password"
              className="input input-bordered w-full"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="label">
              <span className="label-text">Model</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="gpt-3.5-turbo"
            />
          </div>
        </div>

        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}

// 删除确认弹窗
interface DeleteConfirmModalProps {
  isOpen: boolean
  configName: string
  onClose: () => void
  onConfirm: () => void
}

const DeleteConfirmModal = ({ isOpen, configName, onClose, onConfirm }: DeleteConfirmModalProps) => {
  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">确认删除</h3>
        <p className="mb-4">
          确定要删除 AI 配置 <span className="font-semibold">"{configName}"</span> 吗？
        </p>
        <p className="text-sm text-base-content/70 mb-4">此操作不可恢复。</p>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-error" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}

// 模型删除确认弹窗
interface ModelDeleteConfirmModalProps {
  isOpen: boolean
  modelName: string
  onClose: () => void
  onConfirm: () => void
}

const ModelDeleteConfirmModal = ({ isOpen, modelName, onClose, onConfirm }: ModelDeleteConfirmModalProps) => {
  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">确认删除</h3>
        <p className="mb-4">
          确定要删除模型 <span className="font-semibold">"{modelName}"</span> 吗？
        </p>
        <p className="text-sm text-base-content/70 mb-4">此操作不可恢复。</p>
        <div className="modal-action">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-error" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
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
  const [deletingModel, setDeletingModel] = useState<string | null>(null)
  const [deletingModelName, setDeletingModelName] = useState<string | null>(null)
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
  }, [isOpen])

  // 组件卸载时清理事件监听
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [])

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

  // 删除模型（显示确认弹窗）
  const handleDeleteModel = (modelName: string) => {
    setDeletingModelName(modelName)
  }

  // 确认删除模型
  const handleConfirmDeleteModel = async () => {
    if (!deletingModelName) return
    try {
      setDeletingModel(deletingModelName)
      setError(null)
      await invoke<string>('delete_model', { modelName: deletingModelName })
      message.success(`模型 ${deletingModelName} 删除成功`)
      setDeletingModelName(null)
      await loadModels()
      onModelDownloaded()
    } catch (err) {
      console.error('删除模型失败:', err)
      const errorMsg = err instanceof Error ? err.message : '删除模型失败'
      setError(errorMsg)
      message.error(`模型 ${deletingModelName} 删除失败: ${errorMsg}`)
    } finally {
      setDeletingModel(null)
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
                      <div className="text-sm text-base-content/70 flex items-center gap-1">
                        {isDownloading && progress ? (
                          `下载中... ${progress.progress.toFixed(1)}%`
                        ) : model.downloaded ? (
                          <>
                            <HiCheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                            <span>已下载 ({formatSize(model.size)})</span>
                          </>
                        ) : (
                          '未下载'
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDownloading ? (
                        <div className="badge badge-info">下载中</div>
                      ) : model.downloaded ? (
                        <button
                          className="btn btn-sm btn-ghost text-error"
                          onClick={() => handleDeleteModel(model.name)}
                          disabled={deletingModel !== null || downloadingModel !== null}
                          title="删除模型"
                        >
                          <HiTrash className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          className={`btn ${
                            downloadingModel === model.name ? 'loading' : ''
                          }`}
                          onClick={() => handleDownloadModel(model.name)}
                          disabled={downloadingModel !== null || deletingModel !== null}
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

      {/* 删除确认弹窗 */}
      {deletingModelName && (
        <ModelDeleteConfirmModal
          isOpen={!!deletingModelName}
          modelName={deletingModelName}
          onClose={() => setDeletingModelName(null)}
          onConfirm={handleConfirmDeleteModel}
        />
      )}
    </div>
  )
}

export default SettingsGeneralPage
