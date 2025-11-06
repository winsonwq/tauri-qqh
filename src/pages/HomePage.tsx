import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  TranscriptionResource,
  TranscriptionTask,
  TranscriptionTaskStatus,
  TranscriptionParams,
} from '../models';

const HomePage = () => {
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [resources, setResources] = useState<Map<string, TranscriptionResource>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [viewResultTaskId, setViewResultTaskId] = useState<string | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);

  // 加载转写任务列表
  const loadTasks = async () => {
    try {
      const result = await invoke<TranscriptionTask[]>('get_transcription_tasks', {
        resourceId: null,
      });
      setTasks(result);
    } catch (err) {
      console.error('加载任务失败:', err);
      setError(err instanceof Error ? err.message : '加载任务失败');
    }
  };

  // 加载转写资源列表
  const loadResources = async () => {
    try {
      const result = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const resourceMap = new Map<string, TranscriptionResource>();
      result.forEach((resource) => {
        resourceMap.set(resource.id, resource);
      });
      setResources(resourceMap);
    } catch (err) {
      console.error('加载资源失败:', err);
    }
  };

  useEffect(() => {
    loadTasks();
    loadResources();
  }, []);

  // 选择音频文件并创建转写资源
  const handleSelectAudioFile = async () => {
    try {
      setLoading(true);
      setError(null);

      // 打开文件选择对话框
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: '音频文件',
            extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'wma'],
          },
        ],
      });
      console.log(111111111, selected);

      if (!selected || Array.isArray(selected)) {
        setLoading(false);
        return;
      }

      // Tauri 2.0 返回的是路径字符串或 Path 对象
      let filePath: string;
      let fileName: string;
      
      if (typeof selected === 'string') {
        filePath = selected;
        fileName = filePath.split(/[/\\]/).pop() || '未知文件';
      } else {
        // selected 是 Path 对象，使用类型断言
        const pathObj = selected as { path?: string; name?: string; toString?: () => string };
        filePath = pathObj.path || (pathObj.toString ? pathObj.toString() : String(selected));
        fileName = pathObj.name || filePath.split(/[/\\]/).pop() || '未知文件';
      }

      // 创建转写资源
      const resource = await invoke<TranscriptionResource>('create_transcription_resource', {
        name: fileName,
        filePath: filePath,
      });

      // 创建默认转写参数
      const defaultParams: TranscriptionParams = {
        model: 'base',
        language: 'zh',
        device: 'cpu',
        compute_type: 'int8',
        word_timestamps: true,
      };

      // 创建转写任务
      const task = await invoke<TranscriptionTask>('create_transcription_task', {
        resourceId: resource.id,
        params: defaultParams,
      });

      // 执行转写任务
      console.log('开始执行转写任务:', task.id);
      const result = await invoke<string>('execute_transcription_task', {
        taskId: task.id,
        resourceId: resource.id,
      });
      console.log('转写任务完成:', result);

      // 重新加载任务列表和资源列表
      await loadTasks();
      await loadResources();
    } catch (err) {
      console.error('处理文件失败:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('错误详情:', {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        fullError: err,
      });
      setError(errorMessage || '处理文件失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除转写任务
  const handleDeleteTask = async (taskId: string) => {
    try {
      await invoke('delete_transcription_task', { taskId });
      await loadTasks();
      await loadResources();
      setDeleteConfirmTaskId(null);
    } catch (err) {
      console.error('删除任务失败:', err);
      setError(err instanceof Error ? err.message : '删除任务失败');
      setDeleteConfirmTaskId(null);
    }
  };

  // 查看转写结果
  const handleViewResult = async (taskId: string) => {
    try {
      const content = await invoke<string>('read_transcription_result', { taskId });
      setResultContent(content);
      setViewResultTaskId(taskId);
    } catch (err) {
      console.error('读取结果失败:', err);
      setError(err instanceof Error ? err.message : '读取结果失败');
    }
  };

  // 获取状态显示文本
  const getStatusText = (status: string) => {
    switch (status) {
      case TranscriptionTaskStatus.PENDING:
        return '待转写';
      case TranscriptionTaskStatus.RUNNING:
        return '转写中';
      case TranscriptionTaskStatus.COMPLETED:
        return '已完成';
      case TranscriptionTaskStatus.FAILED:
        return '失败';
      default:
        return status;
    }
  };

  // 获取状态颜色类
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case TranscriptionTaskStatus.PENDING:
        return 'badge-warning';
      case TranscriptionTaskStatus.RUNNING:
        return 'badge-info';
      case TranscriptionTaskStatus.COMPLETED:
        return 'badge-success';
      case TranscriptionTaskStatus.FAILED:
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  };

  return (
    <div className="space-y-6">
      {/* 操作区域 */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">音频转写</h2>
          <p className="text-base-content/70">选择音频文件进行转写，支持 MP3、WAV、M4A 等格式</p>
          <div className="card-actions justify-end mt-4">
            <button
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              onClick={handleSelectAudioFile}
              disabled={loading}
            >
              {loading ? '处理中...' : '选择音频文件'}
            </button>
          </div>
          {error && (
            <div className="alert alert-error mt-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* 转写任务列表 */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">转写任务列表</h2>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-base-content/50">
              <p>暂无转写任务</p>
              <p className="text-sm mt-2">点击上方按钮选择音频文件开始转写</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>资源名称</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>完成时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const resource = resources.get(task.resource_id);
                    return (
                      <tr key={task.id}>
                        <td>
                          <div className="font-medium text-sm">
                            {resource ? resource.name : task.resource_id}
                          </div>
                          {resource && (
                            <div className="text-xs text-base-content/50 truncate max-w-xs">
                              {resource.file_path}
                            </div>
                          )}
                          {task.error && (
                            <div className="text-xs text-error mt-1">{task.error}</div>
                          )}
                        </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(task.status)}`}>
                          {getStatusText(task.status)}
                        </span>
                      </td>
                      <td className="text-sm">
                        {new Date(task.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="text-sm">
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleString('zh-CN')
                          : '-'}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {task.status === TranscriptionTaskStatus.COMPLETED && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleViewResult(task.id)}
                            >
                              查看结果
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-error"
                            onClick={() => setDeleteConfirmTaskId(task.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认对话框 */}
      {deleteConfirmTaskId && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">确认删除</h3>
            <p className="py-4">确定要删除这个转写任务吗？此操作不可恢复。</p>
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => setDeleteConfirmTaskId(null)}
              >
                取消
              </button>
              <button
                className="btn btn-error"
                onClick={() => handleDeleteTask(deleteConfirmTaskId)}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查看结果对话框 */}
      {viewResultTaskId && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <h3 className="font-bold text-lg mb-4">转写结果</h3>
            {resultContent ? (
              <div className="mockup-code max-h-96 overflow-auto">
                <pre className="text-xs">
                  <code>{resultContent}</code>
                </pre>
              </div>
            ) : (
              <div className="text-center py-8 text-base-content/50">
                <span className="loading loading-spinner loading-lg"></span>
                <p className="mt-4">加载中...</p>
              </div>
            )}
            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setViewResultTaskId(null);
                  setResultContent(null);
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;

