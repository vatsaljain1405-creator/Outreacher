import { db } from "@/db"
import { events, recipients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { recipientId: string } }
) {
  const { recipientId } = params

  try {
    // 1. Verify recipient exists
    const recipient = await db.query.recipients.findFirst({
      where: eq(recipients.id, recipientId),
    })

    if (recipient) {
      // 2. Insert tracking event
      await db.insert(events).values({
        recipientId,
        type: "open",
      })
      console.log(`[Open Tracking] Tracked "open" event for recipient: ${recipient.email} (${recipientId})`)
    } else {
      console.warn(`[Open Tracking Warning] Received open request for non-existent recipient ID: ${recipientId}`)
    }
  } catch (error) {
    console.error("[Open Tracking Error] Failed to log event in SQLite:", error)
  }

  // 3. Return a transparent 1x1 tracking GIF
  const pixelBase64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  const pixelBuffer = Buffer.from(pixelBase64, "base64")

  return new Response(pixelBuffer, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
