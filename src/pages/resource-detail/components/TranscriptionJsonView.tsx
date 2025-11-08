import { useMemo } from 'react'
import { uniqBy } from 'lodash'
import {
  TranscriptionResultJson,
  TranscriptionSegment,
} from '../../../models/TranscriptionResult'
import { formatSubtitleTime } from '../../../utils/format'

interface TranscriptionJsonViewProps {
  data: TranscriptionResultJson
}

const TranscriptionJsonView = ({ data }: TranscriptionJsonViewProps) => {
  const deduplicatedTranscription = useMemo(() => {
    return uniqBy(data.transcription, 'text')
  }, [data.transcription])

  if (!deduplicatedTranscription || deduplicatedTranscription.length === 0) {
    return null
  }

  return (
    <>
      {deduplicatedTranscription.map(
        (segment: TranscriptionSegment, index: number) => (
          <div
            key={index}
            className="rounded-lg p-3 bg-base-100 hover:bg-base-200 transition-colors"
          >
            <div className="flex items-center justify-start gap-2">
              <div className="badge badge-sm badge-soft">#{index + 1}</div>
              <div className="flex flex-col">
                <div className="text-xs text-base-content/50">
                  {formatSubtitleTime(segment.timestamps.from)} → {formatSubtitleTime(segment.timestamps.to)}
                </div>
                <div className="text-sm text-base-content leading-relaxed">
                  {segment.text}
                </div>
              </div>
            </div>
          </div>
        ),
      )}
    </>
  )
}

export default TranscriptionJsonView
