import { auth, signIn } from "@/auth"
import { db } from "@/db"
import { campaigns, recipients, events } from "@/db/schema"
import { eq, desc, count, and, or } from "drizzle-orm"
import DashboardClient from "./DashboardClient"
import { getActiveBaseUrl } from "@/lib/base-url"

export default async function Home() {
  const session = await auth()

  if (!session || !session.user?.id) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-serif font-extrabold text-slate-100 mb-2">Outreacher</h1>
          <p className="text-slate-400 text-xs mb-8 leading-relaxed">
            A premium, Japandi-inspired cold outreach tool. Import spreadsheets, customize templates, and automate tracking via Gmail.
          </p>
          
          <form
            action={async () => {
              "use server"
              await signIn("google")
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-950 text-xs font-semibold border border-slate-200 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>
          </form>
        </div>
      </main>
    )
  }

  const userId = session.user.id

  // --- SIGNED IN STATE: DASHBOARD DATA ---
  // 1. Total Sent (recipients with status sent or replied)
  const [totalSentResult] = await db
    .select({ count: count() })
    .from(recipients)
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        or(eq(recipients.status, "sent"), eq(recipients.status, "replied"))
      )
    )
  const totalSent = totalSentResult?.count || 0

  // 2. Total Opened (open events)
  const [totalOpenedResult] = await db
    .select({ count: count() })
    .from(events)
    .innerJoin(recipients, eq(events.recipientId, recipients.id))
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(events.type, "open")
      )
    )
  const totalOpened = totalOpenedResult?.count || 0

  // 3. Total Clicked (click events)
  const [totalClickedResult] = await db
    .select({ count: count() })
    .from(events)
    .innerJoin(recipients, eq(events.recipientId, recipients.id))
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(events.type, "click")
      )
    )
  const totalClicked = totalClickedResult?.count || 0

  // 4. Total Replied (reply events)
  const [totalRepliedResult] = await db
    .select({ count: count() })
    .from(events)
    .innerJoin(recipients, eq(events.recipientId, recipients.id))
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.userId, userId),
        eq(events.type, "reply")
      )
    )
  const totalReplied = totalRepliedResult?.count || 0

  // 5. All Campaigns
  const recentCampaignsList = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(campaigns.createdAt))

  const campaignsWithCounts = await Promise.all(
    recentCampaignsList.map(async (c) => {
      const [rCount] = await db
        .select({ count: count() })
        .from(recipients)
        .where(eq(recipients.campaignId, c.id))

      const [oCount] = await db
        .select({ count: count() })
        .from(events)
        .innerJoin(recipients, eq(events.recipientId, recipients.id))
        .where(and(eq(recipients.campaignId, c.id), eq(events.type, "open")))

      const [cCount] = await db
        .select({ count: count() })
        .from(events)
        .innerJoin(recipients, eq(events.recipientId, recipients.id))
        .where(and(eq(recipients.campaignId, c.id), eq(events.type, "click")))

      const [repCount] = await db
        .select({ count: count() })
        .from(events)
        .innerJoin(recipients, eq(events.recipientId, recipients.id))
        .where(and(eq(recipients.campaignId, c.id), eq(events.type, "reply")))

      return {
        ...c,
        recipientCount: rCount?.count || 0,
        opensCount: oCount?.count || 0,
        clicksCount: cCount?.count || 0,
        repliesCount: repCount?.count || 0,
      }
    })
  )

  // 6. Tracking Logs (last 30 events)
  const trackingLogsList = await db
    .select({
      id: events.id,
      type: events.type,
      createdAt: events.createdAt,
      recipientEmail: recipients.email,
      campaignName: campaigns.name,
    })
    .from(events)
    .innerJoin(recipients, eq(events.recipientId, recipients.id))
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId))
    .orderBy(desc(events.createdAt))
    .limit(30)

  const { isLocalhost } = await getActiveBaseUrl()

  return (
    <DashboardClient
      userName={session.user.name || "User"}
      totalSent={totalSent}
      totalOpened={totalOpened}
      totalClicked={totalClicked}
      totalReplied={totalReplied}
      campaignsList={campaignsWithCounts}
      trackingLogs={trackingLogsList}
      isLocalhost={isLocalhost}
    />
  )
}
