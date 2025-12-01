import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppDispatch } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { TranscriptionResource, SourceType } from '../../models';
import { HiPlus, HiDocumentText, HiLink } from 'react-icons/hi2';
import ResourceCard from './components/ResourceCard';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import { useMessage } from '../../components/Toast';
import { isValidUrl, extractResourceNameFromUrl } from '../../utils/urlUtils';

const HomePage = () => {
  const dispatch = useAppDispatch();
  const [resources, setResources] = useState<TranscriptionResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<TranscriptionResource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const message = useMessage();
  
  // 瀑布流布局相关 - 响应式，至少3列
  const masonryRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);
  const [columns, setColumns] = useState<TranscriptionResource[][]>([]);
  
  // 计算列数（至少3列）
  const calculateColumnCount = () => {
    if (!masonryRef.current) return 3;
    const width = masonryRef.current.offsetWidth;
    // 根据宽度计算列数，但至少3列
    // 假设每列最小宽度约为 280px（包括 gap）
    const minColumnWidth = 280;
    const gap = 16; // gap-4 = 1rem = 16px
    // 计算能容纳多少列：总宽度 = 列数 * 列宽 + (列数 - 1) * gap
    // 即：width >= cols * minColumnWidth + (cols - 1) * gap
    // 解得：cols <= (width + gap) / (minColumnWidth + gap)
    const calculatedCols = Math.floor((width + gap) / (minColumnWidth + gap));
    // 至少3列，但不超过计算出的列数
    return Math.max(3, Math.min(calculatedCols, 6)); // 最多6列，避免过多
  };
  
  // 将资源分配到各列（瀑布流算法）
  const distributeToColumns = (items: TranscriptionResource[], cols: number) => {
    const result: TranscriptionResource[][] = Array.from({ length: cols }, () => []);
    items.forEach((item) => {
      // 找到最短的列
      const shortestColumnIndex = result.reduce((minIndex, col, index) => {
        return col.length < result[minIndex].length ? index : minIndex;
      }, 0);
      result[shortestColumnIndex].push(item);
    });
    return result;
  };
  
  // 更新列数和分配
  useEffect(() => {
    const updateLayout = () => {
      if (!masonryRef.current) return;
      const cols = calculateColumnCount();
      setColumnCount(cols);
      setColumns(distributeToColumns(resources, cols));
    };
    
    updateLayout();
    
    const handleResize = () => {
      updateLayout();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resources]);
  
  // 当资源或列数变化时，重新分配
  useLayoutEffect(() => {
    if (resources.length > 0 && columnCount > 0) {
      setColumns(distributeToColumns(resources, columnCount));
    } else {
      setColumns([]);
    }
  }, [resources, columnCount]);

  // 加载转写资源列表
  const loadResources = async () => {
    try {
      const result = await invoke<TranscriptionResource[]>('get_transcription_resources');
      // 按创建时间倒序排列
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setResources(result);
    } catch (err) {
      console.error('加载资源失败:', err);
      setError(err instanceof Error ? err.message : '加载资源失败');
    }
  };

  useEffect(() => {
    loadResources();
  }, []);

  // 选择音频或视频文件并创建转写资源
  const handleSelectAudioFile = async () => {
    try {
      setLoading(true);
      setError(null);

      // 打开文件选择对话框，支持音频和视频文件
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: '音频和视频文件',
            extensions: [
              // 音频格式
              'mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'wma',
              // 视频格式
              'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp',
            ],
          },
          {
            name: '音频文件',
            extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'wma'],
          },
          {
            name: '视频文件',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp'],
          },
        ],
      });

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

      // 规范化路径（统一路径分隔符，便于比较）
      const normalizePath = (path: string) => path.replace(/\\/g, '/');

      // 检查是否已存在相同路径的资源
      const existingResources = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const normalizedFilePath = normalizePath(filePath);
      const existingResource = existingResources.find(
        (r) => normalizePath(r.file_path) === normalizedFilePath
      );

      if (existingResource) {
        // 如果已存在相同路径的资源，直接打开资源详情页
        dispatch(setCurrentPage({ feature: 'home', page: `resource:${existingResource.id}` }));
        setLoading(false);
        return;
      }

      // 创建新的转写资源
      const newResource = await invoke<TranscriptionResource>('create_transcription_resource', {
        name: fileName,
        filePath: filePath,
      });

      // 创建成功后，跳转到资源详情页
      dispatch(setCurrentPage({ feature: 'home', page: `resource:${newResource.id}` }));
      
      // 重新加载资源列表
      await loadResources();
    } catch (err) {
      console.error('处理文件失败:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || '处理文件失败');
    } finally {
      setLoading(false);
    }
  };

  // 点击资源卡片，进入详情页
  const handleResourceClick = (resourceId: string) => {
    dispatch(setCurrentPage({ feature: 'home', page: `resource:${resourceId}` }));
  };

  // 处理URL资源创建
  const handleCreateUrlResource = async () => {
    if (!urlInput.trim()) {
      message.error('请输入URL');
      return;
    }

    if (!isValidUrl(urlInput.trim())) {
      message.error('无效的URL格式，请提供以 http:// 或 https:// 开头的URL');
      return;
    }

    try {
      setUrlLoading(true);
      setError(null);

      const url = urlInput.trim();
      
      // 检查是否已存在相同URL的资源
      const existingResources = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const existingResource = existingResources.find(
        (r) => r.source_type === SourceType.URL && r.file_path === url
      );

      if (existingResource) {
        // 如果已存在相同URL的资源，直接打开资源详情页
        dispatch(setCurrentPage({ feature: 'home', page: `resource:${existingResource.id}` }));
        setShowUrlModal(false);
        setUrlInput('');
        setUrlLoading(false);
        return;
      }

      // 从URL提取资源名称
      const resourceName = extractResourceNameFromUrl(url);

      // 创建新的URL资源
      const newResource = await invoke<TranscriptionResource>('create_transcription_resource_from_url', {
        name: resourceName,
        url: url,
      });

      // 创建成功后，跳转到资源详情页
      dispatch(setCurrentPage({ feature: 'home', page: `resource:${newResource.id}` }));
      
      // 重新加载资源列表
      await loadResources();
      
      setShowUrlModal(false);
      setUrlInput('');
      message.success('URL资源创建成功');
    } catch (err) {
      console.error('创建URL资源失败:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || '创建URL资源失败');
      message.error(errorMessage || '创建URL资源失败');
    } finally {
      setUrlLoading(false);
    }
  };

  // 删除资源
  const handleDeleteResource = async () => {
    if (!resourceToDelete || isDeleting) return;
    try {
      setIsDeleting(true);
      await invoke('delete_transcription_resource', { resourceId: resourceToDelete.id });
      setResources((prev) => prev.filter((item) => item.id !== resourceToDelete.id));
      message.success('资源已删除');
    } catch (err) {
      console.error('删除资源失败:', err);
      message.error(err instanceof Error ? err.message : '删除资源失败');
    } finally {
      setIsDeleting(false);
      setResourceToDelete(null);
    }
  };

  return (
    <div className="h-full p-6 space-y-6">
      {/* 操作区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 转写资源 Block */}
        <div className="card card-border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h2 className="card-title">转写资源</h2>
                <p className="text-base-content/70 mt-1">选择本地音频或视频文件</p>
              </div>
              <div className="ml-4">
                <button
                  className={`btn btn-primary ${loading ? 'loading' : ''}`}
                  onClick={handleSelectAudioFile}
                  disabled={loading}
                >
                  <HiPlus className="w-5 h-5" />
                  {loading ? '处理中...' : '添加文件'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 添加 URL Block */}
        <div className="card card-border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h2 className="card-title">添加 URL</h2>
                <p className="text-base-content/70 mt-1">添加 YouTube、Bilibili 等视频链接</p>
              </div>
              <div className="ml-4">
                <button
                  className={`btn btn-outline btn-primary ${urlLoading ? 'loading' : ''}`}
                  onClick={() => setShowUrlModal(true)}
                  disabled={urlLoading}
                >
                  <HiLink className="w-5 h-5" />
                  添加URL
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* 资源列表 */}
      {resources.length === 0 ? (
        <div className="card card-border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="text-center py-12 text-base-content/50">
              <HiDocumentText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">暂无转写资源</p>
              <p className="text-sm mt-2">点击上方按钮选择音频或视频文件创建资源</p>
            </div>
          </div>
        </div>
      ) : (
        <div ref={masonryRef} className="flex gap-4 overflow-hidden pb-4">
          {Array.from({ length: columnCount }, (_, colIndex) => (
            <div key={colIndex} className="flex-1 flex flex-col gap-4 min-w-0">
              {columns[colIndex]?.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onClick={handleResourceClick}
                  onDelete={setResourceToDelete}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <DeleteConfirmModal
        isOpen={!!resourceToDelete}
        title="删除资源"
        message="确定要删除这个资源吗？删除后无法恢复，相关的转写任务将保留。"
        onConfirm={handleDeleteResource}
        onCancel={() => {
          if (isDeleting) return;
          setResourceToDelete(null);
        }}
        confirmLoading={isDeleting}
      />

      {/* URL输入对话框 */}
      {showUrlModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">添加URL资源</h3>
            <p className="text-sm text-base-content/70 mb-4">
              支持 YouTube、Bilibili 等视频平台的链接。系统将自动获取视频标题和字幕并转换为转写结果。
            </p>
            <div className="form-control">
              <label className="label">
                <span className="label-text">视频URL</span>
              </label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                className="input input-bordered w-full"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !urlLoading) {
                    handleCreateUrlResource();
                  }
                }}
                disabled={urlLoading}
              />
            </div>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowUrlModal(false);
                  setUrlInput('');
                }}
                disabled={urlLoading}
              >
                取消
              </button>
              <button
                className={`btn btn-primary ${urlLoading ? 'loading' : ''}`}
                onClick={handleCreateUrlResource}
                disabled={urlLoading || !urlInput.trim()}
              >
                {urlLoading ? '正在获取视频信息...' : '创建'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => {
            if (!urlLoading) {
              setShowUrlModal(false);
              setUrlInput('');
            }
          }}></div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
