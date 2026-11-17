import { TafsirsClient } from './TafsirsClient';

type Search = Record<string, string | string[] | undefined>;

export default async function AdminTafsirsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ayah } = await searchParams;
  const id = typeof ayah === 'string' && /^[1-9][0-9]{0,4}$/.test(ayah) ? Number(ayah) : null;
  return <TafsirsClient initialAyahId={id} />;
}
