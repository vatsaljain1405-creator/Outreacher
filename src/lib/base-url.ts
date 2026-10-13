import fs from "fs"
import path from "path"

/**
 * Returns the effective base URL for email tracking (opens, clicks, unsubscribe).
 * Prioritizes:
 * 1. process.env.APP_URL
 * 2. APP_URL in .env.local (even if process.env wasn't reloaded)
 * 3. Auto-detected running ngrok tunnel via local API (http://127.0.0.1:4040/api/tunnels)
 * 4. Fallback to process.env.NEXTAUTH_URL or localhost:3001
 */
export async function getActiveBaseUrl(): Promise<{ baseUrl: string; isLocalhost: boolean }> {
  // 1. Explicit env variable
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost") && !process.env.APP_URL.includes("127.0.0.1")) {
    const url = process.env.APP_URL.trim().replace(/\/$/, "")
    return { baseUrl: url, isLocalhost: false }
  }

  // 2. Read directly from .env.local (in case process.env was not reloaded after editing)
  try {
    const envPath = path.resolve(process.cwd(), ".env.local")
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8")
      const match = content.match(/^APP_URL\s*=\s*["']?([^"'\r\n]+)["']?/m)
      if (match && match[1]) {
        const fileUrl = match[1].trim().replace(/\/$/, "")
        if (fileUrl && !fileUrl.includes("localhost") && !fileUrl.includes("127.0.0.1")) {
          return { baseUrl: fileUrl, isLocalhost: false }
        }
      }
    }
  } catch {
    // Ignore file read error
  }

  // 3. Auto-detect running local ngrok tunnel
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels", {
      signal: AbortSignal.timeout(400),
    })
    if (res.ok) {
      const data = (await res.json()) as { tunnels?: Array<{ public_url?: string }> }
      const publicTunnel = data.tunnels?.find(
        (t) => t.public_url && t.public_url.startsWith("https://")
      )
      if (publicTunnel?.public_url) {
        const ngrokUrl = publicTunnel.public_url.trim().replace(/\/$/, "")
        return { baseUrl: ngrokUrl, isLocalhost: false }
      }
    }
  } catch {
    // ngrok is not running, fall through
  }

  // 4. Default to NEXTAUTH_URL or localhost
  const fallback = (process.env.NEXTAUTH_URL || "http://localhost:3001").replace(/\/$/, "")
  const isLocal = fallback.includes("localhost") || fallback.includes("127.0.0.1")
  return { baseUrl: fallback, isLocalhost: isLocal }
}
