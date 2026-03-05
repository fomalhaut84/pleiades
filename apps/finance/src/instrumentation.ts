export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { schedulePriceUpdates } = await import('./lib/cron')
    schedulePriceUpdates()
  }
}
