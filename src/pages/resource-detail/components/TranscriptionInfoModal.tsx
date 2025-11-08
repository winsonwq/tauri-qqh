import { TranscriptionResultJson } from '../../../models/TranscriptionResult';
import { HiXMark } from 'react-icons/hi2';

interface TranscriptionInfoModalProps {
  isOpen: boolean;
  data: TranscriptionResultJson | null;
  onClose: () => void;
}

const TranscriptionInfoModal = ({ isOpen, data, onClose }: TranscriptionInfoModalProps) => {
  if (!isOpen || !data) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">转写信息</h3>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 系统信息 */}
          {data.systeminfo && (
            <div className="card bg-base-200">
              <div className="card-body p-4">
                <h4 className="text-sm font-semibold mb-2">系统信息</h4>
                <div className="text-xs font-mono text-base-content/70 break-all">
                  {data.systeminfo}
                </div>
              </div>
            </div>
          )}

          {/* 模型信息 */}
          {data.model && (
            <div className="card bg-base-200">
              <div className="card-body p-4">
                <h4 className="text-sm font-semibold mb-3">模型信息</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-base-content/50">类型:</span>
                    <span className="ml-2 font-medium">{data.model.type}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">多语言:</span>
                    <span className="ml-2 font-medium">{data.model.multilingual ? '是' : '否'}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">词汇表大小:</span>
                    <span className="ml-2 font-medium">{data.model.vocab.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">Mel 频带数:</span>
                    <span className="ml-2 font-medium">{data.model.mels}</span>
                  </div>
                </div>
                {data.model.audio && (
                  <div className="mt-3 pt-3 border-t border-base-300">
                    <div className="text-xs text-base-content/50 mb-2">音频编码器</div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>Ctx: {data.model.audio.ctx}</div>
                      <div>State: {data.model.audio.state}</div>
                      <div>Head: {data.model.audio.head}</div>
                      <div>Layer: {data.model.audio.layer}</div>
                    </div>
                  </div>
                )}
                {data.model.text && (
                  <div className="mt-3 pt-3 border-t border-base-300">
                    <div className="text-xs text-base-content/50 mb-2">文本解码器</div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>Ctx: {data.model.text.ctx}</div>
                      <div>State: {data.model.text.state}</div>
                      <div>Head: {data.model.text.head}</div>
                      <div>Layer: {data.model.text.layer}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 参数信息 */}
          {data.params && (
            <div className="card bg-base-200">
              <div className="card-body p-4">
                <h4 className="text-sm font-semibold mb-3">转写参数</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-base-content/50">模型:</span>
                    <span className="ml-2 font-medium">{data.params.model}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">语言:</span>
                    <span className="ml-2 font-medium">{data.params.language}</span>
                  </div>
                  <div>
                    <span className="text-base-content/50">翻译:</span>
                    <span className="ml-2 font-medium">{data.params.translate ? '是' : '否'}</span>
                  </div>
                </div>
              </div>
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
  );
};

export default TranscriptionInfoModal;

