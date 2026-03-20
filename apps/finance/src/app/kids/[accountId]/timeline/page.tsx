import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { collectTimeline } from '@/lib/kids/timeline'
import TimelineClient from './TimelineClient'

export const dynamic = 'force-dynamic'

export default async function TimelinePage({
  params,
}: {
  params: { accountId: string }
}) {
  const account = await prisma.account.findUnique({
    where: { id: params.accountId },
    select: { id: true, name: true, ownerAge: true },
  })

  if (!account) notFound()

  const events = await collectTimeline(account.id)

  return (
    <TimelineClient
      accountName={account.name}
      events={events}
      accountId={account.id}
    />
  )
}
