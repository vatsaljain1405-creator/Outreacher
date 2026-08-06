import { db } from "@/db"
import { accounts, users } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { Session } from "next-auth"


/**
 * Checks if the Google OAuth access token is valid (or near expiry).
 * If expired, it requests a new access token using the stored refresh token,
 * updates it in the database (if online), and returns the active access token.
 */
export async function getValidGoogleToken(
  userId: string,
  fallbackTokens?: { accessToken?: string; refreshToken?: string; expiresAt?: number }
): Promise<string> {
  // Query the account from the database
  let account: { access_token?: string | null; refresh_token?: string | null; expires_at?: number | null } | null = null
  let dbOffline = false

  try {
    const dbAccount = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
    })
    if (dbAccount) {
      account = dbAccount
    }
  } catch {
    console.warn(`[Token Refresh] Database is offline. Relying on fallback tokens.`)
    dbOffline = true
  }

  // Resolve active tokens
  const activeAccessToken = account?.access_token || fallbackTokens?.accessToken
  const activeRefreshToken = account?.refresh_token || fallbackTokens?.refreshToken
  const activeExpiresAt = account?.expires_at || fallbackTokens?.expiresAt

  if (!activeAccessToken) {
    throw new Error(`No Google OAuth access token found for user: ${userId}`)
  }

  // Check if token is expired or within 5 minutes (300 seconds) of expiring
  const now = Math.floor(Date.now() / 1000)
  const isExpired = activeExpiresAt ? now >= (activeExpiresAt - 300) : true

  if (!isExpired) {
    return activeAccessToken
  }

  // Refresh token is required
  if (!activeRefreshToken) {
    throw new Error(`No refresh token available for user: ${userId}. Re-consent required.`)
  }

  console.log(`[Token Refresh] Access token expired or near expiry for user ${userId}. Refreshing...`)

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: activeRefreshToken,
      }),
    })

    const bodyText = await response.text()

    if (!response.ok) {
      console.error(
        `[Token Refresh Failure] Google returned status ${response.status} for user ${userId}:`,
        bodyText
      )
      throw new Error(`Google token refresh failed: ${bodyText}`)
    }

    const tokens = JSON.parse(bodyText)

    // Calculate new expiration timestamp
    const newExpiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in as number)

    // Update the database if it is online
    if (!dbOffline) {
      try {
        await db
          .update(accounts)
          .set({
            access_token: tokens.access_token,
            expires_at: newExpiresAt,
            refresh_token: tokens.refresh_token ?? activeRefreshToken,
          })
          .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
        console.log(`[Token Refresh Success] Updated access token in database for user ${userId}.`)
      } catch (writeError) {
        console.error(`[Token Refresh DB Update Error] Database write failed:`, writeError)
      }
    } else {
      console.log(`[Token Refresh Success] Refreshed token in-memory (database is offline) for user ${userId}.`)
    }

    return tokens.access_token as string
  } catch (error) {
    console.error(`[Token Refresh Error] Failed to refresh Google token for user ${userId}:`, error)
    throw error
  }
}

/**
 * Ensures that the authenticated user exists in the SQLite database.
 * If the database was reset/migrated, this function dynamically re-creates
 * the user and account records using session data to avoid foreign key failures.
 */
export async function ensureUserExists(session: Session): Promise<void> {
  if (!session || !session.user || !session.user.id || !session.user.email) {
    return
  }
  const userId = session.user.id
  const email = session.user.email
  const name = session.user.name || null
  const image = session.user.image || null

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!existingUser) {
      console.log(`[Database Sync] User ${userId} not found in SQLite. Auto-creating user record.`)
      await db.insert(users).values({
        id: userId,
        email,
        name,
        image,
      })

      if (session.accessToken || session.refreshToken) {
        console.log(`[Database Sync] Creating account record for user ${userId}.`)
        await db.insert(accounts).values({
          userId,
          type: "oauth",
          provider: "google",
          providerAccountId: userId,
          access_token: session.accessToken || null,
          refresh_token: session.refreshToken || null,
          expires_at: session.expiresAt || null,
        })
      }
    } else {
      // User exists, check if account exists and tokens are out of sync
      const existingAccount = await db.query.accounts.findFirst({
        where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
      })

      if (existingAccount) {
        const needsUpdate =
          (session.accessToken && session.accessToken !== existingAccount.access_token) ||
          (session.refreshToken && session.refreshToken !== existingAccount.refresh_token)

        if (needsUpdate) {
          console.log(`[Database Sync] Stale tokens detected in DB. Updating account record for user ${userId}.`)
          await db
            .update(accounts)
            .set({
              access_token: session.accessToken || existingAccount.access_token,
              refresh_token: session.refreshToken || existingAccount.refresh_token,
              expires_at: session.expiresAt !== undefined ? session.expiresAt : existingAccount.expires_at,
            })
            .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
        }
      } else if (session.accessToken || session.refreshToken) {
        console.log(`[Database Sync] Account record missing for existing user ${userId}. Creating one.`)
        await db.insert(accounts).values({
          userId,
          type: "oauth",
          provider: "google",
          providerAccountId: userId,
          access_token: session.accessToken || null,
          refresh_token: session.refreshToken || null,
          expires_at: session.expiresAt || null,
        })
      }
    }
  } catch (error) {
    console.error(`[Database Sync Error] Failed to ensure user exists:`, error)
  }
}

