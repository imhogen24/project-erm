import { z } from "zod"

// The files the client attached to their request, as D1.1 holds them. A
// missing or odd value reads as empty.
export const clientFilesPayload = z.object({
  attachedFiles: z
    .array(
      z.object({
        label: z.string().catch(""),
        dateUploaded: z.string().catch(""),
        fileLink: z.string().catch(""),
      })
    )
    .catch([]),
})

export type ClientFile = z.infer<
  typeof clientFilesPayload
>["attachedFiles"][number]
