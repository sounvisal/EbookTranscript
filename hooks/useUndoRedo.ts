'use client'

import { useState, useCallback } from 'react'

export interface UseUndoRedoReturn<T> {
  state: T
  set: (newPresent: T | ((curr: T) => T)) => void
  undo: () => T | undefined
  redo: () => T | undefined
  canUndo: boolean
  canRedo: boolean
  pastCount: number
  futureCount: number
  reset: (newPresent: T) => void
}

/**
 * Generic history hook supporting undo/redo up to maxHistory states.
 */
export function useUndoRedo<T>(initialPresent: T, maxHistory = 50): UseUndoRedoReturn<T> {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState<T>(initialPresent)
  const [future, setFuture] = useState<T[]>([])

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  const undo = useCallback((): T | undefined => {
    if (past.length === 0) return undefined
    const previous = past[past.length - 1]
    const newPast = past.slice(0, past.length - 1)
    setPast(newPast)
    setFuture((f) => [present, ...f])
    setPresent(previous)
    return previous
  }, [past, present])

  const redo = useCallback((): T | undefined => {
    if (future.length === 0) return undefined
    const next = future[0]
    const newFuture = future.slice(1)
    setPast((p) => [...p, present])
    setFuture(newFuture)
    setPresent(next)
    return next
  }, [future, present])

  const set = useCallback(
    (newPresentOrFn: T | ((curr: T) => T)) => {
      setPresent((curr) => {
        const next =
          typeof newPresentOrFn === 'function'
            ? (newPresentOrFn as (curr: T) => T)(curr)
            : newPresentOrFn

        if (next === curr) return curr

        setPast((p) => [...p.slice(-(maxHistory - 1)), curr])
        setFuture([])
        return next
      })
    },
    [maxHistory]
  )

  const reset = useCallback((newPresent: T) => {
    setPast([])
    setPresent(newPresent)
    setFuture([])
  }, [])

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    pastCount: past.length,
    futureCount: future.length,
    reset
  }
}
