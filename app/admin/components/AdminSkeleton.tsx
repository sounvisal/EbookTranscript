'use client'

import React from 'react'
import { Skeleton } from '@/components/ui/Skeleton'

export function AdminSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-20 pt-4 px-4 sm:px-6 animate-fade-in">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64 rounded-md" />
            <Skeleton className="h-3.5 w-96 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-32 rounded-xl" />
          <Skeleton className="h-8 w-20 rounded-xl" />
        </div>
      </div>

      {/* Time Machine Filter Skeleton */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800/70">
        <div className="flex gap-1.5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-5 w-48 rounded-md mr-2" />
      </div>

      {/* 6 KPI Cards Skeleton Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-5 w-5 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md mt-1" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        ))}
      </div>

      {/* Tab Navigation Switcher Skeleton */}
      <div className="flex gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 sm:w-32 rounded-xl" />
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="flex flex-col gap-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-52 rounded-md" />
            <Skeleton className="h-3 w-80 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>

        {/* Shimmer chart / table bars */}
        <div className="flex items-end justify-between gap-2 h-48 pt-6 border-b border-slate-100 dark:border-slate-800 px-2">
          {[40, 65, 30, 85, 55, 95, 45, 70, 60, 80, 50, 75, 90, 60].map((h, i) => (
            <Skeleton
              key={i}
              className="w-full rounded-t-md"
              style={{ height: `${h}%` } as React.CSSProperties}
            />
          ))}
        </div>

        {/* 3 cards grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3"
            >
              <Skeleton className="h-4 w-32 rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-2.5 w-full rounded-full" />
                <Skeleton className="h-2.5 w-4/5 rounded-full" />
                <Skeleton className="h-2.5 w-3/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
