import { redirect } from 'next/navigation';
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; client?: string }> }) {
  const { q, client } = await searchParams;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (client) params.set('client', client);
  const query = params.toString();
  redirect(query ? `/?${query}` : '/');
}
