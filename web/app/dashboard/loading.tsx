import { LoadingState } from '@/components/primitives';

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <LoadingState label="Loading protocol data" />
    </div>
  );
}
