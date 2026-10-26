import type { Role, ServiceTrack } from "@/db/schema"

// How the team screens name a role in the list of what is missing.
export const roleNames: Partial<Record<Role, string>> = {
  PM: "PM",
  OM: "OM",
  FO: "Finance",
}

export function trackName(track: ServiceTrack) {
  return track.replace("_", " ")
}
