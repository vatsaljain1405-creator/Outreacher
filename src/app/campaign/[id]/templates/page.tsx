import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { campaigns, recipients, templates, attachments } from "@/db/schema"
import { eq } from "drizzle-orm"
import TemplatePageClient, { TemplateData } from "./TemplatePageClient"

interface TemplatesPageProps {
  params: {
    id: string
  }
}

export default async function TemplatesPage({ params }: TemplatesPageProps) {
  // 1. Authenticate session
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    redirect("/")
  }

  const campaignId = params.id
  let campaignData: { id: string; name: string; headers: string[] } | null = null
  let recipientData: { id: string; email: string; fields: Record<string, string> }[] = []
  let templateData: TemplateData[] = []
  let dbOffline = false

  try {
    // 2. Fetch campaign details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    })

    if (campaign) {
      campaignData = {
        id: campaign.id,
        name: campaign.name,
        headers: campaign.headers,
      }
      // 3. Fetch recipients
      recipientData = await db
        .select()
        .from(recipients)
        .where(eq(recipients.campaignId, campaignId))

      // 4. Fetch templates
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
        .where(eq(campaigns.userId, session.user!.id!))

      templateData = await Promise.all(
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
    }
  } catch (error) {
    console.warn(`[Templates Page] Database connection failed. Falling back to offline demo data:`, error)
    dbOffline = true
  }

  // 5. Offline Fallback Mock data configurations
  if (dbOffline || !campaignData) {
    dbOffline = true
    campaignData = {
      id: campaignId,
      name: "Offline Demo Campaign (Testing)",
      headers: ["First Name", "Email", "Company", "Job Title"],
    }

    recipientData = [
      {
        id: "rec-1",
        email: "alice@acme.com",
        fields: {
          "First Name": "Alice",
          Email: "alice@acme.com",
          Company: "Acme Corp",
          "Job Title": "CEO",
        },
      },
      {
        id: "rec-2",
        email: "bob@innovate.org",
        fields: {
          "First Name": "", // Test empty First Name cell (triggers fallback)
          Email: "bob@innovate.org",
          Company: "Innovate Labs",
          "Job Title": "Lead Engineer",
        },
      },
      {
        id: "rec-3",
        email: "carol@studios.design",
        fields: {
          "First Name": "Carol",
          Email: "carol@studios.design",
          Company: "", // Test empty Company cell (triggers fallback)
          "Job Title": "Creative Director",
        },
      },
    ]

    templateData = [
      {
        id: "demo-tpl-1",
        campaignId,
        name: "Demo Outreach Profile",
        subject: "Quick question for {First Name} at {Company}",
        body: "<p>Hi {First Name},</p><p>I noticed your work as {Job Title} and wanted to reach out. Hope things are going well at {Company}!</p><p>Best,</p><p>Antigravity</p>",
        fallbacks: {
          "First Name": "there",
          Company: "your organization",
        },
        createdAt: new Date(),
      },
    ]
  }

  return (
    <TemplatePageClient
      campaign={campaignData}
      recipients={recipientData}
      initialTemplates={templateData}
      isDbOffline={dbOffline}
    />
  )
}
