import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TranscriptionParams, ModelInfo } from '../../../models';

interface CreateTranscriptionTaskModalProps {
  isOpen: boolean;
  onConfirm: (params: TranscriptionParams) => void;
  onCancel: () => void;
}

const CreateTranscriptionTaskModal = ({
  isOpen,
  onConfirm,
  onCancel,
}: CreateTranscriptionTaskModalProps) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [params, setParams] = useState<TranscriptionParams>({
    model: 'base',
    language: 'zh',
    word_timestamps: true,
    translate: false,
  });

  // 加载可用模型列表
  useEffect(() => {
    if (isOpen) {
      loadModels();
    }
  }, [isOpen]);

  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const modelsList = await invoke<ModelInfo[]>('get_downloaded_models');
      setModels(modelsList);
      // 如果当前选择的模型未下载，选择第一个已下载的模型
      const downloadedModel = modelsList.find(m => m.downloaded);
      if (downloadedModel && params.model !== downloadedModel.name) {
        setParams(prev => ({ ...prev, model: downloadedModel.name }));
      }
    } catch (err) {
      console.error('加载模型列表失败:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(params);
  };

  if (!isOpen) return null;

  const availableModels = models.filter(m => m.downloaded);

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">创建转写任务</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* 模型选择 */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">模型</span>
              </label>
              {loadingModels ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <select
                  className="select select-bordered w-full"
                  value={params.model || ''}
                  onChange={(e) => setParams(prev => ({ ...prev, model: e.target.value }))}
                  required
                >
                  {availableModels.length === 0 ? (
                    <option value="" disabled>没有可用的模型，请先下载模型</option>
                  ) : (
                    availableModels.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                      </option>
                    ))
                  )}
                </select>
              )}
              {availableModels.length === 0 && !loadingModels && (
                <label className="label">
                  <span className="label-text-alt text-warning">
                    请前往设置页面下载模型
                  </span>
                </label>
              )}
            </div>

            {/* 语言选择 */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">语言</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={params.language || 'zh'}
                onChange={(e) => setParams(prev => ({ ...prev, language: e.target.value }))}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="auto">自动检测</option>
              </select>
            </div>

            {/* 是否翻译 */}
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">翻译为英文</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={params.translate || false}
                  onChange={(e) => setParams(prev => ({ ...prev, translate: e.target.checked }))}
                />
              </label>
            </div>

            {/* 词级时间戳 */}
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">包含词级时间戳</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={params.word_timestamps || false}
                  onChange={(e) => setParams(prev => ({ ...prev, word_timestamps: e.target.checked }))}
                />
              </label>
            </div>
          </div>

          <div className="modal-action">
            <button type="button" className="btn" onClick={onCancel}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={availableModels.length === 0}
            >
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTranscriptionTaskModal;

