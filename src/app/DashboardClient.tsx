"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { syncAllRepliesAction } from "@/app/campaign/actions"

interface CampaignItem {
  id: string
  name: string
  status: string
  createdAt: Date
  recipientCount: number
  opensCount: number
  clicksCount: number
  repliesCount: number
}

interface TrackingLogItem {
  id: string
  type: string
  createdAt: Date | string
  recipientEmail: string
  campaignName: string
}

interface DashboardClientProps {
  userName: string
  totalSent: number
  totalOpened: number
  totalClicked: number
  totalReplied: number
  campaignsList: CampaignItem[]
  trackingLogs: TrackingLogItem[]
  isLocalhost?: boolean
}

export default function DashboardClient({
  userName,
  totalSent,
  totalOpened,
  totalClicked,
  totalReplied,
  campaignsList,
  trackingLogs,
  isLocalhost = false,
}: DashboardClientProps) {
  const [activeModal, setActiveModal] = useState<"analytics" | "tracking" | null>(null)
  const [trackingFilter, setTrackingFilter] = useState<"all" | "open" | "click" | "reply">("all")
  const [trackingSearch, setTrackingSearch] = useState("")
  
  // Manual sync states
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Chart animation trigger
  const [isChartRendered, setIsChartRendered] = useState(false)

  useEffect(() => {
    if (activeModal === "analytics") {
      const timer = setTimeout(() => setIsChartRendered(true), 50)
      return () => {
        clearTimeout(timer)
        setIsChartRendered(false)
      }
    }
  }, [activeModal])

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0
  const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0

  // Filtered Tracking logs
  const filteredLogs = useMemo(() => {
    return trackingLogs.filter((log) => {
      const matchesFilter = trackingFilter === "all" || log.type === trackingFilter
      const matchesSearch =
        log.recipientEmail.toLowerCase().includes(trackingSearch.toLowerCase()) ||
        log.campaignName.toLowerCase().includes(trackingSearch.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [trackingLogs, trackingFilter, trackingSearch])

  // Analytics helper metrics
  const topCampaigns = useMemo(() => {
    return [...campaignsList]
      .sort((a, b) => b.opensCount - a.opensCount)
      .slice(0, 3)
  }, [campaignsList])

  // Execute user-wide Gmail status polling
  const handleSyncAll = async () => {
    if (isSyncing) return
    setIsSyncing(true)
    setSyncMessage("Syncing active sequences with Gmail threads...")
    try {
      const res = await syncAllRepliesAction()
      if (res.success) {
        setSyncMessage(res.message || "Outreach status sync complete!")
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        setSyncMessage(`Sync failed: ${res.error || "Unknown error"}`)
      }
    } catch (err) {
      console.error("Sync error:", err)
      setSyncMessage("Sync failed. Check connection logs.")
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncMessage(null), 5000)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 pt-10 font-sans relative overflow-x-hidden">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Sync Status Banner */}
        {syncMessage && (
          <div className="bg-indigo-950/80 border border-indigo-500/30 text-indigo-200 text-xs rounded-2xl p-3 flex items-center justify-between shadow-glow-indigo animate-slide-down">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span>{syncMessage}</span>
            </div>
          </div>
        )}

        {/* Localhost Warning Banner */}
        {isLocalhost && (
          <div className="bg-amber-950/20 border border-amber-500/20 text-amber-200 text-xs rounded-2xl p-5 shadow-glow-amber animate-slide-down space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-450">
              <span className="text-base">⚠️</span>
              <span>Local Host Environment Notice</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Your server base URL is currently set to <code className="text-amber-400 font-mono bg-slate-950 px-1 py-0.5 rounded">localhost</code> in <code className="text-slate-350 font-mono font-bold">.env.local</code>. 
              While background scheduling and reply detection function properly, <strong>actual email opens and clicks will not register</strong>. This is because {"Gmail's"} image servers and link redirects require a public address to communicate back to your computer.
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              To test open and click tracking locally: expose your local port via a secure tunnel (e.g., run <code className="text-slate-200 font-mono bg-slate-950 px-1.5 py-0.5 rounded">ngrok http 3000</code> in your terminal) and change <code className="text-slate-200 font-mono font-bold">NEXTAUTH_URL</code> to the generated HTTPS address.
            </p>
          </div>
        )}

        {/* Header Title & Top-Right Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-slate-700/50 animate-slide-down">
          <div>
            <h1 className="text-3xl font-serif font-extrabold text-slate-100 tracking-tight">
              Outreacher Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-normal">
              Welcome back, <strong className="text-slate-200">{userName}</strong>. Monitor outreach metrics, sequence stats, and active threads.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSyncAll}
              disabled={isSyncing}
              type="button"
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-xs font-semibold text-slate-200 shadow-lg active:scale-95 transition-all duration-200 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-indigo-400" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
              </svg>
              {isSyncing ? "Syncing..." : "Sync Statuses"}
            </button>
            <button
              onClick={() => setActiveModal("analytics")}
              type="button"
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-xs font-semibold text-slate-200 shadow-lg active:scale-95 transition-all duration-200 cursor-pointer"
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveModal("tracking")}
              type="button"
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-xs font-semibold text-slate-200 shadow-lg active:scale-95 transition-all duration-200 cursor-pointer"
            >
              Tracking Logs
            </button>
            <Link
              href="/campaign"
              className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-950/20 transition-all duration-200 active:scale-95"
            >
              + New Campaign
            </Link>
          </div>
        </div>

        {/* Aggregate Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Total Sent */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-2 shadow-xl hover:shadow-glow-indigo hover:-translate-y-0.5 hover:border-slate-700/50 transition-all duration-300 group animate-slide-up animation-delay-75">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono group-hover:text-indigo-400 transition-colors">
              Total Emails Sent
            </span>
            <span className="block text-4.5xl font-serif font-extrabold text-slate-100 group-hover:scale-102 transition-transform origin-left duration-300">
              {totalSent}
            </span>
            <span className="block text-xs text-indigo-400 font-medium font-serif">
              Outreach sequence emails delivered
            </span>
          </div>

          {/* Card 2: Total Opened */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-2 shadow-xl hover:shadow-glow-emerald hover:-translate-y-0.5 hover:border-slate-700/50 transition-all duration-300 group animate-slide-up animation-delay-150">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono group-hover:text-emerald-400 transition-colors">
              Unique Email Opens
            </span>
            <span className="block text-4.5xl font-serif font-extrabold text-slate-100 group-hover:scale-102 transition-transform origin-left duration-300">
              {totalOpened}
            </span>
            <span className="block text-xs text-emerald-400 font-medium font-serif">
              {openRate}% open rate average
            </span>
          </div>

          {/* Card 3: Link Clicks */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-2 shadow-xl hover:shadow-glow-indigo hover:-translate-y-0.5 hover:border-slate-700/50 transition-all duration-300 group animate-slide-up animation-delay-225">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono group-hover:text-indigo-300 transition-colors">
              Link Clicks
            </span>
            <span className="block text-4.5xl font-serif font-extrabold text-slate-100 group-hover:scale-102 transition-transform origin-left duration-300">
              {totalClicked}
            </span>
            <span className="block text-xs text-indigo-305 font-medium font-serif">
              {clickRate}% click-through average
            </span>
          </div>

          {/* Card 4: Total Replied */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-2 shadow-xl hover:shadow-glow-pink hover:-translate-y-0.5 hover:border-slate-700/50 transition-all duration-300 group animate-slide-up animation-delay-300">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono group-hover:text-pink-400 transition-colors">
              Prospect Responses
            </span>
            <span className="block text-4.5xl font-serif font-extrabold text-slate-100 group-hover:scale-102 transition-transform origin-left duration-300">
              {totalReplied}
            </span>
            <span className="block text-xs text-pink-400 font-medium font-serif">
              {replyRate}% response conversion
            </span>
          </div>
        </div>

        {/* Recent Campaigns Table */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4 shadow-xl animate-slide-up animation-delay-450">
          <div>
            <h2 className="text-lg font-serif font-bold text-slate-200">Recent Sequences</h2>
            <p className="text-xs text-slate-400 mt-0.5">Showing your last 5 outreach campaigns and live status.</p>
          </div>

          {campaignsList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              No campaigns created yet. Click &quot;+ New Campaign&quot; to launch your first sequence.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/20">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-850 text-slate-400 font-semibold">
                    <th className="p-3">Name</th>
                    <th className="p-3">Recipients</th>
                    <th className="p-3">Opens</th>
                    <th className="p-3">Clicks</th>
                    <th className="p-3">Replies</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {campaignsList.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/20 text-slate-300 hover:scale-[1.001] transition-all duration-200">
                      <td className="p-3 font-semibold text-slate-100">{c.name}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-400">{c.recipientCount} rows</td>
                      <td className="p-3 font-mono text-[11px] text-emerald-400">{c.opensCount} opens</td>
                      <td className="p-3 font-mono text-[11px] text-indigo-300">{c.clicksCount || 0} clicks</td>
                      <td className="p-3 font-mono text-[11px] text-pink-400">{c.repliesCount} replies</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border uppercase ${
                          c.status === "completed"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : c.status === "scheduled"
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-glow-amber animate-pulse"
                            : "bg-slate-800 border-slate-700 text-slate-400"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3 text-right flex items-center justify-end gap-2">
                        {c.status === "completed" && (
                          <Link
                            href={`/campaign?parentCampaignId=${c.id}`}
                            className="inline-block py-1 px-2.5 rounded-lg bg-pink-950 hover:bg-pink-900 border border-pink-500/30 hover:border-pink-400 text-pink-300 hover:text-pink-200 transition-all font-semibold text-[11px] active:scale-95"
                          >
                            Create Follow-up
                          </Link>
                        )}
                        <Link
                          href={`/campaign?id=${c.id}`}
                          className="inline-block py-1 px-3 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 hover:text-indigo-200 transition-all font-semibold text-[11px] active:scale-95"
                        >
                          Setup Wizard
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* --- MODAL 1: ANALYTICS --- */}
      {activeModal === "analytics" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative animate-scale-up space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-extrabold text-xl"
            >
              ×
            </button>

            <div>
              <h2 className="text-xl font-serif font-extrabold text-slate-100">Performance Analytics</h2>
              <p className="text-xs text-slate-400 mt-0.5">Statistical breakdown of outreach sequences</p>
            </div>

            {/* Performance Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-center space-y-1">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Open Rate</span>
                <span className="block text-2xl font-bold text-emerald-400">{openRate}%</span>
                <p className="text-[10px] text-slate-500">Avg target: 20-30%</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-center space-y-1">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Click Rate</span>
                <span className="block text-2xl font-bold text-indigo-400">{clickRate}%</span>
                <p className="text-[10px] text-slate-500">Avg target: 5-15%</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-center space-y-1">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Response Rate</span>
                <span className="block text-2xl font-bold text-pink-400">{replyRate}%</span>
                <p className="text-[10px] text-slate-500">Avg target: 5-10%</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-center space-y-1">
                <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Responses</span>
                <span className="block text-2xl font-bold text-slate-200">{totalReplied}</span>
                <p className="text-[10px] text-slate-500">Total threads</p>
              </div>
            </div>

            {/* Visual Chart */}
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-850 space-y-4">
              <h3 className="text-xs font-semibold text-slate-350 font-mono uppercase tracking-wider">Sequence Performance Rates</h3>
              
              {campaignsList.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-xs font-mono">No data to render chart</div>
              ) : (
                <div className="space-y-4">
                  {campaignsList.slice(0, 4).map((c) => {
                    const pctOpen = c.recipientCount > 0 ? Math.round((c.opensCount / c.recipientCount) * 100) : 0
                    const pctClick = c.recipientCount > 0 ? Math.round(((c.clicksCount || 0) / c.recipientCount) * 100) : 0
                    const pctReply = c.recipientCount > 0 ? Math.round((c.repliesCount / c.recipientCount) * 100) : 0
                    return (
                      <div key={c.id} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono font-medium text-slate-300">
                          <span className="truncate max-w-[200px] font-semibold">{c.name}</span>
                          <span>{c.recipientCount} rows | {pctOpen}% opens | {pctClick}% clicks | {pctReply}% replies</span>
                        </div>
                        <div className="w-full h-3 bg-slate-900 rounded overflow-hidden flex border border-slate-800">
                          {/* Opens bar */}
                          <div 
                            className="bg-emerald-500 h-full transition-[width] duration-[1200ms] ease-out" 
                            style={{ width: isChartRendered ? `${pctOpen / 3}%` : "0%" }}
                            title={`Opens: ${pctOpen}%`}
                          />
                          {/* Clicks bar */}
                          <div 
                            className="bg-indigo-400 h-full transition-[width] duration-[1200ms] ease-out delay-75" 
                            style={{ width: isChartRendered ? `${pctClick / 3}%` : "0%" }}
                            title={`Clicks: ${pctClick}%`}
                          />
                          {/* Replies bar */}
                          <div 
                            className="bg-pink-500 h-full transition-[width] duration-[1200ms] ease-out delay-150" 
                            style={{ width: isChartRendered ? `${pctReply / 3}%` : "0%" }}
                            title={`Replies: ${pctReply}%`}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex gap-4 text-[9px] font-mono text-slate-500 pt-2 border-t border-slate-900">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500 block" /> Open Rate</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-400 block" /> Click Rate</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-pink-500 block" /> Reply Rate</span>
                  </div>
                </div>
              )}
            </div>

            {/* Top Campaigns */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-350 font-mono uppercase tracking-wider">Top Performing Sequences (By Open Volume)</h3>
              <div className="space-y-2">
                {topCampaigns.map((c, i) => (
                  <div key={c.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-850/80 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-850 flex items-center justify-center font-mono font-bold text-indigo-400 text-[10px]">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-slate-200">{c.name}</span>
                    </div>
                    <span className="font-mono text-slate-400">{c.opensCount} opens | {c.clicksCount || 0} clicks ({c.recipientCount} rows)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: TRACKING LOGS --- */}
      {activeModal === "tracking" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative animate-scale-up space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-extrabold text-xl"
            >
              ×
            </button>

            <div>
              <h2 className="text-xl font-serif font-extrabold text-slate-100">Click & Open Tracking Logs</h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time audit log of email engagement events</p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-slate-955 p-3 rounded-xl border border-slate-850">
              {/* Type Filters */}
              <div className="flex gap-1.5 text-[10px] font-semibold">
                {(["all", "open", "click", "reply"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTrackingFilter(type)}
                    className={`py-1 px-3 rounded-lg capitalize transition-all border cursor-pointer active:scale-95 ${
                      trackingFilter === type
                        ? "bg-indigo-600 border-indigo-500 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {type}s
                  </button>
                ))}
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="Search email or campaign..."
                value={trackingSearch}
                onChange={(e) => setTrackingSearch(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-200 py-1.5 px-3 rounded-lg focus:outline-none focus:border-indigo-500 font-sans w-full sm:w-[220px]"
              />
            </div>

            {/* Logs List */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-650 text-xs font-mono border border-dashed border-slate-850 rounded-xl">
                  No tracking logs match filters.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex justify-between items-start sm:items-center gap-3 bg-slate-950/60 border border-slate-850 hover:border-slate-800 p-3 rounded-xl transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${
                          log.type === "reply"
                            ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                            : log.type === "open"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                        }`}>
                          {log.type}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-200 font-mono">{log.recipientEmail}</span>
                      </div>
                      <p className="text-[10px] text-slate-450 leading-none">
                        Campaign: <strong className="text-slate-350">{log.campaignName}</strong>
                      </p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 text-right shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
