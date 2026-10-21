'use client'

import { motion } from 'framer-motion'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animate?: boolean
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animate = true
}: SkeletonProps) {
  const baseClass = 'bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800'
  
  const variantClass = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl'
  }[variant]

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  const skeleton = (
    <div
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
    >
      {animate && (
        <motion.div
          className="h-full w-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear'
          }}
        />
      )}
    </div>
  )

  return skeleton
}

// Preset skeleton patterns for common UI elements
export function TranscriptSkeleton() {
  return (
    <div className="apple-glass rounded-3xl p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" width={64} height={64} />
        <div className="flex-1 space-y-2">
          <Skeleton width="40%" height={24} />
          <Skeleton width="60%" height={16} />
        </div>
      </div>
      
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} height={20} width={`${90 - i * 5}%`} />
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="apple-glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="rounded" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={14} />
        </div>
      </div>
      <Skeleton height={80} variant="rounded" />
    </div>
  )
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

export function NavSkeleton() {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={36} height={36} />
        <Skeleton width={100} height={24} />
      </div>
      <div className="flex items-center gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} width={80} height={32} variant="rounded" />
        ))}
      </div>
    </div>
  )
}
