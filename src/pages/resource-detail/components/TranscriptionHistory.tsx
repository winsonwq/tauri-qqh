import { useState, useMemo, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useAppSelector, useAppDispatch } from '../../../redux/hooks';
import { clearLogs } from '../../../redux/slices/transcriptionLogsSlice';
import { TranscriptionTask, TranscriptionTaskStatus } from '../../../models';
import { TranscriptionResultJson } from '../../../models/TranscriptionResult';
import { HiDocumentText, HiInformationCircle, HiTrash, HiStop, HiArrowDownTray } from 'react-icons/hi2';
import { getStatusText } from './transcriptionUtils';
import TranscriptionJsonView from './TranscriptionJsonView';
import TranscriptionInfoModal from './TranscriptionInfoModal';
import DeleteConfirmModal from '../../../componets/DeleteConfirmModal';
import { convertToSRT } from '../../../utils/srtConverter';
import { useMessage } from '../../../componets/Toast';
import Select from '../../../componets/Select';

interface TranscriptionHistoryProps {
  tasks: TranscriptionTask[];
  selectedTaskId: string | null;
  resultContent: string | null;
  resourceName?: string; // 资源名称，用于生成默认导出文件名
  canCreateTask?: boolean; // 是否可以创建任务（例如，视频资源正在提取音频时不能创建）
  onSelectTask: (taskId: string | null) => void;
  onCreateTask: () => void;
  onTaskDeleted?: () => void; // 任务删除后的回调
  onTaskStopped?: () => void; // 任务停止后的回调
}

const TranscriptionHistory = ({
  tasks,
  selectedTaskId,
  resultContent,
  resourceName,
  canCreateTask = true,
  onSelectTask,
  onCreateTask,
  onTaskDeleted,
  onTaskStopped,
}: TranscriptionHistoryProps) => {
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tasks]);

  const dispatch = useAppDispatch();
  const message = useMessage();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewMode, setViewMode] = useState<'result' | 'log'>('result'); // 切换显示模式
  const logEndRef = useRef<HTMLDivElement>(null);
  const previousTaskIdRef = useRef<string | null>(null); // 跟踪上一次选中的任务 ID

  // 从 Redux 读取日志
  const logs = useAppSelector((state) => state.transcriptionLogs.logs);
  // 过滤空字符串并合并日志
  const realtimeLog = selectedTaskId 
    ? (logs[selectedTaskId] || []).filter(log => log.trim()).join('\n') 
    : '';
  
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
  
  // 调试：打印任务状态
  useEffect(() => {
    if (selectedTask) {
      console.log('当前选中任务:', {
        id: selectedTask.id,
        status: selectedTask.status,
        statusType: typeof selectedTask.status,
        RUNNING: TranscriptionTaskStatus.RUNNING,
        isRunning: selectedTask.status === TranscriptionTaskStatus.RUNNING,
        statusEquals: selectedTask.status === 'running',
      });
    }
  }, [selectedTask]);

  // 删除任务
  const handleDeleteTask = async () => {
    if (!selectedTaskId) return;
    
    try {
      await invoke('delete_transcription_task', { taskId: selectedTaskId });
      // 清理 Redux 中的日志
      dispatch(clearLogs(selectedTaskId));
      setShowDeleteModal(false);
      // 清除选中
      onSelectTask(null);
      // 通知父组件刷新任务列表
      if (onTaskDeleted) {
        onTaskDeleted();
      }
    } catch (err) {
      console.error('删除任务失败:', err);
      alert(err instanceof Error ? err.message : '删除任务失败');
    }
  };

  // 停止任务
  const handleStopTask = async () => {
    if (!selectedTaskId) return;
    
    try {
      await invoke('stop_transcription_task', { taskId: selectedTaskId });
      // 通知父组件刷新任务列表
      if (onTaskStopped) {
        onTaskStopped();
      }
    } catch (err) {
      // 静默处理错误，只记录到控制台，不显示全局提示
      console.error('停止任务失败:', err);
    }
  };

  // 导出转写结果为SRT格式
  const handleExportSRT = async () => {
    if (!resultContent || !selectedTask) {
      message.error('没有可导出的转写结果');
      return;
    }

    // 尝试解析JSON数据
    let jsonData: TranscriptionResultJson | null = null;
    try {
      jsonData = JSON.parse(resultContent) as TranscriptionResultJson;
    } catch (e) {
      message.error('转写结果格式不正确，无法导出');
      return;
    }

    if (!jsonData || !jsonData.transcription || jsonData.transcription.length === 0) {
      message.error('转写结果为空，无法导出');
      return;
    }

    try {
      const srtContent = convertToSRT(jsonData);

      const nameWithoutExt = resourceName?.replace(/\.[^/.]+$/, '') || '';
      const defaultFileName = `${nameWithoutExt}.srt`;

      const filePath = await save({
        filters: [
          {
            name: 'SRT字幕文件',
            extensions: ['srt'],
          },
        ],
        defaultPath: defaultFileName,
      });

      if (!filePath) {
        // 用户取消了保存
        return;
      }

      // 保存文件（writeTextFile 默认使用 UTF-8 编码）
      await writeTextFile(filePath, srtContent);
      message.success('SRT文件导出成功');
    } catch (err) {
      console.error('导出SRT失败:', err);
      message.error(err instanceof Error ? err.message : '导出SRT文件失败');
    }
  };

  // 当日志更新时，自动滚动到底部
  useEffect(() => {
    if (realtimeLog && logEndRef.current) {
      setTimeout(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [realtimeLog]);

  // 当选中任务变化时，自动设置视图模式（仅在任务切换时，不覆盖用户手动选择）
  useEffect(() => {
    // 只在任务切换时自动设置视图模式，不在状态变化时覆盖用户选择
    const isTaskChanged = previousTaskIdRef.current !== selectedTaskId;
    
    if (isTaskChanged && selectedTask) {
      // 如果任务正在运行或待处理，强制显示日志
      if (selectedTask.status === TranscriptionTaskStatus.RUNNING || 
          selectedTask.status === TranscriptionTaskStatus.PENDING) {
        setViewMode('log');
      } else if (selectedTask.status === TranscriptionTaskStatus.COMPLETED) {
        // 已完成的任务，默认显示结果视图
        setViewMode('result');
      } else if (selectedTask.status === TranscriptionTaskStatus.FAILED) {
        // 失败的任务，默认显示日志视图
        setViewMode('log');
      }
    }
    
    // 更新上一次的任务 ID
    previousTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId, selectedTask]);

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
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* 上部分：转写记录 */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">转写记录</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={onCreateTask}
            disabled={!canCreateTask}
            title={!canCreateTask ? '视频资源正在提取音频，请稍候...' : undefined}
          >
            创建转写任务
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <HiDocumentText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无转写任务</p>
            <p className="text-sm mt-2">点击上方按钮创建转写任务</p>
          </div>
        ) : (
          <Select
            value={selectedTaskId || ''}
            options={[
              { value: '', label: '请选择...', disabled: true },
              ...sortedTasks.map((task) => ({
                value: task.id,
                label: `${new Date(task.created_at).toLocaleString('zh-CN')} - ${getStatusText(task.status)}${
                  task.status === TranscriptionTaskStatus.COMPLETED ? ' ✓' : ''
                }`,
              })),
            ]}
            onChange={(value) => onSelectTask(value || null)}
            size="sm"
            placeholder="请选择..."
            aria-label="选择转写任务"
          />
        )}
      </div>

      {/* 下部分：转写结果/日志展示 */}
      {selectedTask && (
        <div className="flex-1 flex flex-col min-h-0 mt-4 border-base-300">
          {/* 切换按钮 */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">
                {viewMode === 'result' ? '转写结果' : '运行日志'}
              </h3>
              {/* 如果任务正在运行，在标题旁边显示停止按钮 */}
              {selectedTask && selectedTask.status === TranscriptionTaskStatus.RUNNING && (
                <button
                  className="btn btn-warning btn-sm"
                  onClick={handleStopTask}
                  title="停止任务"
                >
                  <HiStop className="w-4 h-4 mr-1" />
                  停止
                </button>
              )}
              {viewMode === 'result' && jsonData && (
                <button
                  className="btn btn-sm btn-ghost btn-circle"
                  onClick={() => setShowInfoModal(true)}
                  title="查看转写信息"
                >
                  <HiInformationCircle className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 导出按钮 */}
              {selectedTask.status === TranscriptionTaskStatus.COMPLETED && 
               (jsonData?.transcription?.length ?? 0) > 0 && (
                <button
                  className="btn btn-sm btn-primary btn-ghost"
                  onClick={handleExportSRT}
                  title="导出为SRT格式"
                >
                  <HiArrowDownTray className="w-4 h-4" />
                </button>
              )}
              {/* 删除按钮 */}
              {selectedTask.status !== TranscriptionTaskStatus.RUNNING && 
               selectedTask.status !== TranscriptionTaskStatus.PENDING && (
                <button
                  className="btn btn-sm btn-error btn-ghost"
                  onClick={() => setShowDeleteModal(true)}
                  title="删除任务"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              )}
              {/* 切换按钮组 */}
              {(selectedTask.status === TranscriptionTaskStatus.COMPLETED || 
                selectedTask.status === TranscriptionTaskStatus.RUNNING ||
                selectedTask.status === TranscriptionTaskStatus.PENDING ||
                selectedTask.status === TranscriptionTaskStatus.FAILED) && (
                <div className="join">
                  {selectedTask.status === TranscriptionTaskStatus.COMPLETED && (
                    <button
                      className={`join-item btn btn-sm ${viewMode === 'result' ? 'btn-active' : ''}`}
                      onClick={() => setViewMode('result')}
                    >
                      转写结果
                    </button>
                  )}
                  <button
                    className={`join-item btn btn-sm ${viewMode === 'log' ? 'btn-active' : ''}`}
                    onClick={() => setViewMode('log')}
                  >
                    运行日志
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 内容区域 */}
          <div className="flex-1 overflow-auto min-h-0">
            {/* 如果任务正在运行或待处理，强制显示日志视图 */}
            {(viewMode === 'result' && 
              (selectedTask.status === TranscriptionTaskStatus.RUNNING || 
               selectedTask.status === TranscriptionTaskStatus.PENDING)) ? (
              // 运行中或待处理的任务即使选择了结果视图，也显示日志
              <div className="bg-base-200 rounded-lg border border-base-300 p-4">
                <div className="text-sm text-base-content font-mono whitespace-pre-wrap break-words max-h-full overflow-auto">
                  {/* 显示保存的日志 */}
                  {selectedTask.log && (
                    <div className="mb-2">
                      {selectedTask.log}
                    </div>
                  )}
                  {/* 显示实时日志 */}
                  {realtimeLog && (
                    <div className={selectedTask.log ? 'mt-2 pt-2 border-t border-base-300' : ''}>
                      <div className="text-xs text-base-content/70 mb-1">实时日志:</div>
                      {realtimeLog}
                    </div>
                  )}
                  {/* 如果没有日志 */}
                  {!selectedTask.log && !realtimeLog && (
                    <div className="text-base-content/50">
                      等待日志输出...
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            ) : viewMode === 'result' ? (
              // 显示转写结果
              selectedTask.status === TranscriptionTaskStatus.COMPLETED ? (
                resultContent !== null ? (
                  resultContent ? (
                    jsonData ? (
                      // 显示 JSON 格式的结果
                      <div className="space-y-2">
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
                ) : null
              ) : (
                // 如果任务失败，也显示日志
                selectedTask.status === TranscriptionTaskStatus.FAILED ? (
                  <div className="bg-base-200 rounded-lg border border-base-300 p-4">
                    <div className="text-sm text-base-content font-mono whitespace-pre-wrap break-words max-h-full overflow-auto">
                      {selectedTask.error && (
                        <div className="text-error mb-2">
                          <div className="font-semibold">错误信息:</div>
                          {selectedTask.error}
                        </div>
                      )}
                      {selectedTask.log && (
                        <div className={selectedTask.error ? 'mt-2 pt-2 border-t border-base-300' : ''}>
                          {selectedTask.log}
                        </div>
                      )}
                      {realtimeLog && (
                        <div className={(selectedTask.log || selectedTask.error) ? 'mt-2 pt-2 border-t border-base-300' : ''}>
                          <div className="text-xs text-base-content/70 mb-1">实时日志:</div>
                          {realtimeLog}
                        </div>
                      )}
                      {!selectedTask.error && !selectedTask.log && !realtimeLog && (
                        <div className="text-base-content/50">
                          暂无日志
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-base-content/50">
                    <p>转写尚未完成</p>
                  </div>
                )
              )
            ) : (
              // 显示运行日志
              <div className="bg-base-200 rounded-lg border border-base-300 p-4">
                <div className="text-sm text-base-content font-mono whitespace-pre-wrap break-words max-h-full overflow-auto">
                  {/* 显示保存的日志 */}
                  {selectedTask.log && (
                    <div className="mb-2">
                      {selectedTask.log}
                    </div>
                  )}
                  {/* 显示实时日志 */}
                  {realtimeLog && (
                    <div className={selectedTask.log ? 'mt-2 pt-2 border-t border-base-300' : ''}>
                      <div className="text-xs text-base-content/70 mb-1">实时日志:</div>
                      {realtimeLog}
                    </div>
                  )}
                  {/* 如果没有日志 */}
                  {!selectedTask.log && !realtimeLog && (
                    <div className="text-base-content/50">
                      {selectedTask.status === TranscriptionTaskStatus.RUNNING
                        ? '等待日志输出...'
                        : '暂无日志'}
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* 底部信息 */}
          {viewMode === 'result' && jsonData && jsonData.transcription && jsonData.transcription.length > 0 && (
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

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="删除转写任务"
        message="确定要删除这个转写任务吗？删除后无法恢复。"
        onConfirm={handleDeleteTask}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};

export default TranscriptionHistory;

