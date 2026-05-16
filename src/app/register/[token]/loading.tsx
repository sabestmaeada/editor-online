import { Skeleton } from "@/components/skeleton";

export default function RegisterLoading() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-52" />
        </header>

        <div className="space-y-4">
          {/* Email (readonly) */}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          {/* Display name */}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          {/* Password */}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          {/* Confirm */}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
          {/* Submit */}
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="space-y-1">
          <Skeleton className="mx-auto h-3 w-3/4" />
          <Skeleton className="mx-auto h-3 w-1/2" />
        </div>
      </div>
    </main>
  );
}
