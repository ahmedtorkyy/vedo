import type { ReactNode } from 'react'

interface MainLayoutProps {
  sidebar: ReactNode
  children: ReactNode
}

export function MainLayout({ sidebar, children }: MainLayoutProps) {
  return (
    <div className="flex h-svh overflow-hidden">
      {sidebar}
      <main role="main" className="flex flex-1 flex-col overflow-hidden bg-gray-950">
        {children}
      </main>
    </div>
  )
}
