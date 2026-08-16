import type { ScrollMetrics } from './useScrollMetrics'

export function OverlayScrollbar({
  className,
  metrics,
  thumbWidth,
}: {
  className: string
  metrics: ScrollMetrics
  thumbWidth: number
}) {
  if (!metrics.visible) {
    return null
  }

  return (
    <span
      className={`tcba-scrollbar ${className}`}
      aria-hidden="true"
      style={{ height: `${metrics.trackHeight}px`, width: `${thumbWidth}px` }}
    >
      <span
        className="tcba-scrollbar__thumb"
        style={{
          height: `${metrics.thumbHeight}px`,
          transform: `translateY(${metrics.thumbOffset}px)`,
        }}
      />
    </span>
  )
}
