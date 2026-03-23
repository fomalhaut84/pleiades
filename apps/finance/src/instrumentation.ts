export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { schedulePriceUpdates, scheduleSnapshots, scheduleKrxSync, scheduleRecurring } = await import('./lib/cron')
    const { scheduleNotifications } = await import('./bot/notifications/scheduler')
    schedulePriceUpdates()
    scheduleSnapshots()
    scheduleKrxSync()
    scheduleRecurring()
    scheduleNotifications()
  }
}
