import React from "react"

export default function UnsubscribeSuccessPage() {
  return (
    <main className="min-h-screen bg-[#161413] text-[#FAF8F5] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-[#1E1C1B] border border-[#2C2A29] rounded-2xl p-8 shadow-sm text-center space-y-6">
        <div className="mx-auto w-12 h-12 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-extrabold text-[#FAF8F5]">
            Unsubscribed Successfully
          </h1>
          <p className="text-[#A09890] text-xs leading-relaxed">
            You have been removed from this mailing list. You will no longer receive automated emails or follow-ups for this sequence.
          </p>
        </div>

        <div className="pt-2 text-[10px] text-[#A09890] border-t border-[#2C2A29]/50 font-serif">
          Thank you. You may close this tab.
        </div>
      </div>
    </main>
  )
}
