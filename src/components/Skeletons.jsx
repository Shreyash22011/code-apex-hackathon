export function SkeletonCard() {
  return (
    <div className="bg-secondary rounded-lg p-4 w-full">
      <div className="h-6 bg-border rounded animate-skeleton mb-3 w-3/4"></div>
      <div className="h-4 bg-border rounded animate-skeleton mb-2 w-full"></div>
      <div className="h-4 bg-border rounded animate-skeleton w-5/6"></div>
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="w-full space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-4">
          {[...Array(4)].map((_, j) => (
            <div key={j} className="flex-1 h-10 bg-border rounded animate-skeleton"></div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonText() {
  return (
    <div className="space-y-2 w-full">
      <div className="h-4 bg-border rounded animate-skeleton w-full"></div>
      <div className="h-4 bg-border rounded animate-skeleton w-5/6"></div>
      <div className="h-4 bg-border rounded animate-skeleton w-4/6"></div>
    </div>
  )
}

export function SkeletonProgressBar() {
  return (
    <div className="w-full">
      <div className="h-2 bg-border rounded-full animate-skeleton"></div>
      <div className="h-4 bg-border rounded animate-skeleton mt-2 w-20"></div>
    </div>
  )
}
