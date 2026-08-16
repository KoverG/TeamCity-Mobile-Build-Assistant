import { useEffect, useState, type RefObject } from 'react'

export interface ScrollMetrics {
  visible: boolean
  trackHeight: number
  thumbHeight: number
  thumbOffset: number
  overflowStart: boolean
  overflowEnd: boolean
}

const emptyMetrics: ScrollMetrics = {
  visible: false,
  trackHeight: 0,
  thumbHeight: 0,
  thumbOffset: 0,
  overflowStart: false,
  overflowEnd: false,
}

function sameMetrics(left: ScrollMetrics, right: ScrollMetrics): boolean {
  return left.visible === right.visible &&
    left.trackHeight === right.trackHeight &&
    left.thumbHeight === right.thumbHeight &&
    left.thumbOffset === right.thumbOffset &&
    left.overflowStart === right.overflowStart &&
    left.overflowEnd === right.overflowEnd
}

export function useScrollMetrics<T extends HTMLElement>(
  viewportRef: RefObject<T | null>,
  refreshKey: unknown,
): ScrollMetrics {
  const [metrics, setMetrics] = useState(emptyMetrics)

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) {
      setMetrics(emptyMetrics)
      return
    }
    const visibleViewport = viewport

    function update() {
      const clientHeight = visibleViewport.clientHeight
      const scrollHeight = visibleViewport.scrollHeight
      const trackHeight = Math.max(0, clientHeight - 4)
      const visible = scrollHeight > clientHeight + 1
      const thumbHeight = visible
        ? Math.min(trackHeight, Math.max(18, trackHeight * clientHeight / scrollHeight))
        : 0
      const maximumScroll = Math.max(1, scrollHeight - clientHeight)
      const thumbOffset = visible
        ? (trackHeight - thumbHeight) * visibleViewport.scrollTop / maximumScroll
        : 0
      const nextMetrics = {
        visible,
        trackHeight,
        thumbHeight,
        thumbOffset,
        overflowStart: visible && visibleViewport.scrollTop > 1,
        overflowEnd: visible && visibleViewport.scrollTop + clientHeight < scrollHeight - 1,
      }
      setMetrics((current) => sameMetrics(current, nextMetrics) ? current : nextMetrics)
    }

    update()
    visibleViewport.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(visibleViewport)
    return () => {
      visibleViewport.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [refreshKey, viewportRef])

  return metrics
}
