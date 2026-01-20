"use client"

import * as React from "react"

type PageActionsContextValue = {
  actions: React.ReactNode
  setActions: (actions: React.ReactNode) => void
}

const PageActionsContext = React.createContext<PageActionsContextValue | null>(null)

function PageActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null)

  const value = React.useMemo(() => ({ actions, setActions }), [actions])

  return (
    <PageActionsContext.Provider value={value}>
      {children}
    </PageActionsContext.Provider>
  )
}

function usePageActions() {
  const context = React.useContext(PageActionsContext)
  if (!context) {
    throw new Error("usePageActions must be used within PageActionsProvider")
  }
  return context
}

function PageActions({ children }: { children: React.ReactNode }) {
  const { setActions } = usePageActions()

  React.useEffect(() => {
    setActions(children)
    return () => setActions(null)
  }, [children, setActions])

  return null
}

export { PageActionsProvider, PageActions, usePageActions }
