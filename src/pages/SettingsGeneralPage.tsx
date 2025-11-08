import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { ModelInfo } from '../models';
import { HiXCircle, HiArrowDownTray, HiFolderOpen } from 'react-icons/hi2';
import { useMessage } from '../componets/Toast';

const SettingsGeneralPage = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsDir, setModelsDir] = useState<string>('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // 加载模型列表
  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const [modelsList, dir] = await Promise.all([
        invoke<ModelInfo[]>('get_downloaded_models'),
        invoke<string>('get_models_dir'),
      ]);
      setModels(modelsList);
      setModelsDir(dir);
    } catch (err) {
      console.error('加载模型列表失败:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // 打开模型文件夹
  const handleOpenFolder = async () => {
    try {
      if (modelsDir) {
        await openPath(modelsDir);
      }
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
  };

  // 获取已下载的模型列表
  const downloadedModels = models.filter(model => model.downloaded);

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
  );
};

// 模型下载弹出框组件
interface ModelDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelDownloaded: () => void;
}

const ModelDownloadModal = ({
  isOpen,
  onClose,
  onModelDownloaded,
}: ModelDownloadModalProps) => {
  const message = useMessage();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载模型列表
  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const modelsList = await invoke<ModelInfo[]>('get_downloaded_models');
      setModels(modelsList);
    } catch (err) {
      console.error('加载模型列表失败:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  // 下载模型
  const handleDownloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName);
      setError(null);
      await invoke<string>('download_model', { modelName });
      // 显示成功 toast
      message.success(`模型 ${modelName} 下载成功`);
      // 重新加载模型列表
      await loadModels();
      // 通知父组件刷新
      onModelDownloaded();
    } catch (err) {
      console.error('下载模型失败:', err);
      const errorMsg = err instanceof Error ? err.message : '下载模型失败';
      setError(errorMsg);
      message.error(`模型 ${modelName} 下载失败: ${errorMsg}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  // 格式化文件大小
  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  if (!isOpen) return null;

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
            {models.map((model) => (
              <div
                key={model.name}
                className="flex items-center justify-between p-3 bg-base-200 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{model.name}</div>
                  <div className="text-sm text-base-content/70">
                    {model.downloaded ? `已下载 (${formatSize(model.size)})` : '未下载'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {model.downloaded ? (
                    <div className="badge badge-success">已安装</div>
                  ) : (
                    <button
                      className={`btn ${downloadingModel === model.name ? 'loading' : ''}`}
                      onClick={() => handleDownloadModel(model.name)}
                      disabled={downloadingModel !== null}
                      title="下载模型"
                    >
                      {downloadingModel !== model.name && <HiArrowDownTray className="h-4 w-4" />}
                      <span className="ml-1">下载</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
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
  );
};

export default SettingsGeneralPage;
