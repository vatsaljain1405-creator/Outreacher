"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { campaigns, recipients, events } from "@/db/schema"
import { getValidGoogleToken, ensureUserExists } from "@/lib/tokens"
import { executeCampaignSend, executeSyncReplies } from "@/lib/campaign-sender"
import { eq, desc, count, and, like } from "drizzle-orm"

export interface ImportResult {
  success: boolean
  campaignId?: string
  headers?: string[]
  rowCount?: number
  rows?: Record<string, string>[]
  error?: string
}

/**
 * Creates a campaign and persists recipients in SQLite in batches of 100.
 */
export async function createCampaignAction(
  campaignName: string,
  headers: string[],
  rows: Record<string, string>[]
): Promise<ImportResult> {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const userId = session.user.id

    if (!campaignName || campaignName.trim() === "") {
      return { success: false, error: "Campaign name is required." }
    }

    if (!headers || headers.length === 0) {
      return { success: false, error: "Headers are empty. Could not import." }
    }

    const emailHeader = headers.find((h) => h.toLowerCase() === "email") || headers[0]

    const [newCampaign] = await db
      .insert(campaigns)
      .values({
        userId,
        name: campaignName,
        headers,
        activeHeaders: headers, // By default, select all headers
        status: "draft",
      })
      .returning()

    const campaignId = newCampaign.id

    const recipientValues = rows.map((row) => ({
      campaignId,
      email: row[emailHeader] || "no-email",
      fields: row,
      status: "pending",
    }))

    const chunkSize = 100
    for (let i = 0; i < recipientValues.length; i += chunkSize) {
      const chunk = recipientValues.slice(i, i + chunkSize)
      await db.insert(recipients).values(chunk)
    }

    console.log(`[Campaign Action] Successfully saved campaign "${campaignName}" with ${rows.length} recipients.`)

    return {
      success: true,
      campaignId,
      headers,
      rowCount: rows.length,
    }
  } catch (error: unknown) {
    console.error("[Campaign Action Error] Failed to create campaign:", error)
    const errorMsg = error instanceof Error ? error.message : "An unknown exception occurred."
    return { success: false, error: errorMsg }
  }
}

/**
 * Downloads cell values from Google Sheets API, parses it, and creates a campaign.
 */
export async function importGoogleSheetAction(
  campaignName: string,
  sheetUrl: string
): Promise<ImportResult> {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const userId = session.user.id

    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) {
      return { success: false, error: "Invalid Google Sheets URL. Could not extract spreadsheet ID." }
    }
    const spreadsheetId = match[1]

    let accessToken: string
    try {
      accessToken = await getValidGoogleToken(userId, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      })
    } catch (tokenError: unknown) {
      console.error("[Google Sheets Import] Token retrieval failed:", tokenError)
      const errorMsg = tokenError instanceof Error ? tokenError.message : String(tokenError)
      return { success: false, error: `Google OAuth verification failed: ${errorMsg}` }
    }

    console.log(`[Google Sheets Import] Fetching spreadsheet metadata for ID: ${spreadsheetId}...`)
    const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text()
      console.error(`[Google Sheets Import API Error] Metadata status ${metaResponse.status}:`, errorText)
      return { success: false, error: `Google Sheets API Error: ${errorText}` }
    }

    const metadata = await metaResponse.json()
    const sheets = metadata.sheets
    if (!sheets || sheets.length === 0) {
      return { success: false, error: "No sheets found inside the spreadsheet." }
    }

    const firstSheetTitle = sheets[0].properties.title
    console.log(`[Google Sheets Import] Found first sheet: "${firstSheetTitle}". Loading values...`)

    const range = encodeURIComponent(`${firstSheetTitle}!A1:ZZ`)
    const valuesResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!valuesResponse.ok) {
      const errorText = await valuesResponse.text()
      console.error(`[Google Sheets Import API Error] Values status ${valuesResponse.status}:`, errorText)
      return { success: false, error: `Google Sheets API Error: ${errorText}` }
    }

    const valueRange = await valuesResponse.json()
    const values = valueRange.values as string[][]

    if (!values || values.length === 0) {
      return { success: false, error: "Google Sheet is empty (no cells containing values found)." }
    }

    const headers = values[0].map((h) => String(h || "").trim()).filter((h) => h !== "")
    const rows = values.slice(1).map((row) => {
      const rowData: Record<string, string> = {}
      headers.forEach((header, index) => {
        rowData[header] = row[index] !== undefined ? String(row[index]).trim() : ""
      })
      return rowData
    })

    console.log(`[Google Sheets Import] Parsed ${rows.length} rows. Exposing campaign action...`)

    return await createCampaignAction(campaignName, headers, rows)
  } catch (error: unknown) {
    console.error("[Google Sheets Import Error] Critical exception occurred:", error)
    const errorMsg = error instanceof Error ? error.message : "An unknown exception occurred."
    return { success: false, error: errorMsg }
  }
}

/**
 * Returns all campaigns for the logged-in user with recipient row counts.
 */
export async function getCampaignsAction() {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const list = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        headers: campaigns.headers,
        activeHeaders: campaigns.activeHeaders,
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        parentCampaignId: campaigns.parentCampaignId,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(eq(campaigns.userId, session.user.id))
      .orderBy(desc(campaigns.createdAt))

    const campaignsWithCounts = await Promise.all(
      list.map(async (c) => {
        const [rCount] = await db
          .select({ count: count() })
          .from(recipients)
          .where(eq(recipients.campaignId, c.id))

        const [opensResult] = await db
          .select({ count: count() })
          .from(events)
          .innerJoin(recipients, eq(events.recipientId, recipients.id))
          .where(and(eq(recipients.campaignId, c.id), eq(events.type, "open")))

        const [clicksResult] = await db
          .select({ count: count() })
          .from(events)
          .innerJoin(recipients, eq(events.recipientId, recipients.id))
          .where(and(eq(recipients.campaignId, c.id), eq(events.type, "click")))

        const [repliesResult] = await db
          .select({ count: count() })
          .from(events)
          .innerJoin(recipients, eq(events.recipientId, recipients.id))
          .where(and(eq(recipients.campaignId, c.id), eq(events.type, "reply")))

        const [sentResult] = await db
          .select({ count: count() })
          .from(recipients)
          .where(and(eq(recipients.campaignId, c.id), eq(recipients.status, "sent")))

        const [failedResult] = await db
          .select({ count: count() })
          .from(recipients)
          .where(and(eq(recipients.campaignId, c.id), like(recipients.status, "failed%")))

        return {
          ...c,
          recipientCount: rCount?.count || 0,
          opensCount: opensResult?.count || 0,
          clicksCount: clicksResult?.count || 0,
          repliesCount: repliesResult?.count || 0,
          sentCount: sentResult?.count || 0,
          failedCount: failedResult?.count || 0,
        }
      })
    )

    return { success: true, campaigns: campaignsWithCounts }
  } catch (error: unknown) {
    console.error("[getCampaignsAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Fetches single campaign details.
 */
export async function getCampaignDetailsAction(campaignId: string) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return { success: false, error: "Campaign not found." }
    }

    return { success: true, campaign }
  } catch (error: unknown) {
    console.error("[getCampaignDetailsAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Fetches campaign recipients.
 */
export async function getCampaignRecipientsAction(campaignId: string) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const rows = await db
      .select()
      .from(recipients)
      .where(eq(recipients.campaignId, campaignId))

    const recipientsWithEvents = await Promise.all(
      rows.map(async (r) => {
        const [opens] = await db
          .select({ count: count() })
          .from(events)
          .where(and(eq(events.recipientId, r.id), eq(events.type, "open")))

        const [clicks] = await db
          .select({ count: count() })
          .from(events)
          .where(and(eq(events.recipientId, r.id), eq(events.type, "click")))

        return {
          ...r,
          opensCount: opens?.count || 0,
          clicksCount: clicks?.count || 0,
        }
      })
    )

    return { success: true, recipients: recipientsWithEvents }
  } catch (error: unknown) {
    console.error("[getCampaignRecipientsAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Updates selected active placeholders for a campaign.
 */
export async function updateCampaignActiveHeadersAction(
  campaignId: string,
  activeHeaders: string[]
) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    await db
      .update(campaigns)
      .set({ activeHeaders })
      .where(eq(campaigns.id, campaignId))

    return { success: true }
  } catch (error: unknown) {
    console.error("[updateCampaignActiveHeadersAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

// mergeTokens and buildMimeMessage helper dependencies have been migrated to src/lib/campaign-sender.ts and src/lib/mime.ts

/**
 * Sends campaign emails immediately via Gmail API or schedules them in DB.
 */
export async function sendCampaignMailsAction(
  campaignId: string,
  templateId: string,
  scheduledTime?: string
) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    // 1. Fetch Campaign Details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return { success: false, error: "Campaign not found." }
    }

    // A. IF SCHEDULING (ONE-TIME)
    if (scheduledTime) {
      const scheduledDate = new Date(scheduledTime)
      if (isNaN(scheduledDate.getTime())) {
        return { success: false, error: "Invalid scheduled date and time value." }
      }

      // Update Campaign Status and save templateId
      await db
        .update(campaigns)
        .set({
          status: "scheduled",
          scheduledAt: scheduledDate,
          templateId: templateId,
        })
        .where(eq(campaigns.id, campaignId))

      // Update Recipients Status
      await db
        .update(recipients)
        .set({ status: "scheduled" })
        .where(eq(recipients.campaignId, campaignId))

      console.log(`[Outreacher Schedule] Campaign "${campaign.name}" successfully scheduled for ${scheduledDate.toLocaleString()}`)

      return {
        success: true,
        message: `Campaign "${campaign.name}" successfully scheduled to send at ${scheduledDate.toLocaleString()}!`,
      }
    }

    // B. IF SENDING NOW
    return await executeCampaignSend(campaignId, templateId)
  } catch (error: unknown) {
    console.error("[sendCampaignMailsAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Action to manually trigger polling Gmail API for replies on a campaign's sent threads.
 */
export async function checkCampaignRepliesAction(campaignId: string) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, checkedCount: 0, repliesCount: 0, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)
    return await executeSyncReplies(campaignId)
  } catch (error: unknown) {
    console.error("[checkCampaignRepliesAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, checkedCount: 0, repliesCount: 0, error: errorMsg }
  }
}

/**
 * Deletes a campaign if it is in draft status.
 */
export async function deleteCampaignAction(campaignId: string) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    // Verify it belongs to the user and is in draft status
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, session.user.id)),
    })

    if (!campaign) {
      return { success: false, error: "Campaign not found or unauthorized." }
    }

    if (campaign.status !== "draft") {
      return { success: false, error: "Only draft campaigns can be deleted." }
    }

    await db.delete(campaigns).where(eq(campaigns.id, campaignId))
    console.log(`[Campaign Action] Successfully deleted draft campaign ID ${campaignId}.`)

    return { success: true }
  } catch (error: unknown) {
    console.error("[deleteCampaignAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Cancels a scheduled campaign and resets its status and recipient status back to draft/pending.
 */
export async function cancelScheduledCampaignAction(campaignId: string) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    // Verify it belongs to the user and is in scheduled status
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.userId, session.user.id)),
    })

    if (!campaign) {
      return { success: false, error: "Campaign not found or unauthorized." }
    }

    if (campaign.status !== "scheduled") {
      return { success: false, error: "Only scheduled campaigns can be canceled." }
    }

    // Revert campaign status to draft and clear scheduledAt
    await db
      .update(campaigns)
      .set({
        status: "draft",
        scheduledAt: null,
      })
      .where(eq(campaigns.id, campaignId))

    // Revert recipient statuses back to pending
    await db
      .update(recipients)
      .set({ status: "pending" })
      .where(eq(recipients.campaignId, campaignId))

    console.log(`[Campaign Action] Successfully canceled schedule for campaign ID ${campaignId}.`)

    return { success: true }
  } catch (error: unknown) {
    console.error("[cancelScheduledCampaignAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Action to manually poll Gmail for replies across all active campaigns for the logged-in user.
 */
export async function syncAllRepliesAction() {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)
    const userId = session.user.id

    // Fetch all campaigns for this user
    const userCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.userId, userId))

    let totalChecked = 0
    let totalReplies = 0
    let campaignsSynced = 0

    for (const c of userCampaigns) {
      const res = await executeSyncReplies(c.id)
      if (res.success) {
        totalChecked += res.checkedCount
        totalReplies += res.repliesCount
        if (res.checkedCount > 0) {
          campaignsSynced++
        }
      }
    }

    return {
      success: true,
      campaignsSynced,
      checkedCount: totalChecked,
      repliesCount: totalReplies,
      message: `Synced ${campaignsSynced} campaigns. Checked ${totalChecked} threads. Detected ${totalReplies} new replies!`,
    }
  } catch (error: unknown) {
    console.error("[syncAllRepliesAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Creates a follow-up campaign by importing unreplied recipients from a parent campaign.
 */
export async function createFollowupCampaignAction(
  campaignName: string,
  parentCampaignId: string
): Promise<ImportResult> {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    if (!campaignName || campaignName.trim() === "") {
      return { success: false, error: "Campaign name is required." }
    }

    // 1. Fetch parent campaign details
    const parentCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, parentCampaignId),
    })

    if (!parentCampaign) {
      return { success: false, error: "Parent campaign not found." }
    }

    // 2. Fetch parent campaign recipients
    const parentRecipients = await db
      .select()
      .from(recipients)
      .where(eq(recipients.campaignId, parentCampaignId))

    if (parentRecipients.length === 0) {
      return { success: false, error: "Selected parent campaign has no recipients." }
    }

    // 3. Filter recipients: target only those who did not reply and did not unsubscribe
    const matchingRecipients = parentRecipients.filter(
      (r) => r.status !== "replied" && r.status !== "unsubscribed"
    )

    if (matchingRecipients.length === 0) {
      return {
        success: false,
        error: "All recipients in the parent campaign have either replied or unsubscribed.",
      }
    }

    // 4. Create the new follow-up campaign
    const [newCampaign] = await db
      .insert(campaigns)
      .values({
        userId: session.user.id,
        name: campaignName,
        headers: parentCampaign.headers,
        activeHeaders: parentCampaign.activeHeaders || parentCampaign.headers,
        status: "draft",
        parentCampaignId: parentCampaignId,
      })
      .returning()

    const campaignId = newCampaign.id

    // 5. Insert new recipients carrying over the gmailThreadId / gmailMessageId for threading
    const newRecipientValues = matchingRecipients.map((r) => ({
      campaignId,
      email: r.email,
      fields: r.fields,
      status: "pending",
      // Thread follow-up under original thread if available
      gmailThreadId: r.gmailThreadId || null,
      gmailMessageId: r.gmailMessageId || null,
    }))

    const chunkSize = 100
    for (let i = 0; i < newRecipientValues.length; i += chunkSize) {
      const chunk = newRecipientValues.slice(i, i + chunkSize)
      await db.insert(recipients).values(chunk)
    }

    console.log(`[Campaign Action] Successfully created follow-up campaign "${campaignName}" for parent campaign ID ${parentCampaignId} with ${matchingRecipients.length} recipients.`)

    return {
      success: true,
      campaignId,
      headers: parentCampaign.headers,
      rowCount: matchingRecipients.length,
    }
  } catch (error: unknown) {
    console.error("[createFollowupCampaignAction Error]", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}
