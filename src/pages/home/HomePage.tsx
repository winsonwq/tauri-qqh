import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppDispatch } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { TranscriptionResource } from '../../models';
import { HiPlus, HiDocumentText } from 'react-icons/hi2';
import ResourceCard from './components/ResourceCard';

const HomePage = () => {
  const dispatch = useAppDispatch();
  const [resources, setResources] = useState<TranscriptionResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="h-full p-6 space-y-6">
      {/* 操作区域 */}
      <div className="card card-border bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="card-title">音频转写资源</h2>
              <p className="text-base-content/70 mt-1">选择音频文件创建转写资源，支持 MP3、WAV、M4A 等格式</p>
            </div>
            <button
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              onClick={handleSelectAudioFile}
              disabled={loading}
            >
              <HiPlus className="w-5 h-5" />
              {loading ? '处理中...' : '添加音频文件'}
            </button>
          </div>
          {error && (
            <div className="alert alert-error mt-4">
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* 资源列表 */}
      {resources.length === 0 ? (
        <div className="card card-border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="text-center py-12 text-base-content/50">
              <HiDocumentText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">暂无转写资源</p>
              <p className="text-sm mt-2">点击上方按钮选择音频文件创建资源</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onClick={handleResourceClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HomePage;
