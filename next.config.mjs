/** @type {import('next').NextConfig} */
const nextConfig = {
  // The PDFs kept with the app are read from disk, so the route that sends
  // them is deployed with them.
  outputFileTracingIncludes: {
    "/api/projects/[projectId]/documents/[file]": ["./documents/**/*.pdf"],
  },
}

export default nextConfig
