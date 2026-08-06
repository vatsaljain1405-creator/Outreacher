import { db } from "@/db"
import { events, recipients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { recipientId: string } }
) {
  const { recipientId } = params
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return new Response("Bad Request: Missing destination URL parameter.", { status: 400 })
  }

  try {
    // 1. Verify recipient exists
    const recipient = await db.query.recipients.findFirst({
      where: eq(recipients.id, recipientId),
    })

    if (recipient) {
      // 2. Insert tracking event
      await db.insert(events).values({
        recipientId,
        type: "click",
      })
      console.log(`[Click Tracking] Tracked "click" event for recipient: ${recipient.email} (${recipientId}) -> ${targetUrl}`)
    } else {
      console.warn(`[Click Tracking Warning] Received click request for non-existent recipient ID: ${recipientId}`)
    }
  } catch (error) {
    console.error("[Click Tracking Error] Failed to log event in SQLite:", error)
  }

  // 3. Return a 302 Redirect to the target URL
  return NextResponse.redirect(targetUrl, 302)
}
