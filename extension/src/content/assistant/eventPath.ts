export function eventPathContains(event: Event, target: EventTarget): boolean {
  return event.composedPath().includes(target)
}

export function findEventPathElement(event: Event, className: string): Element | undefined {
  return event.composedPath().find(
    (target): target is Element => target instanceof Element && target.classList.contains(className),
  )
}
