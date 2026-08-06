import type { Metadata } from "next"
import "./globals.css"
import "@/lib/scheduler"
import { auth, signOut } from "@/auth"
import Image from "next/image"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Outreacher - Google Sheets & Gmail Integration",
  description: "Automate your cold outreach email campaigns by merging spreadsheet data with Gmail templates.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()

  return (
    <html lang="en">
      <body
        className="antialiased bg-slate-950 text-slate-100 flex flex-col min-h-screen"
      >
        {session && (
          <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
              {/* Logo / Link to Home */}
              <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <span className="font-serif font-extrabold tracking-tight text-slate-100 text-sm">
                    Outreacher
                  </span>
                </Link>

                {/* Nav Links */}
                <nav className="flex items-center gap-5 text-xs font-semibold text-slate-400">
                  <Link href="/" className="hover:text-slate-100 transition-colors">
                    Dashboard
                  </Link>
                  <Link href="/campaign" className="hover:text-slate-100 transition-colors">
                    Campaigns
                  </Link>
                  <Link href="/campaign/templates" className="hover:text-slate-100 transition-colors">
                    Templates
                  </Link>
                </nav>
              </div>

              {/* Right Side: Profile Info & Sign Out */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      width={28}
                      height={28}
                      className="rounded-full border border-indigo-600/30"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-950 border border-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold uppercase text-[10px]">
                      {(session.user.name || "U")[0]}
                    </div>
                  )}
                  <span className="hidden sm:inline text-xs font-semibold text-slate-200">
                    {session.user.name}
                  </span>
                </div>

                <form
                  action={async () => {
                    "use server"
                    await signOut()
                  }}
                >
                  <button
                    type="submit"
                    className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    Sign Out
                  </button>
                </form>
              </div>
            </div>
          </header>
        )}
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  )
}
