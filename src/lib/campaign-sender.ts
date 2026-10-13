import fs from "fs"
import path from "path"
import { db } from "@/db"
import { campaigns, recipients, templates, attachments, users, events } from "@/db/schema"
import { getValidGoogleToken } from "@/lib/tokens"
import { buildMimeMessage, InlineImage } from "@/lib/mime"
import { eq, and } from "drizzle-orm"
import { getActiveBaseUrl } from "@/lib/base-url"
import { getProfessionalFooterHtml, hasProfessionalFooter } from "@/lib/footer"

/**
 * Helper token-replacement merge utility
 */
function mergeTokens(
  textToMerge: string,
  headers: string[],
  fields: Record<string, string>,
  fallbacks: Record<string, string>
) {
  if (!textToMerge) return ""
  let merged = textToMerge

  headers.forEach((header) => {
    const escapedHeader = header
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
      .replace(/\s+/g, "\\s*")

    const regex = new RegExp(`\\{\\s*${escapedHeader}\\s*\\}`, "gi")

    const cellValue = fields[header]
    const fallbackValue = fallbacks[header] || ""
    const replacementValue =
      cellValue !== undefined && cellValue !== null && cellValue.trim() !== ""
        ? cellValue
        : fallbackValue

    merged = merged.replace(regex, replacementValue)
  })

  merged = merged.replace(/\{\s*\}/g, "")
  // Ensure empty paragraphs or paragraphs with only trailing breaks do not collapse in email clients
  merged = merged.replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "<p>&nbsp;</p>")
  return merged
}


/**
 * Helper to append a 1x1 transparent tracking pixel image.
 */
function injectOpenTrackingPixel(html: string, recipientId: string, baseUrl: string): string {
  const pixelUrl = `${baseUrl}/api/track/open/${recipientId}`
  const pixelImg = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none !important;" />`
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixelImg}</body>`)
  }
  return `${html}${pixelImg}`
}

/**
 * Integrates open and click tracking changes into raw email HTML body.
 */
function applyTracking(html: string, recipientId: string, baseUrl: string): string {
  const styleBlock = `<style>p { margin: 0 0 10px 0 !important; padding: 0 !important; }</style>`
  let trackedHtml = styleBlock + html
  // Note: Link click rewriting through ngrok /api/track/click has been removed as requested.
  // Links remain pure, direct links (e.g. LinkedIn profiles) to eliminate ngrok errors.
  trackedHtml = injectOpenTrackingPixel(trackedHtml, recipientId, baseUrl)
  return trackedHtml
}

/**
 * Executes sending of a campaign immediately.
 * Programmatic method usable by both scheduler (without user session) and Server Actions (with user session).
 */
export async function executeCampaignSend(
  campaignId: string,
  templateId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    console.log(`[Campaign Sender] Starting execution for campaign ${campaignId} with template ${templateId}`);

    // 1. Fetch Campaign Details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return { success: false, error: "Campaign not found." }
    }

    // 2. Fetch User Details (Campaign Owner) to get their email
    const owner = await db.query.users.findFirst({
      where: eq(users.id, campaign.userId),
    })

    if (!owner) {
      return { success: false, error: "Campaign owner user not found." }
    }
    const userEmail = owner.email || ""

    // 3. Fetch Selected Template Profile
    const template = await db.query.templates.findFirst({
      where: eq(templates.id, templateId),
    })

    if (!template) {
      return { success: false, error: "Template profile not found." }
    }

    // 4. Fetch Recipients list
    const campaignRecipients = await db
      .select()
      .from(recipients)
      .where(eq(recipients.campaignId, campaignId))

    if (campaignRecipients.length === 0) {
      return { success: false, error: "No recipients found for this campaign." }
    }

    // 5. Get valid Access Token programmatically using userId
    let accessToken: string
    try {
      accessToken = await getValidGoogleToken(campaign.userId)
    } catch (tokenError: unknown) {
      console.error("[Campaign Sender] Token retrieval failed during Outreacher run:", tokenError)
      const errorMsg = tokenError instanceof Error ? tokenError.message : String(tokenError)
      return { success: false, error: `Google OAuth verification failed: ${errorMsg}` }
    }

    // Fetch static template attachments if any
    const tplAttachments = await db
      .select({
        name: attachments.name,
        mimeType: attachments.mimeType,
        size: attachments.size,
        content: attachments.content,
      })
      .from(attachments)
      .where(eq(attachments.templateId, template.id))

    // Filter pending recipients specifically to ensure we only send unsent ones
    const pendingRecipients = campaignRecipients.filter(
      (rec) => rec.status === "pending" || rec.status === "scheduled"
    )

    let successCount = 0
    let failedCount = 0
    let isFirst = true

    // Loop recipients and send
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const rec of pendingRecipients) {
      // Validate and recover recipient email
      let targetEmail = (rec.email || "").trim()

      if (!emailRegex.test(targetEmail)) {
        // Attempt recovery from rec.fields
        let recoveredEmail: string | null = null
        if (rec.fields && typeof rec.fields === "object") {
          for (const val of Object.values(rec.fields as Record<string, unknown>)) {
            if (typeof val === "string" && emailRegex.test(val.trim())) {
              recoveredEmail = val.trim()
              break
            }
          }
        }

        if (recoveredEmail) {
          console.log(`[Campaign Sender] Auto-recovered email "${recoveredEmail}" for recipient ID ${rec.id} (previously "${rec.email}")`)
          targetEmail = recoveredEmail
          await db
            .update(recipients)
            .set({ email: recoveredEmail })
            .where(eq(recipients.id, rec.id))
        } else {
          console.warn(`[Campaign Sender] Skipping recipient ID ${rec.id}: Invalid or missing email address "${rec.email}"`)
          await db
            .update(recipients)
            .set({ status: `failed: Invalid or missing email address (${rec.email || "empty"})` })
            .where(eq(recipients.id, rec.id))
          failedCount++
          continue
        }
      }

      if (!isFirst) {
        console.log(`[Campaign Sender] Waiting 5 seconds before sending next email to prevent spam...`)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
      isFirst = false

      try {
        // Merge variables into Subject and HTML Body
        const mergedSubject = mergeTokens(template.subject, campaign.headers, rec.fields, template.fallbacks || {})
        let mergedBody = mergeTokens(template.body, campaign.headers, rec.fields, template.fallbacks || {})

        // Inject professional corporate footer if enabled and not already embedded
        const isFooterEnabled = template.footerEnabled !== false
        if (isFooterEnabled && !hasProfessionalFooter(mergedBody)) {
          mergedBody += `\n` + getProfessionalFooterHtml({ forEmail: true })
        }

        // Inject open tracking pixel
        const { baseUrl } = await getActiveBaseUrl()
        let trackedBody = applyTracking(mergedBody, rec.id, baseUrl)

        // Inject unsubscribe footer
        let unsubscribeLink: string | undefined = undefined
        if (template.unsubscribeEnabled) {
          unsubscribeLink = `${baseUrl}/api/unsubscribe/${rec.id}`
          trackedBody += `
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #2C2A29; text-align: center; font-family: sans-serif; font-size: 11px; color: #A09890;">
              You are receiving this because you are on our list. 
              <a href="${unsubscribeLink}" style="color: #6366F1; text-decoration: underline; margin-left: 5px;">Unsubscribe here</a>
            </div>
          `
        }

        // Replace any relative /ia-logo.png reference with cid:ia-logo@outreacher for email clients
        trackedBody = trackedBody.replace(/src="\/ia-logo\.png"/g, 'src="cid:ia-logo@outreacher"')

        // Load inline CID images (e.g. India Accelerator logo)
        const inlineImages: InlineImage[] = []
        if (trackedBody.includes("cid:ia-logo@outreacher")) {
          try {
            const logoPath = path.join(process.cwd(), "public", "ia-logo.png")
            if (fs.existsSync(logoPath)) {
              const logoBuf = fs.readFileSync(logoPath)
              inlineImages.push({
                cid: "ia-logo@outreacher",
                filename: "ia-logo.png",
                mimeType: "image/png",
                content: logoBuf.toString("base64"),
              })
            }
          } catch (logoErr) {
            console.warn("[Campaign Sender] Failed to load inline logo for email:", logoErr)
          }
        }

        // Construct MIME standard RFC 2822 message
        const rawMime = buildMimeMessage({
          to: targetEmail,
          from: userEmail,
          subject: mergedSubject,
          htmlBody: trackedBody,
          unsubscribeLink,
          attachmentsList: tplAttachments,
          inlineImages,
        })

        const base64UrlMessage = Buffer.from(rawMime)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")

        const requestBody: Record<string, string> = {
          raw: base64UrlMessage,
        }
        if (rec.gmailThreadId) {
          requestBody.threadId = rec.gmailThreadId
        }

        // Post to Google Gmail API
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const apiError = await response.text()
          throw new Error(`Gmail API: ${apiError}`)
        }

        const gmailData = await response.json()
        const gmailMessageId = gmailData.id as string
        const gmailThreadId = gmailData.threadId as string

        // Update DB row status and store Gmail message and thread IDs
        await db
          .update(recipients)
          .set({
            status: "sent",
            gmailMessageId,
            gmailThreadId,
          })
          .where(eq(recipients.id, rec.id))

        successCount++
      } catch (err: unknown) {
        console.error(`[Campaign Sender Delivery Failure] Recipient: ${rec.email}`, err)
        const errVal = err instanceof Error ? err.message : String(err)
        await db
          .update(recipients)
          .set({ status: `failed: ${errVal}` })
          .where(eq(recipients.id, rec.id))

        failedCount++
      }
    }

    // Update campaign status to completed
    await db
      .update(campaigns)
      .set({
        status: "completed",
        scheduledAt: null,
      })
      .where(eq(campaigns.id, campaignId))

    console.log(`[Campaign Sender] Campaign ${campaignId} fully completed. Success: ${successCount}, Failed: ${failedCount}`)

    return {
      success: true,
      message: `Outreacher campaign completed! Successfully sent: ${successCount} emails. Failed: ${failedCount}.`,
    }
  } catch (error: unknown) {
    console.error("[Campaign Sender Error] executeCampaignSend failed:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Syncs replies from Gmail for a given campaign by checking thread updates.
 */
export async function executeSyncReplies(
  campaignId: string
): Promise<{ success: boolean; checkedCount: number; repliesCount: number; message?: string; error?: string }> {
  try {
    console.log(`[Reply Sync] Starting execution for campaign ${campaignId}`)

    // 1. Fetch Campaign Details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (!campaign) {
      return { success: false, checkedCount: 0, repliesCount: 0, error: "Campaign not found." }
    }

    // 2. Fetch recipients
    const sentRecipients = await db
      .select()
      .from(recipients)
      .where(eq(recipients.campaignId, campaignId))

    // Filter in-memory for candidates that have thread IDs and are currently in "sent" status
    const candidates = sentRecipients.filter(
      (r) => r.status === "sent" && r.gmailThreadId && r.gmailThreadId.trim() !== ""
    )

    if (candidates.length === 0) {
      return { success: true, checkedCount: 0, repliesCount: 0, message: "No active threads found to check." }
    }

    // 3. Obtain Google Gmail API Access Token programmatically using userId
    let accessToken: string
    try {
      accessToken = await getValidGoogleToken(campaign.userId)
    } catch (tokenError: unknown) {
      console.error("[Reply Sync] Token retrieval failed:", tokenError)
      const errorMsg = tokenError instanceof Error ? tokenError.message : String(tokenError)
      return { success: false, checkedCount: 0, repliesCount: 0, error: `Google OAuth verification failed: ${errorMsg}` }
    }

    let repliesDetected = 0
    const checkedThreads = new Set<string>()

    for (const rec of candidates) {
      const threadId = rec.gmailThreadId!
      if (checkedThreads.has(threadId)) {
        continue
      }
      checkedThreads.add(threadId)

      try {
        console.log(`[Reply Sync] Polling thread ${threadId} for recipient ${rec.email}...`)
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!response.ok) {
          const apiError = await response.text()
          if (response.status === 429 || response.status === 403) {
            console.warn(`[Reply Sync Paused] Gmail API rate limit / quota exceeded (${response.status}). Pausing reply sync to protect API quota.`)
            break
          }
          console.warn(`[Reply Sync Warning] Failed to fetch thread ${threadId}: ${apiError}`)
          continue
        }

        // 200ms throttle between thread requests to prevent exceeding Gmail quota
        await new Promise((resolve) => setTimeout(resolve, 200))

        const threadData = await response.json()
        const messages = threadData.messages || []

        const originalMsgId = rec.gmailMessageId
        const recipientEmail = rec.email.toLowerCase()
        let isReplied = false

        for (const message of messages) {
          if (message.id === originalMsgId) {
            continue
          }

          const headers = message.payload?.headers || []
          const fromHeader = (headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === "from")?.value || "").toLowerCase()

          if (fromHeader.includes(recipientEmail)) {
            isReplied = true
            break
          }
        }

        if (isReplied) {
          console.log(`[Reply Sync Detected] Recipient ${rec.email} replied in thread ${threadId}!`)
          
          // Update DB row status
          await db
            .update(recipients)
            .set({ status: "replied" })
            .where(eq(recipients.id, rec.id))

          // Insert reply event if not already logged
          const existingEvent = await db.query.events.findFirst({
            where: and(eq(events.recipientId, rec.id), eq(events.type, "reply")),
          })

          if (!existingEvent) {
            await db.insert(events).values({
              recipientId: rec.id,
              type: "reply",
            })
          }

          repliesDetected++
        }
      } catch (err) {
        console.error(`[Reply Sync Error] Failed to process recipient ${rec.email}:`, err)
      }
    }

    return {
      success: true,
      checkedCount: candidates.length,
      repliesCount: repliesDetected,
      message: `Checked ${candidates.length} active threads. Detected ${repliesDetected} new replies!`,
    }
  } catch (error: unknown) {
    console.error("[Reply Sync Error] executeSyncReplies failed:", error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { success: false, checkedCount: 0, repliesCount: 0, error: errorMsg }
  }
}
