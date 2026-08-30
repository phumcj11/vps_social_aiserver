import { redirect } from 'next/navigation';
import { legacyBusinessTarget } from '../../../lib/legacy-redirects';

// M10B: the legacy English business detail is retired for customers; redirect to
// the corresponding Thai self-service hub (direct id mapping).
export default async function LegacyBusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(legacyBusinessTarget(id));
}
