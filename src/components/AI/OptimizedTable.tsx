import { useState } from 'react'
import { HiArrowsPointingOut } from 'react-icons/hi2'

// 优化的表格组件，支持横向滚动和全屏查看
const OptimizedTable = ({ children }: { children?: React.ReactNode }) => {
  const [showFullscreen, setShowFullscreen] = useState(false)

  const tableContent = (
    <div 
      className="overflow-x-auto my-4 relative"
      style={{ 
        scrollbarWidth: 'thin',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <table className="min-w-full border-collapse border border-base-300 text-xs">
        {children}
      </table>
    </div>
  )

  if (showFullscreen) {
    return (
      <>
        {tableContent}
        <div 
          className="fixed inset-0 bg-base-100/95 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setShowFullscreen(false)}
        >
          <div 
            className="bg-base-100 rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] overflow-auto border border-base-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-base-200 px-4 py-2 flex justify-between items-center border-b border-base-300 z-10">
              <span className="font-semibold">表格全屏查看</span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowFullscreen(false)}
              >
                关闭
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-base-300">
                {children}
              </table>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="relative">
      {tableContent}
      <button
        className="absolute top-2 right-2 btn btn-xs z-10 bg-base-200/80 hover:bg-base-200"
        onClick={() => setShowFullscreen(true)}
        title="全屏查看表格"
      >
        <HiArrowsPointingOut className="h-3 w-3" />
      </button>
    </div>
  )
}

export default OptimizedTable

