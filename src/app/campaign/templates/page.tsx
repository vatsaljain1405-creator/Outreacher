import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { campaigns } from "@/db/schema"
import { eq, desc } from "drizzle-orm"

export default async function CampaignsTemplatesRedirect() {
  const session = await auth()
  if (!session || !session.user || !session.user.id) {
    redirect("/")
  }

  try {
    // Query the user's most recently created campaign
    const firstCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.userId, session.user.id),
      orderBy: desc(campaigns.createdAt),
    })

    if (firstCampaign) {
      redirect(`/campaign/${firstCampaign.id}/templates`)
    }
  } catch (error) {
    console.warn("[Templates Redirect] Database connection failed or empty, falling back to test campaign:", error)
  }

  // Redirect to sandbox if offline/no campaigns exist yet
  redirect("/campaign/test-campaign/templates")
}
