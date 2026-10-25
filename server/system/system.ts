import { systemPerson } from "@/db/schema"

// The actor automated jobs act as, such as the website intake creating D1.1.
// On records it skips only the permission check, and it can never approve or
// lock. Its writes are audited with it as the actor, named "System".
export const systemActor: string = systemPerson.id
