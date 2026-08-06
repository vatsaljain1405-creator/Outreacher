"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { saveTemplateAction, deleteTemplateAction, getTemplatesAction } from "./actions"

export interface CampaignData {
  id: string
  name: string
  headers: string[]
}

export interface RecipientData {
  id: string
  email: string
  fields: Record<string, string>
}

export interface TemplateData {
  id: string
  campaignId: string
  name: string
  subject: string
  body: string
  fallbacks: Record<string, string>
  createdAt: Date
  unsubscribeEnabled?: boolean
  attachments?: Array<{ name: string; mimeType: string; size: number; content: string }>
}

interface TemplatePageClientProps {
  campaign: CampaignData
  recipients: RecipientData[]
  initialTemplates: TemplateData[]
  isDbOffline: boolean
}

export default function TemplatePageClient({
  campaign,
  recipients,
  initialTemplates,
  isDbOffline,
}: TemplatePageClientProps) {
  // Database vs In-Memory template state
  const [savedTemplates, setSavedTemplates] = useState<TemplateData[]>(initialTemplates)
  const [dbOffline] = useState(isDbOffline)

  // Active Editor States
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState("Default Template")
  const [subject, setSubject] = useState("Hello {First Name}!")
  const [bodyHtml, setBodyHtml] = useState("<p>Dear {First Name},</p><p>We are excited to work with you at {Company}!</p>")
  const [fallbacks, setFallbacks] = useState<Record<string, string>>({})
  const [unsubscribeEnabled, setUnsubscribeEnabled] = useState(false)
  const [attachmentsList, setAttachmentsList] = useState<Array<{ name: string; mimeType: string; size: number; content: string }>>([])

  // Target Focus Tracking
  const [lastFocusedField, setLastFocusedField] = useState<"subject" | "body">("body")
  const subjectInputRef = useRef<HTMLInputElement>(null)

  // Live Preview States
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(recipients[0]?.id || "")
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; text: string } | null>(null)

  // TipTap Rich Text Editor Configuration
  const editor = useEditor({
    extensions: [StarterKit],
    content: bodyHtml,
    editorProps: {
      attributes: {
        class: "min-h-[250px] bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-b-lg p-4 focus:outline-none text-slate-200 prose prose-invert max-w-none text-sm",
      },
    },
    onUpdate({ editor }) {
      setBodyHtml(editor.getHTML())
    },
  })

  // Synchronize editor content when loading a new template profile
  useEffect(() => {
    if (editor && editor.getHTML() !== bodyHtml) {
      editor.commands.setContent(bodyHtml)
    }
  }, [bodyHtml, editor])

  // Clear success messages after a few seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  // 1. Placeholder token cursor insertion logic
  const handleInsertPlaceholder = (header: string) => {
    const token = `{${header}}`

    if (lastFocusedField === "subject") {
      const input = subjectInputRef.current
      if (input) {
        const start = input.selectionStart || 0
        const end = input.selectionEnd || 0
        const textBefore = subject.substring(0, start)
        const textAfter = subject.substring(end)
        const newSubject = textBefore + token + textAfter
        setSubject(newSubject)

        // Reset cursor focus
        setTimeout(() => {
          input.focus()
          input.setSelectionRange(start + token.length, start + token.length)
        }, 10)
      }
    } else {
      // Focus TipTap and insert content at current cursor node
      if (editor) {
        editor.commands.focus()
        editor.commands.insertContent(token)
      }
    }
  }

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    // Calculate current total size
    let currentTotal = attachmentsList.reduce((acc, curr) => acc + curr.size, 0)
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // Limit 5MB per file
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 5MB size limit.`)
        continue
      }
      
      // Limit 10MB total
      if (currentTotal + file.size > 10 * 1024 * 1024) {
        alert("Total attachment size exceeds the 10MB limit.")
        break
      }
      
      currentTotal += file.size
      
      const reader = new FileReader()
      reader.onload = (evt) => {
        const base64Data = evt.target?.result as string
        if (base64Data) {
          setAttachmentsList((prev) => [
            ...prev,
            {
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              content: base64Data,
            },
          ])
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachmentsList((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  // 2. Load Selected Template Profile
  const handleLoadTemplate = (id: string) => {
    if (id === "") {
      setSelectedTemplateId(null)
      setTemplateName("New Template Profile")
      setSubject("Hello {First Name}!")
      setBodyHtml("<p>Dear {First Name},</p><p>We are excited to work with you at {Company}!</p>")
      setFallbacks({})
      setUnsubscribeEnabled(false)
      setAttachmentsList([])
      return
    }

    const template = savedTemplates.find((t) => t.id === id)
    if (template) {
      if (template.campaignId !== campaign.id) {
        setSelectedTemplateId(template.id)
        setTemplateName(template.name + " (Copy)")
      } else {
        setSelectedTemplateId(template.id)
        setTemplateName(template.name)
      }
      setSubject(template.subject)
      setBodyHtml(template.body)
      setFallbacks(template.fallbacks || {})
      setUnsubscribeEnabled(template.unsubscribeEnabled || false)
      setAttachmentsList(template.attachments || [])
    }
  }

  // 3. Save / Upsert Template Profile
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!templateName.trim()) {
      alert("Please enter a name for your template profile.")
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await saveTemplateAction(
        selectedTemplateId,
        campaign.id,
        templateName,
        subject,
        bodyHtml,
        fallbacks,
        unsubscribeEnabled,
        attachmentsList
      )

      if (res.success) {
        setStatusMessage({
          success: true,
          text: `Template "${templateName}" saved successfully in database!`,
        })
        // Reload from DB
        const listRes = await getTemplatesAction(campaign.id)
        if (listRes.success && listRes.templates) {
          setSavedTemplates(listRes.templates as TemplateData[])
        }
        if (res.templateId) {
          setSelectedTemplateId(res.templateId)
        }
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to save template." })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  // 4. Delete Template Profile
  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return
    if (!confirm("Are you sure you want to delete this template profile?")) return

    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await deleteTemplateAction(selectedTemplateId)
      if (res.success) {
        setStatusMessage({
          success: true,
          text: "Template profile deleted successfully!",
        })
        // Reload templates
        const listRes = await getTemplatesAction(campaign.id)
        if (listRes.success && listRes.templates) {
          setSavedTemplates(listRes.templates as TemplateData[])
        }
        // Reset inputs
        handleLoadTemplate("")
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to delete template." })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  // 5. Case-insensitive and Space-tolerant Merge Engine
  const mergeTokens = (textToMerge: string, recipient: RecipientData | undefined) => {
    if (!textToMerge) return ""
    if (!recipient) return textToMerge

    let merged = textToMerge

    campaign.headers.forEach((header) => {
      // Create regex matching {Header} or { Header } case-insensitively, tolerating spaces
      const escapedHeader = header
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") // Escape regex characters
        .replace(/\s+/g, "\\s*") // Space tolerance

      const regex = new RegExp(`\\{\\s*${escapedHeader}\\s*\\}`, "gi")

      // Fetch row cell value and fallback
      const cellValue = recipient.fields[header]
      const fallbackValue = fallbacks[header] || ""
      const replacementValue =
        cellValue !== undefined && cellValue !== null && cellValue.trim() !== "" ? cellValue : fallbackValue

      merged = merged.replace(regex, replacementValue)
    })

    // Cleanup any literal remaining empty curly braces or empty tokens like "{}"
    merged = merged.replace(/\{\s*\}/g, "")
    // Ensure empty paragraphs or paragraphs with only trailing breaks do not collapse in preview & email clients
    merged = merged.replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "<p>&nbsp;</p>")

    return merged
  }

  // Calculate live previews
  const activeRecipient = recipients.find((r) => r.id === selectedRecipientId)
  const mergedSubjectPreview = mergeTokens(subject, activeRecipient)
  const mergedBodyPreview = mergeTokens(bodyHtml, activeRecipient)

  return (
    <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* LEFT PANEL: Editor & Profile Configurations (7 cols) */}
      <div className="lg:col-span-7 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex justify-between items-center">
          <Link
            href="/campaign"
            className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors group"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Campaigns
          </Link>
          {dbOffline && (
            <span className="px-2 py-0.5 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-md font-mono">
              Database Offline (Testing Active)
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-serif font-extrabold tracking-tight text-slate-100">
            Template Customizer
          </h1>
          <p className="text-xs text-slate-400">
            Customize merge variables for campaign: <strong className="text-slate-300">{campaign.name}</strong>
          </p>
        </div>

        {/* Profile Picker Dashboard */}
        <div className="flex flex-col sm:flex-row gap-3 items-end bg-slate-950/30 border border-slate-800/50 rounded-xl p-4">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Saved Template Profiles
            </label>
            <select
              value={selectedTemplateId || ""}
              onChange={(e) => handleLoadTemplate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-200 transition-colors"
            >
              <option value="">[ Create New Template Profile ]</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {selectedTemplateId && (
            <button
              type="button"
              onClick={handleDeleteTemplate}
              disabled={loading}
              className="w-full sm:w-auto py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 text-xs font-semibold transition-all duration-200"
            >
              Delete
            </button>
          )}
        </div>

        {/* Form Editor */}
        <form onSubmit={handleSaveTemplate} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Profile Name
              </label>
              <input
                type="text"
                placeholder="e.g. Cold Pitch - Standard"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-200 placeholder-slate-500 transition-colors"
              />
            </div>
            <div className="flex items-end justify-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-indigo-950/15"
              >
                {loading ? "Saving..." : selectedTemplateId ? "Save Profile Changes" : "Save as New Profile"}
              </button>
            </div>
          </div>

          {/* Placeholders Toolbar */}
          <div className="bg-slate-950/30 border border-slate-800/40 rounded-xl p-4">
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Merge Placeholders (Click to insert at active cursor)
            </h3>
            <div className="flex flex-wrap gap-2">
              {campaign.headers.map((header) => (
                <button
                  type="button"
                  key={header}
                  onClick={() => handleInsertPlaceholder(header)}
                  className="inline-flex items-center px-2 py-1 rounded bg-indigo-950/40 border border-indigo-500/25 hover:border-indigo-400/50 text-indigo-300 font-mono text-[11px] hover:text-indigo-200 transition-colors"
                >
                  {"{"}{header}{"}"}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Field */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              ref={subjectInputRef}
              placeholder="e.g. Opportunity at {Company}"
              value={subject}
              onFocus={() => setLastFocusedField("subject")}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-2.5 px-4 text-xs text-slate-200 placeholder-slate-500 transition-colors font-sans"
            />
          </div>

          {/* TipTap Rich Body Editor */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Email Body (Rich HTML Layout)
            </label>
            <div className="flex flex-col rounded-lg overflow-hidden border border-slate-800">
              {/* Custom Editor Toolbar */}
              <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 flex flex-wrap gap-1 items-center">
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  className={`p-1 rounded hover:bg-slate-800 text-xs transition-colors ${
                    editor?.isActive("bold") ? "bg-indigo-900/40 text-indigo-400" : "text-slate-400"
                  }`}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  className={`p-1 rounded hover:bg-slate-800 text-xs italic transition-colors ${
                    editor?.isActive("italic") ? "bg-indigo-900/40 text-indigo-400" : "text-slate-400"
                  }`}
                  title="Italic"
                >
                  I
                </button>
                <span className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  className={`p-1 rounded hover:bg-slate-800 text-xs transition-colors ${
                    editor?.isActive("bulletList") ? "bg-indigo-900/40 text-indigo-400" : "text-slate-400"
                  }`}
                  title="Bullet List"
                >
                  • List
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                  className={`p-1 rounded hover:bg-slate-800 text-xs transition-colors ${
                    editor?.isActive("orderedList") ? "bg-indigo-900/40 text-indigo-400" : "text-slate-400"
                  }`}
                  title="Ordered List"
                >
                  1. List
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                  className={`p-1 rounded hover:bg-slate-800 text-[10px] font-mono transition-colors ${
                    editor?.isActive("codeBlock") ? "bg-indigo-900/40 text-indigo-400" : "text-slate-400"
                  }`}
                  title="Code Block"
                >
                  Code
                </button>
                <span className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().undo().run()}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 text-xs transition-colors"
                  title="Undo"
                >
                  ↩
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().redo().run()}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 text-xs transition-colors"
                  title="Redo"
                >
                  ↪
                </button>
              </div>

              {/* Editor Workspace */}
              <div onClick={() => setLastFocusedField("body")}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* Attachments Section */}
          <div className="space-y-3">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Attachments ({attachmentsList.length})
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold text-xs transition-colors">
                <span>Attach Files</span>
                <input
                  type="file"
                  multiple
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </label>
              <span className="text-[10px] text-slate-500 font-serif">
                Max 5MB per file, 10MB total.
              </span>
            </div>

            {attachmentsList.length > 0 && (
              <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-3 space-y-2">
                {attachmentsList.map((att, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-900">
                    <div className="flex items-center gap-2 truncate">
                      <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="truncate" title={att.name}>{att.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                        ({(att.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                      title="Remove attachment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unsubscribe Option Toggle */}
          <div className="flex items-start gap-3 bg-slate-950/20 border border-slate-850 p-4 rounded-xl">
            <input
              type="checkbox"
              id="unsubscribeToggle"
              checked={unsubscribeEnabled}
              onChange={(e) => setUnsubscribeEnabled(e.target.checked)}
              className="mt-0.5 rounded border-slate-800 text-indigo-650 bg-slate-950 focus:ring-indigo-500 focus:ring-offset-0 w-4 h-4 cursor-pointer"
            />
            <div className="space-y-1">
              <label htmlFor="unsubscribeToggle" className="block text-xs font-semibold text-slate-200 cursor-pointer select-none">
                Include Unsubscribe link and RFC headers
              </label>
              <p className="text-[10px] text-slate-500 leading-normal font-serif">
                Appends a professional unsubscribe footer link and List-Unsubscribe email headers. Highly recommended to land in the Inbox (avoids Gmail/Yahoo spam flags).
              </p>
            </div>
          </div>
        </form>

        {/* Status Toast */}
        {statusMessage && (
          <div className={`p-4 rounded-lg border text-xs text-left ${
            statusMessage.success
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Live Merge Preview & Fallbacks (5 cols) */}
      <div className="lg:col-span-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-6">
        
        {/* Placeholder Fallbacks Card */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Placeholder Fallbacks</h2>
            <p className="text-[11px] text-slate-400">
              Provide default values when recipient spreadsheet cells are empty.
            </p>
          </div>

          <div className="bg-slate-950/30 border border-slate-800/40 rounded-xl p-4 space-y-4 max-h-[220px] overflow-y-auto">
            {campaign.headers.map((header) => (
              <div key={header} className="flex items-center gap-3 justify-between">
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[120px]">{header}</span>
                <input
                  type="text"
                  placeholder={`e.g. Valued Client`}
                  value={fallbacks[header] || ""}
                  onChange={(e) =>
                    setFallbacks((prev) => ({
                      ...prev,
                      [header]: e.target.value,
                    }))
                  }
                  className="bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded py-1 px-2.5 text-xs text-slate-200 placeholder-slate-600 w-full max-w-[180px] transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Live Merge Preview Selector */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Real-time Merge Preview</h2>
              <p className="text-[11px] text-slate-400">Stepping through rows to see the output.</p>
            </div>
            {recipients.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const idx = recipients.findIndex(r => r.id === selectedRecipientId);
                    if (idx > 0) {
                      setSelectedRecipientId(recipients[idx - 1].id);
                    }
                  }}
                  disabled={recipients.findIndex(r => r.id === selectedRecipientId) <= 0}
                  className="p-1.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 disabled:opacity-30 disabled:hover:bg-slate-950 text-slate-300 transition-all"
                  title="Previous Recipient"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <span className="text-[11px] font-mono text-indigo-300 bg-slate-950 border border-slate-850 px-2 py-1.5 rounded max-w-[200px] truncate select-none" title={recipients.find(r => r.id === selectedRecipientId)?.email}>
                  Row {recipients.findIndex(r => r.id === selectedRecipientId) + 1} of {recipients.length}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    const idx = recipients.findIndex(r => r.id === selectedRecipientId);
                    if (idx < recipients.length - 1) {
                      setSelectedRecipientId(recipients[idx + 1].id);
                    }
                  }}
                  disabled={recipients.findIndex(r => r.id === selectedRecipientId) >= recipients.length - 1}
                  className="p-1.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 disabled:opacity-30 disabled:hover:bg-slate-950 text-slate-300 transition-all"
                  title="Next Recipient"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Merge Output Box */}
          <div className="bg-slate-950 border border-slate-850/80 rounded-xl p-5 space-y-4 text-left font-sans">
            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                Merged Subject Line:
              </span>
              <p className="text-xs font-semibold text-slate-100 bg-slate-900/40 p-2.5 rounded border border-slate-900 font-mono">
                {mergedSubjectPreview || "(Empty Subject)"}
              </p>
            </div>

            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                Merged Email Body (HTML Render):
              </span>
              <div className="bg-slate-900/40 p-3 rounded border border-slate-900 min-h-[160px] max-h-[300px] overflow-y-auto">
                {mergedBodyPreview ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: mergedBodyPreview }}
                    className="prose prose-invert prose-xs text-xs text-slate-300 leading-relaxed font-sans max-w-none"
                  />
                ) : (
                  <p className="text-xs text-slate-600 italic font-mono">(Empty Body)</p>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
