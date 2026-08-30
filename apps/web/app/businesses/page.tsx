import { redirect } from 'next/navigation';
import { legacyBusinessTarget } from '../../lib/legacy-redirects';

// M10B: the legacy English business list is retired for customers.
export default function LegacyBusinessesPage() {
  redirect(legacyBusinessTarget());
}
