import { TranscriptionResultJson, TranscriptionSegment } from '../../../models/TranscriptionResult';

interface TranscriptionJsonViewProps {
  data: TranscriptionResultJson;
}

const TranscriptionJsonView = ({ data }: TranscriptionJsonViewProps) => {
  const formatTime = (timeStr: string) => {
    // 格式化时间戳显示
    return timeStr;
  };

  const formatDuration = (from: number, to: number) => {
    const duration = ((to - from) / 1000).toFixed(1);
    return `${duration}秒`;
  };

  if (!data.transcription || data.transcription.length === 0) {
    return null;
  }

  return (
    <>
      {data.transcription.map((segment: TranscriptionSegment, index: number) => (
        <div
          key={index}
          className="border border-base-300 rounded-lg p-3 bg-base-100 hover:bg-base-200 transition-colors"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="text-xs text-base-content/50">
              时间: {formatTime(segment.timestamps.from)} → {formatTime(segment.timestamps.to)}
            </div>
            <div className="badge badge-sm badge-primary">#{index + 1}</div>
          </div>
          <div className="text-sm text-base-content mt-2 leading-relaxed">
            {segment.text}
          </div>
        </div>
      ))}
    </>
  );
};

export default TranscriptionJsonView;

