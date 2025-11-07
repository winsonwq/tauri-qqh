import { TranscriptionTask, TranscriptionTaskStatus } from '../../../models';
import { TranscriptionResultJson } from '../../../models/TranscriptionResult';
import TranscriptionJsonView from './TranscriptionJsonView';

interface TranscriptionResultProps {
  task: TranscriptionTask | null;
  resultContent: string | null;
}

const TranscriptionResult = ({ task, resultContent }: TranscriptionResultProps) => {
  if (!task || task.status !== TranscriptionTaskStatus.COMPLETED) {
    return null;
  }

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
    <div className="card bg-base-100">
      <div className="card-body">
        <h3 className="text-lg font-semibold mb-3">转写结果</h3>
        {resultContent !== null ? (
          resultContent ? (
            jsonData ? (
              // 显示 JSON 格式的结果
              <TranscriptionJsonView data={jsonData} />
            ) : (
              // 显示文本格式的结果（兼容旧格式）
              <div className="bg-base-200 rounded-lg border border-base-300 p-4">
                <div className="text-sm text-base-content whitespace-pre-wrap break-words overflow-auto max-h-96">
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
    </div>
  );
};

export default TranscriptionResult;

