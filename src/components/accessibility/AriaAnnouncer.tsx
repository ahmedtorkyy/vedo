import { createContext, useContext, useCallback, useRef } from 'react'

interface AriaAnnouncerContextValue {
  announce: (message: string, assertive?: boolean) => void
}

const AriaAnnouncerContext = createContext<AriaAnnouncerContextValue>({
  announce: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useAriaAnnouncer() {
  return useContext(AriaAnnouncerContext)
}

export function AriaAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const politeRef = useRef<HTMLDivElement>(null)
  const assertiveRef = useRef<HTMLDivElement>(null)

  const announce = useCallback((message: string, assertive = false) => {
    const el = assertive ? assertiveRef.current : politeRef.current
    if (!el) return
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = message
    })
  }, [])

  return (
    <AriaAnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        ref={politeRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </AriaAnnouncerContext.Provider>
  )
}
