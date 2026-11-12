import { generateReactHelpers } from "@uploadthing/react"

import type { UploadRouter } from "@/server/files/upload-router"

export const { useUploadThing } = generateReactHelpers<UploadRouter>()
