import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { openPath } from '@tauri-apps/plugin-opener'
import { ModelInfo, ModelDownloadProgress, AIConfig, MCPServerInfo, MCPServerConfig, MCPConfig } from '../models'
import { HiXCircle, HiArrowDownTray, HiFolderOpen, HiPencil, HiTrash, HiPlus, HiCheckCircle, HiChevronDown, HiChevronUp, HiArrowPath } from 'react-icons/hi2'
import { useMessage } from '../components/Toast'
import { useAppDispatch, useAppSelector } from '../redux/hooks'
import { refreshMCPConfigs } from '../redux/slices/mcpSlice'
import { refreshAIConfigs } from '../redux/slices/aiConfigSlice'

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

      {/* MCP 配置管理 */}
      <MCPConfigBlock />

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
  const dispatch = useAppDispatch()
  const { configs, loading, error } = useAppSelector((state) => state.aiConfig)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null)
  const [deletingConfig, setDeletingConfig] = useState<AIConfig | null>(null)

  // 刷新配置
  const handleRefresh = async () => {
    try {
      await dispatch(refreshAIConfigs()).unwrap()
      message.success('刷新成功')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '刷新失败'
      message.error(errorMsg)
    }
  }

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
      // 刷新 Redux store
      await dispatch(refreshAIConfigs()).unwrap()
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
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleRefresh}
              disabled={loading}
              title="刷新"
            >
              <HiArrowPath className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-1">刷新</span>
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              <HiPlus className="h-4 w-4" />
              <span className="ml-1">添加</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <HiXCircle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        )}
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
                  <th className="w-100 text-right">操作</th>
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
            // 刷新 Redux store
            await dispatch(refreshAIConfigs()).unwrap()
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
            // 刷新 Redux store
            await dispatch(refreshAIConfigs()).unwrap()
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
      <td className="text-right">
        <div className="flex gap-2 justify-end">
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

// MCP 配置管理组件
const MCPConfigBlock = () => {
  const message = useMessage()
  const dispatch = useAppDispatch()
  const { servers, loading, error } = useAppSelector((state) => state.mcp)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [deletingServer, setDeletingServer] = useState<string | null>(null)
  const [viewingServer, setViewingServer] = useState<MCPServerInfo | null>(null)

  // 刷新配置
  const handleRefresh = async () => {
    try {
      await dispatch(refreshMCPConfigs()).unwrap()
      message.success('刷新成功')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '刷新失败'
      message.error(errorMsg)
    }
  }

  // 删除配置
  const handleDelete = (server: MCPServerInfo) => {
    // 默认服务不允许删除
    if (server.is_default) {
      return
    }
    // 使用原始键名（key）或服务器名称进行删除
    setDeletingServer(server.key || server.name)
  }

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!deletingServer) return
    try {
      // deletingServer 存储的是原始键名
      await invoke('delete_mcp_config', { serverName: deletingServer })
      message.success('删除成功')
      setDeletingServer(null)
      // 刷新 Redux store
      await dispatch(refreshMCPConfigs()).unwrap()
    } catch (err) {
      console.error('删除 MCP 配置失败:', err)
      message.error('删除失败')
    }
  }

  // 查看工具列表
  const handleViewTools = (server: MCPServerInfo) => {
    setViewingServer(server)
  }

  return (
      <div className="card card-border bg-base-100 shadow-sm">
      <div className="card-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title">Tools & MCP</h2>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleRefresh}
              disabled={loading}
              title="刷新"
            >
              <HiArrowPath className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-1">刷新</span>
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowSettingsModal(true)}
            >
              <HiPencil className="h-4 w-4" />
              <span className="ml-1">设置</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <HiXCircle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="loading loading-spinner loading-md"></span>
            <span className="ml-2">加载配置列表中...</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <p>暂无 MCP 配置</p>
            <p className="text-sm mt-2">点击【设置】按钮配置 MCP 服务器</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th className="w-full">名称</th>
                  <th className="text-right whitespace-nowrap">工具数量</th>
                  <th className="text-center whitespace-nowrap">启用</th>
                  <th className="text-center whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <MCPTableRow
                    key={server.name}
                    server={server}
                    onDelete={() => handleDelete(server)}
                    onViewTools={() => handleViewTools(server)}
                    onToggleEnabled={async (enabled) => {
                      const serverKey = server.key || server.name
                      try {
                        await invoke('update_mcp_enabled', {
                          serverName: serverKey,
                          enabled,
                        })
                        message.success(enabled ? '已启用' : '已禁用')
                        await dispatch(refreshMCPConfigs()).unwrap()
                      } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : '操作失败'
                        message.error(errorMsg)
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 设置弹窗 */}
      {showSettingsModal && (
        <MCPConfigModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onSave={async () => {
            setShowSettingsModal(false)
            // 刷新 Redux store
            await dispatch(refreshMCPConfigs()).unwrap()
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deletingServer && (() => {
        const serverToDelete = servers.find(s => (s.key || s.name) === deletingServer)
        const displayName = serverToDelete?.config.name || serverToDelete?.name || deletingServer
        return (
          <DeleteConfirmModal
            isOpen={!!deletingServer}
            configName={displayName}
            onClose={() => setDeletingServer(null)}
            onConfirm={handleConfirmDelete}
          />
        )
      })()}

      {/* 工具列表弹窗 */}
      {viewingServer && (
        <MCPToolsModal
          isOpen={!!viewingServer}
          server={viewingServer}
          onClose={() => setViewingServer(null)}
        />
      )}
    </div>
  )
}

// MCP 表格行组件
interface MCPTableRowProps {
  server: MCPServerInfo
  onDelete: () => void
  onViewTools: () => void
  onToggleEnabled: (enabled: boolean) => Promise<void>
}

const MCPTableRow = ({
  server,
  onDelete,
  onViewTools,
  onToggleEnabled,
}: MCPTableRowProps) => {
  const toolsCount = server.tools?.length || 0
  const isEnabled = server.config.enabled ?? true
  const isDefault = server.is_default ?? false
  
  // 获取状态点的颜色
  const getStatusDotColor = () => {
    switch (server.status) {
      case 'connected':
        return 'bg-success'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-base-content/30'
    }
  }

  const handleToggle = async () => {
    if (isDefault) {
      return // 默认服务不允许修改
    }
    await onToggleEnabled(!isEnabled)
  }

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${getStatusDotColor()}`}
            title={
              server.status === 'connected'
                ? '已连接'
                : server.status === 'error'
                ? `连接错误: ${server.error || '未知错误'}`
                : '未连接'
            }
          />
          <span className="font-medium">{server.config.name || server.name}</span>
        </div>
      </td>
      <td className="text-right whitespace-nowrap">
        {(toolsCount > 0 || server.error) ? (
          <button
            className="btn btn-ghost btn-xs"
            onClick={onViewTools}
          >
            {server.error ? '查看错误' : `${toolsCount} 个工具`}
          </button>
        ) : (
          <span className="text-base-content/50">0</span>
        )}
      </td>
      <td className="text-center whitespace-nowrap">
        {!isDefault && (
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={isEnabled}
            onChange={handleToggle}
            title={isEnabled ? '点击禁用' : '点击启用'}
          />
        )}
      </td>
      <td className="text-center whitespace-nowrap">
        {!server.is_default && (
          <button
            className="btn btn-sm btn-ghost text-error"
            onClick={onDelete}
            title="删除"
          >
            <HiTrash className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )
}

// MCP 工具列表弹窗
interface MCPToolsModalProps {
  isOpen: boolean
  server: MCPServerInfo
  onClose: () => void
}

const MCPToolsModal = ({ isOpen, server, onClose }: MCPToolsModalProps) => {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())

  // 切换工具展开/折叠
  const toggleTool = (index: number) => {
    setExpandedTools((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">
          {server.config.name || server.name} - {server.error ? '连接错误' : '工具列表'}
        </h3>

        <div className="space-y-4">
          {server.error ? (
            <div className="bg-error/10 border border-error/20 rounded-lg p-4">
              <div className="font-medium text-error mb-2">连接错误</div>
              <div className="text-sm text-error/70">
                {server.error}
              </div>
            </div>
          ) : server.tools && server.tools.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {server.tools.map((tool, index) => {
                const isExpanded = expandedTools.has(index)
                const hasParams = tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0

                return (
                  <div
                    key={index}
                    className="bg-base-200 rounded-lg border border-base-300"
                  >
                    {/* 工具标题区域 - 可点击 */}
                    <button
                      className={`w-full text-left p-4 flex items-center justify-between transition-colors ${
                        hasParams ? 'hover:bg-base-300/50 cursor-pointer' : 'cursor-default'
                      }`}
                      onClick={() => hasParams && toggleTool(index)}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-base">{tool.name}</div>
                        {tool.description && (
                          <div className="text-sm text-base-content/70 mt-1">
                            {tool.description}
                          </div>
                        )}
                      </div>
                      {hasParams && (
                        <div className="ml-2 flex-shrink-0">
                          {isExpanded ? (
                            <HiChevronUp className="h-5 w-5 text-base-content/50" />
                          ) : (
                            <HiChevronDown className="h-5 w-5 text-base-content/50" />
                          )}
                        </div>
                      )}
                    </button>

                    {/* 参数详情区域 - 可展开/折叠 */}
                    {isExpanded && hasParams && tool.inputSchema.properties && (
                      <div className="px-4 pb-4 pt-2 border-t border-base-300">
                        <div className="text-xs font-semibold text-base-content/60 mb-2">参数：</div>
                        <div className="space-y-2">
                          {Object.entries(tool.inputSchema.properties).map(([paramName, param]) => (
                            <div key={paramName} className="text-xs bg-base-300 rounded p-2">
                              <div className="font-mono font-medium text-primary">
                                {paramName}
                                {tool.inputSchema.required?.includes(paramName) && (
                                  <span className="text-error ml-1">*</span>
                                )}
                              </div>
                              <div className="text-base-content/70 mt-1">
                                <span className="text-base-content/50">类型: </span>
                                {param.type}
                              </div>
                              {param.description && (
                                <div className="text-base-content/70 mt-1">
                                  {param.description}
                                </div>
                              )}
                              {param.enum && (
                                <div className="text-base-content/70 mt-1">
                                  <span className="text-base-content/50">可选值: </span>
                                  {param.enum.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-base-content/50">
              <p>该服务器没有可用工具</p>
            </div>
          )}
        </div>

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

// MCP 配置设置弹窗
interface MCPConfigModalProps {
  isOpen: boolean
  server?: MCPServerInfo | null
  onClose: () => void
  onSave: () => void
}

const MCPConfigModal = ({
  isOpen,
  server,
  onClose,
  onSave,
}: MCPConfigModalProps) => {
  const message = useMessage()
  const isEditMode = !!server
  const [jsonContent, setJsonContent] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (isEditMode && server) {
          // 编辑单个服务器：只显示该服务器的配置（不包含 mcpServers 包装）
          setJsonContent(JSON.stringify(server.config, null, 2))
        } else {
          // 设置模式：加载完整配置
          const config = await invoke<MCPConfig>('get_mcp_config_full')
          setJsonContent(JSON.stringify(config, null, 2))
        }
      } catch (err) {
        console.error('加载 MCP 配置失败:', err)
        // 如果加载失败，使用默认模板
        if (isEditMode) {
          setJsonContent('{}')
        } else {
          const defaultConfig: MCPConfig = {
            mcpServers: {},
          }
          setJsonContent(JSON.stringify(defaultConfig, null, 2))
        }
      }
      setJsonError(null)
    }
    if (isOpen) {
      loadConfig()
    }
  }, [isOpen, isEditMode, server])

  // 验证 JSON
  const validateJson = (content: string, isServerConfig: boolean): boolean => {
    try {
      if (isServerConfig) {
        // 验证单个服务器配置
        const parsed = JSON.parse(content) as MCPServerConfig
        
        // 检查新格式的 transport 字段
        if (parsed.transport) {
          const transport = parsed.transport as any
          if (transport.type === 'stdio') {
            // Stdio 传输
            if (!transport.command) {
              setJsonError('transport.command 是必需的（stdio 传输）')
              return false
            }
          } else if (transport.type === 'http') {
            // HTTP 传输
            if (!transport.url) {
              setJsonError('transport.url 是必需的（http 传输）')
              return false
            }
          } else {
            setJsonError('transport.type 必须是 "stdio" 或 "http"')
            return false
          }
        } else {
          // 检查旧格式：至少有一个传输方式
          if (!parsed.command && !parsed.url) {
            setJsonError('配置必须包含 command（stdio）或 transport/url（http）字段')
            return false
          }
        }
      } else {
        // 验证完整配置（支持新旧两种格式）
        const parsed = JSON.parse(content) as any
        
        // 检查是否是旧格式（包含 mcpServers）
        if (parsed.mcpServers) {
          if (typeof parsed.mcpServers !== 'object') {
            setJsonError('mcpServers 必须是对象')
            return false
          }
        } else {
          // 新格式：服务器配置直接作为顶层对象
          // 检查是否至少有一个服务器配置
          const serverKeys = Object.keys(parsed).filter(key => key !== 'mcpServers')
          if (serverKeys.length === 0) {
            setJsonError('配置必须包含至少一个服务器配置')
            return false
          }
          
          // 验证每个服务器配置
          for (const key of serverKeys) {
            const serverConfig = parsed[key]
            if (!serverConfig || typeof serverConfig !== 'object') {
              setJsonError(`服务器配置 "${key}" 必须是对象`)
              return false
            }
            
            // 检查是否有 transport 字段
            if (serverConfig.transport) {
              const transport = serverConfig.transport
              if (transport.type === 'stdio' && !transport.command) {
                setJsonError(`服务器 "${key}": transport.command 是必需的（stdio 传输）`)
                return false
              } else if (transport.type === 'http' && !transport.url) {
                setJsonError(`服务器 "${key}": transport.url 是必需的（http 传输）`)
                return false
              } else if (transport.type !== 'stdio' && transport.type !== 'http') {
                setJsonError(`服务器 "${key}": transport.type 必须是 "stdio" 或 "http"`)
                return false
              }
            } else if (!serverConfig.command && !serverConfig.url) {
              setJsonError(`服务器 "${key}": 必须包含 command（stdio）或 transport/url（http）字段`)
              return false
            }
          }
        }
      }
      setJsonError(null)
      return true
    } catch (e) {
      setJsonError(`JSON 格式错误: ${e instanceof Error ? e.message : '未知错误'}`)
      return false
    }
  }

  const handleSave = async () => {
    if (!validateJson(jsonContent, isEditMode)) {
      message.error('JSON 配置格式错误')
      return
    }

    try {
      if (isEditMode && server) {
        // 编辑模式：更新单个服务器配置
        const serverConfig = JSON.parse(jsonContent) as MCPServerConfig
        
        await invoke('save_mcp_config', {
          serverName: server.name,
          serverConfig: serverConfig,
        })
      } else {
        // 设置模式：保存完整配置
        const parsed = JSON.parse(jsonContent) as MCPConfig
        await invoke('save_mcp_config_full', { config: parsed })
      }

      message.success(isEditMode ? '更新成功' : '保存成功')
      onSave()
    } catch (err) {
      console.error(isEditMode ? '更新 MCP 配置失败:' : '保存 MCP 配置失败:', err)
      message.error(isEditMode ? '更新失败' : '保存失败')
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-lg mb-4">
          {isEditMode ? '编辑 MCP 配置' : 'MCP 设置'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="label">
              <span className="label-text">配置 JSON</span>
            </label>
            <textarea
              className={`textarea textarea-bordered w-full font-mono text-sm ${
                jsonError ? 'textarea-error' : ''
              }`}
              value={jsonContent}
              onChange={(e) => {
                setJsonContent(e.target.value)
                validateJson(e.target.value, isEditMode)
              }}
              rows={20}
              placeholder={
                isEditMode
                  ? '{\n  "name": "MCP Server",\n  "type": "stdio",\n  "enabled": true,\n  "transport": {\n    "type": "stdio",\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],\n    "workingDir": ".",\n    "env": {}\n  }\n}\n\n或\n\n{\n  "transport": {\n    "type": "http",\n    "url": "http://localhost:3001/api/servers/filesystem/mcp"\n  }\n}'
                  : '{\n  "server-name": {\n    "name": "MCP Server",\n    "type": "stdio",\n    "enabled": true,\n    "transport": {\n      "type": "stdio",\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]\n    }\n  }\n}\n\n或旧格式：\n\n{\n  "mcpServers": {\n    "server-name": {\n      "command": "node",\n      "args": ["server.js"]\n    }\n  }\n}'
              }
            />
            {jsonError && (
              <div className="label">
                <span className="label-text-alt text-error">{jsonError}</span>
              </div>
            )}
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

export default SettingsGeneralPage
