"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { templates, attachments, campaigns } from "@/db/schema"
import { eq } from "drizzle-orm"
import crypto from "crypto"
import { ensureUserExists } from "@/lib/tokens"

export interface TemplateResult {
  success: boolean
  templateId?: string
  templates?: unknown[]
  error?: string
}

/**
 * Saves or updates a named template profile with custom placeholder fallbacks.
 */
export async function saveTemplateAction(
  templateId: string | null,
  campaignId: string,
  name: string,
  subject: string,
  body: string,
  fallbacks: Record<string, string>,
  unsubscribeEnabled: boolean,
  attachmentsData?: Array<{ name: string; mimeType: string; size: number; content: string }>,
  footerEnabled: boolean = true
): Promise<TemplateResult> {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    if (!name || name.trim() === "") {
      return { success: false, error: "Template profile name is required." }
    }

    let isUpdate = false
    if (templateId) {
      const existing = await db.query.templates.findFirst({
        where: eq(templates.id, templateId),
      })
      if (existing && existing.campaignId === campaignId) {
        isUpdate = true
      }
    }

    const resolvedId = isUpdate ? templateId! : crypto.randomUUID()

    if (isUpdate) {
      // Update existing template
      await db
        .update(templates)
        .set({
          name,
          subject,
          body,
          fallbacks,
          unsubscribeEnabled,
          footerEnabled,
        })
        .where(eq(templates.id, resolvedId))
    } else {
      // Insert new template (copy or fresh)
      await db.insert(templates).values({
        id: resolvedId,
        campaignId,
        name,
        subject,
        body,
        fallbacks,
        unsubscribeEnabled,
        footerEnabled,
      })
    }

    // Synchronize attachments
    if (attachmentsData) {
      // 1. Clear existing attachments
      await db
        .delete(attachments)
        .where(eq(attachments.templateId, resolvedId))

      // 2. Insert new attachments
      if (attachmentsData.length > 0) {
        for (const att of attachmentsData) {
          await db.insert(attachments).values({
            id: crypto.randomUUID(),
            templateId: resolvedId,
            name: att.name,
            mimeType: att.mimeType,
            size: att.size,
            content: att.content,
          })
        }
      }
    }

    console.log(`[Template Action] Template "${name}" successfully saved in SQLite database.`)

    return {
      success: true,
      templateId: resolvedId,
    }
  } catch (error: unknown) {
    console.error("[Template Action Error] Failed to save template:", error)
    const errorMsg = error instanceof Error ? error.message : "An unknown exception occurred."
    return { success: false, error: errorMsg }
  }
}

/**
 * Deletes a template profile.
 */
export async function deleteTemplateAction(templateId: string): Promise<TemplateResult> {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    await db.delete(templates).where(eq(templates.id, templateId))
    console.log(`[Template Action] Deleted template ID ${templateId} from database.`)

    return {
      success: true,
    }
  } catch (error: unknown) {
    console.error("[Template Action Error] Failed to delete template:", error)
    const errorMsg = error instanceof Error ? error.message : "An unknown exception occurred."
    return { success: false, error: errorMsg }
  }
}

/**
 * Gets all saved templates for a specific campaign.
 */
export async function getTemplatesAction(campaignId: string): Promise<TemplateResult> {
  try {
    const session = await auth()
    console.log(`[Templates Action] Retrieving templates. Context campaign ID: ${campaignId}`)
    if (!session || !session.user || !session.user.id) {
      return { success: false, error: "Unauthorized. Please sign in." }
    }
    await ensureUserExists(session)

    const savedTemplates = await db
      .select({
        id: templates.id,
        campaignId: templates.campaignId,
        name: templates.name,
        subject: templates.subject,
        body: templates.body,
        fallbacks: templates.fallbacks,
        unsubscribeEnabled: templates.unsubscribeEnabled,
        footerEnabled: templates.footerEnabled,
        createdAt: templates.createdAt,
      })
      .from(templates)
      .innerJoin(campaigns, eq(templates.campaignId, campaigns.id))
      .where(eq(campaigns.userId, session.user.id))

    // Fetch attachments for each template
    const templatesWithAttachments = await Promise.all(
      savedTemplates.map(async (t) => {
        const atts = await db
          .select({
            name: attachments.name,
            mimeType: attachments.mimeType,
            size: attachments.size,
            content: attachments.content,
          })
          .from(attachments)
          .where(eq(attachments.templateId, t.id))
        return {
          ...t,
          attachments: atts,
        }
      })
    )

    return {
      success: true,
      templates: templatesWithAttachments,
    }
  } catch (error: unknown) {
    console.error("[Template Action Error] Failed to retrieve templates:", error)
    const errorMsg = error instanceof Error ? error.message : "An unknown exception occurred."
    return { success: false, error: errorMsg }
  }
}
