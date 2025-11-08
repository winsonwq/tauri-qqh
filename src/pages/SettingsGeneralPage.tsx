import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModelInfo } from '../models';
import { HiXCircle, HiCheckCircle } from 'react-icons/hi2';

const SettingsGeneralPage = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsDir, setModelsDir] = useState<string>('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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


  // 下载模型
  const handleDownloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName);
      setError(null);
      setSuccess(null);
      const result = await invoke<string>('download_model', { modelName });
      setSuccess(result);
      // 重新加载模型列表
      await loadModels();
    } catch (err) {
      console.error('下载模型失败:', err);
      setError(err instanceof Error ? err.message : '下载模型失败');
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

  return (
    <div className="space-y-6 p-6 h-full">
      {/* 模型管理 */}
      <div className="card card-border bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title">模型管理</h2>
          <p className="text-base-content/70">
            下载和管理 Whisper 模型。模型将保存到: <code className="text-xs bg-base-200 px-1 py-0.5 rounded">{modelsDir}</code>
          </p>

          {loadingModels ? (
            <div className="flex items-center justify-center py-8">
              <span className="loading loading-spinner loading-md"></span>
              <span className="ml-2">加载模型列表中...</span>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
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
                      className={`btn btn-sm btn-primary ${downloadingModel === model.name ? 'loading' : ''}`}
                      onClick={() => handleDownloadModel(model.name)}
                      disabled={downloadingModel !== null}
                    >
                      {downloadingModel === model.name ? '下载中...' : '下载'}
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

          {success && (
            <div className="alert alert-success mt-4">
              <HiCheckCircle className="h-6 w-6" />
              <span>{success}</span>
            </div>
          )}

          <button
            className="btn btn-outline btn-sm mt-4"
            onClick={loadModels}
            disabled={loadingModels}
          >
            {loadingModels ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                加载中...
              </>
            ) : (
              '刷新模型列表'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsGeneralPage;

