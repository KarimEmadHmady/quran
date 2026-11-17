import { notFound } from 'next/navigation';
import { TopicDetailClient } from './TopicDetailClient';

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id) || Number(id) > 4_294_967_295) notFound();
  return <TopicDetailClient id={Number(id)} />;
}
