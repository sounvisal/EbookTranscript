'use client'

export function Skeleton({
  className = '',
  animate = true,
  style
}: {
  className?: string
  animate?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={`rounded-lg bg-slate-200/80 dark:bg-slate-800/80 ${
        animate ? 'animate-pulse' : ''
      } ${className}`}
    />
  )
}

export function SkeletonText({
  lines = 3,
  className = ''
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}
