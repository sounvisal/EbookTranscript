import { Skeleton } from '@/components/ui/Skeleton'

export function HistoryTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] border-collapse text-left">
        <thead className="border-b border-slate-200/60 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-6 py-4">Source / File Name</th>
            <th className="w-32 px-4 py-4">Language</th>
            <th className="w-28 px-4 py-4 text-right">Words</th>
            <th className="w-40 px-4 py-4">Date</th>
            <th className="w-36 px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/80">
          {Array.from({ length: 7 }).map((_, idx) => (
            <tr key={idx} className="animate-pulse">
              {/* Source / File */}
              <td className="max-w-md px-6 py-4">
                <div className="flex items-center gap-3.5">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className={`h-4 ${idx % 2 === 0 ? 'w-48' : 'w-36'}`} />
                    <Skeleton className="h-3 w-24 opacity-60" />
                  </div>
                </div>
              </td>

              {/* Language */}
              <td className="px-4 py-4">
                <Skeleton className="h-5 w-16 rounded-full" />
              </td>

              {/* Words */}
              <td className="px-4 py-4 text-right">
                <Skeleton className="ml-auto h-4 w-12" />
              </td>

              {/* Date */}
              <td className="px-4 py-4">
                <Skeleton className="h-4 w-20" />
              </td>

              {/* Actions */}
              <td className="px-6 py-4">
                <div className="flex items-center justify-end gap-1.5">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
