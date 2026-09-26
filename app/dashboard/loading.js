export default function DashboardLoading() {
  return (
    <div className="flex items-center gap-3 text-inkDim text-sm py-10">
      <span className="w-5 h-5 border-2 border-borderBright border-t-accent rounded-full animate-spin shrink-0" />
      Loading...
    </div>
  );
}
