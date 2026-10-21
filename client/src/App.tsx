import { ChecksGrid } from '@/components/ChecksGrid';
import { IpoTable } from '@/components/IpoTable';
import { StatusCard } from '@/components/StatusCard';

export default function App() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 font-sans sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">IPO Red-Flag &amp; Promise Tracker</h1>
        <p className="text-gray-600">
          Forensic checks on Indian mainboard IPO filings. Not investment advice.
        </p>
        <StatusCard />
      </header>
      <IpoTable />
      <ChecksGrid />
    </main>
  );
}
