import { createRouteHandler } from "uploadthing/next"

import { uploadRouter } from "@/server/files/upload-router"

// UploadThing asks here before each upload and calls back once it is stored.
// The proxy leaves this open: the callback has no session, and is checked by
// its signature instead.
export const { GET, POST } = createRouteHandler({ router: uploadRouter })
