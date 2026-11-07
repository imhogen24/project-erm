// "2 hours ago", "Yesterday", and so on. Worked out on the server when the page
// is drawn, so the browser's clock and time zone never change what is shown.
export function timeAgo(from: Date, now: number): string {
  const minutes = Math.floor(Math.max(0, now - from.getTime()) / 60_000)

  if (minutes < 1) {
    return "Just now"
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  }

  const days = Math.floor(hours / 24)

  if (days === 1) {
    return "Yesterday"
  }

  if (days < 7) {
    return `${days} days ago`
  }

  return from.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}
