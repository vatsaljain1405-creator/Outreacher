import { db } from "@/db"
import { events, recipients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

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
      // 2. Update recipient status to unsubscribed in DB
      await db
        .update(recipients)
        .set({ status: "unsubscribed" })
        .where(eq(recipients.id, recipientId))

      // 3. Log the unsubscribe event
      await db.insert(events).values({
        recipientId,
        type: "unsubscribe",
      })

      console.log(`[Unsubscribe] Recipient ${recipient.email} unsubscribed.`)
    } else {
      console.warn(`[Unsubscribe Warning] Received GET unsubscribe request for non-existent recipient ID: ${recipientId}`)
      return new Response("Invalid unsubscribe link.", { status: 404 })
    }
  } catch (error) {
    console.error("[Unsubscribe GET Error] Failed to process unsubscribe:", error)
    return new Response("Internal server error.", { status: 500 })
  }

  // 4. Redirect to the success page
  const url = new URL(request.url)
  const successUrl = new URL("/unsubscribe/success", url.origin)
  return NextResponse.redirect(successUrl)
}

export async function POST(
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
      // 2. Update status
      await db
        .update(recipients)
        .set({ status: "unsubscribed" })
        .where(eq(recipients.id, recipientId))

      // 3. Log event
      await db.insert(events).values({
        recipientId,
        type: "unsubscribe",
      })

      console.log(`[Unsubscribe POST] Recipient ${recipient.email} unsubscribed via one-click header.`)
      return new Response(null, { status: 204 })
    } else {
      console.warn(`[Unsubscribe POST Warning] Received POST unsubscribe request for non-existent ID: ${recipientId}`)
      return new Response("Invalid recipient ID.", { status: 404 })
    }
  } catch (error) {
    console.error("[Unsubscribe POST Error] Failed to process one-click unsubscribe:", error)
    return new Response("Internal server error.", { status: 500 })
  }
}
