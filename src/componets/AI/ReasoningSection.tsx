import React, { useState } from 'react'

interface ReasoningSectionProps {
  reasoning: string
}

export const ReasoningSection: React.FC<ReasoningSectionProps> = ({ reasoning }) => {
  const [showReasoning, setShowReasoning] = useState(true)

  return (
    <div className="mb-3 p-3 bg-base-300 rounded-lg border-l-4 border-primary relative">
      <div className="text-xs font-semibold text-primary mb-2">思考过程</div>
      <div className="relative min-h-[2rem]">
        {showReasoning ? (
          <div className="text-sm text-base-content/80 whitespace-pre-wrap break-words pb-6">
            {reasoning}
          </div>
        ) : null}
        <button
          className="btn btn-ghost btn-xs text-left text-xs text-base-content/70 hover:text-base-content mt-2 p-0 h-auto min-h-0 p-1"
          onClick={() => setShowReasoning(!showReasoning)}
        >
          {showReasoning ? '收起' : '展开'}
        </button>
      </div>
    </div>
  )
}

