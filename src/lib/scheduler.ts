/* eslint-disable no-var */
import { db } from "@/db"
import { campaigns, recipients } from "@/db/schema"
import { executeCampaignSend, executeSyncReplies } from "@/lib/campaign-sender"
import { eq, and, lte, isNotNull, or } from "drizzle-orm"

// Declare global properties for dev server hot-reloading preservation
declare global {
  var schedulerActive: boolean | undefined;
  var sendingCampaigns: Set<string> | undefined;
}

if (!globalThis.sendingCampaigns) {
  globalThis.sendingCampaigns = new Set<string>();
}

async function checkAndSendScheduledCampaigns() {
  try {
    const now = new Date();
    // Use local string representation for debugging log output
    console.log(`[Scheduler] Checking for due scheduled campaigns at ${now.toLocaleString()}...`);

    const dueCampaigns = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, "scheduled"),
          isNotNull(campaigns.templateId),
          lte(campaigns.scheduledAt, now)
        )
      );

    if (dueCampaigns.length === 0) {
      return;
    }

    console.log(`[Scheduler] Found ${dueCampaigns.length} campaigns due for sending.`);

    for (const campaign of dueCampaigns) {
      const campaignId = campaign.id;
      const templateId = campaign.templateId;

      if (!templateId) {
        console.warn(`[Scheduler] Campaign ${campaignId} is scheduled but templateId is missing. Skipping.`);
        continue;
      }

      if (globalThis.sendingCampaigns!.has(campaignId)) {
        console.log(`[Scheduler] Campaign ${campaignId} is already being processed. Skipping tick.`);
        continue;
      }

      // Lock the campaign in memory
      globalThis.sendingCampaigns!.add(campaignId);

      // Execute sending asynchronously to not block the check loop
      executeCampaignSend(campaignId, templateId)
        .then((res) => {
          if (res.success) {
            console.log(`[Scheduler Success] Successfully sent campaign "${campaign.name}" (ID: ${campaignId}): ${res.message}`);
          } else {
            console.error(`[Scheduler Failure] Failed sending campaign "${campaign.name}" (ID: ${campaignId}): ${res.error}`);
          }
        })
        .catch((err) => {
          console.error(`[Scheduler Error] Critical error sending campaign "${campaign.name}" (ID: ${campaignId}):`, err);
        })
        .finally(() => {
          globalThis.sendingCampaigns!.delete(campaignId);
        });
    }
  } catch (error) {
    console.error("[Scheduler Error] checkAndSendScheduledCampaigns execution failed:", error);
  }
}

async function checkAndSyncReplies() {
  try {
    const now = new Date();
    console.log(`[Scheduler] Checking for active campaigns to sync replies at ${now.toLocaleString()}...`);

    // Find distinct campaign IDs that have recipients with status = "sent" and gmailThreadId is not null
    const activeCampaigns = await db
      .select({ campaignId: recipients.campaignId })
      .from(recipients)
      .where(
        and(
          eq(recipients.status, "sent"),
          isNotNull(recipients.gmailThreadId)
        )
      );

    // Filter in-memory to make it unique
    const uniqueCampaignIds = Array.from(new Set(activeCampaigns.map(ac => ac.campaignId)));

    if (uniqueCampaignIds.length === 0) {
      return;
    }

    console.log(`[Scheduler] Found ${uniqueCampaignIds.length} campaigns with active sent threads to sync replies.`);

    for (const campaignId of uniqueCampaignIds) {
      executeSyncReplies(campaignId)
        .then((res) => {
          if (res.success && res.repliesCount > 0) {
            console.log(`[Scheduler Reply Sync Success] Campaign ${campaignId}: detected ${res.repliesCount} new replies.`);
          }
        })
        .catch((err) => {
          console.error(`[Scheduler Reply Sync Error] Failed to sync replies for campaign ${campaignId}:`, err);
        });
    }
  } catch (error) {
    console.error("[Scheduler Error] checkAndSyncReplies execution failed:", error);
  }
}

// Start the scheduler if it has not been started yet
if (process.env.NEXT_PHASE === "phase-production-build") {
  console.log("[Scheduler] Next.js production build phase detected. Skipping background scheduler initialization.");
} else if (!globalThis.schedulerActive) {
  globalThis.schedulerActive = true;
  console.log("[Scheduler] Initializing background email scheduler & reply sync (interval: 60s)...");
  
  // Run once immediately on startup
  checkAndSendScheduledCampaigns();
  checkAndSyncReplies();

  // Poll every 60 seconds
  setInterval(() => {
    checkAndSendScheduledCampaigns();
    checkAndSyncReplies();
  }, 60 * 1000);
}
export {};
