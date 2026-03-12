export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { schedulePriceUpdates, scheduleSnapshots } = await import('./lib/cron')
    const { scheduleNotifications } = await import('./bot/notifications/scheduler')
    schedulePriceUpdates()
    scheduleSnapshots()
    scheduleNotifications()
  }
}
