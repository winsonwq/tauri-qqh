import { useState, useMemo } from 'react';
import { TranscriptionTask, TranscriptionTaskStatus } from '../../../models';
import { TranscriptionResultJson } from '../../../models/TranscriptionResult';
import { HiDocumentText, HiInformationCircle } from 'react-icons/hi2';
import { getStatusText } from './transcriptionUtils';
import TranscriptionJsonView from './TranscriptionJsonView';
import TranscriptionInfoModal from './TranscriptionInfoModal';

interface TranscriptionHistoryProps {
  tasks: TranscriptionTask[];
  selectedTaskId: string | null;
  loading: boolean;
  resultContent: string | null;
  onSelectTask: (taskId: string | null) => void;
  onCreateTask: () => void;
}

const TranscriptionHistory = ({
  tasks,
  selectedTaskId,
  loading,
  resultContent,
  onSelectTask,
  onCreateTask,
}: TranscriptionHistoryProps) => {
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tasks]);

  const [showInfoModal, setShowInfoModal] = useState(false);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  // 尝试解析 JSON 结果
  let jsonData: TranscriptionResultJson | null = null;
  if (resultContent) {
    try {
      jsonData = JSON.parse(resultContent) as TranscriptionResultJson;
    } catch (e) {
      // 如果不是 JSON 格式，可能是旧的 SRT 格式或其他格式
      console.warn('转写结果不是 JSON 格式，尝试作为文本显示');
    }
  }

  return (
    <div className="card bg-base-100 h-full flex flex-col">
      <div className="card-body flex flex-col h-full overflow-hidden">
        {/* 上部分：转写历史 */}
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title text-lg">转写历史</h2>
            <button
              className={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`}
              onClick={onCreateTask}
              disabled={loading}
            >
              {loading ? '创建中...' : '创建转写任务'}
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-8 text-base-content/50">
              <HiDocumentText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无转写任务</p>
              <p className="text-sm mt-2">点击上方按钮创建转写任务</p>
            </div>
          ) : (
            <div className="form-control">
              <label className="label">
                <span className="label-text text-sm">选择转写记录</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={selectedTaskId || ''}
                onChange={(e) => onSelectTask(e.target.value || null)}
              >
                <option value="" disabled>请选择...</option>
                {sortedTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {new Date(task.created_at).toLocaleString('zh-CN')} - {getStatusText(task.status)}
                    {task.status === TranscriptionTaskStatus.COMPLETED ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 下部分：转写结果展示 */}
        {selectedTask && selectedTask.status === TranscriptionTaskStatus.COMPLETED && (
          <div className="flex-1 flex flex-col min-h-0 mt-6 pt-6 border-t border-base-300">
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <h3 className="text-lg font-semibold">转写结果</h3>
              {jsonData && (
                <button
                  className="btn btn-sm btn-ghost btn-circle"
                  onClick={() => setShowInfoModal(true)}
                  title="查看转写信息"
                >
                  <HiInformationCircle className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {resultContent !== null ? (
                resultContent ? (
                  jsonData ? (
                    // 显示 JSON 格式的结果
                    <div className="space-y-3">
                      <TranscriptionJsonView data={jsonData} />
                    </div>
                  ) : (
                    // 显示文本格式的结果（兼容旧格式）
                    <div className="bg-base-200 rounded-lg border border-base-300 p-4">
                      <div className="text-sm text-base-content whitespace-pre-wrap break-words">
                        {resultContent}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center py-8 text-base-content/50">
                    <span className="loading loading-spinner loading-md"></span>
                    <p className="mt-2 text-sm">加载中...</p>
                  </div>
                )
              ) : null}
            </div>
            {jsonData && jsonData.transcription && jsonData.transcription.length > 0 && (
              <div className="flex-shrink-0 pt-3 text-xs text-base-content/50">
                共 {jsonData.transcription.length} 个片段
              </div>
            )}
          </div>
        )}

        {/* 转写信息弹出框 */}
        <TranscriptionInfoModal
          isOpen={showInfoModal}
          data={jsonData}
          onClose={() => setShowInfoModal(false)}
        />
      </div>
    </div>
  );
};

export default TranscriptionHistory;

