"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import * as XLSX from "xlsx"
import { useSearchParams } from "next/navigation"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  createCampaignAction,
  importGoogleSheetAction,
  getCampaignsAction,
  getCampaignDetailsAction,
  getCampaignRecipientsAction,
  updateCampaignActiveHeadersAction,
  sendCampaignMailsAction,
  checkCampaignRepliesAction,
  deleteCampaignAction,
  cancelScheduledCampaignAction,
  createFollowupCampaignAction,
} from "./actions"
import {
  saveTemplateAction,
  deleteTemplateAction,
  getTemplatesAction,
} from "./[id]/templates/actions"

// TypeScript interfaces
interface CampaignItem {
  id: string
  name: string
  headers: string[]
  activeHeaders: string[] | null
  status: "draft" | "completed" | "scheduled"
  scheduledAt: Date | null
  parentCampaignId?: string | null
  createdAt: Date
  recipientCount: number
  opensCount?: number
  clicksCount?: number
  repliesCount?: number
  sentCount?: number
  failedCount?: number
}

interface RecipientRow {
  id: string
  email: string
  fields: Record<string, string>
  status: string
  opensCount?: number
  clicksCount?: number
}

interface TemplateProfile {
  id: string
  campaignId: string
  name: string
  subject: string
  body: string
  fallbacks: Record<string, string>
  unsubscribeEnabled?: boolean
  attachments?: Array<{ name: string; mimeType: string; size: number; content: string }>
}

function getSchedulePresets() {
  const now = new Date()

  // 1. Tomorrow morning: tomorrow at 8:00 AM
  const tomorrowMorning = new Date(now)
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1)
  tomorrowMorning.setHours(8, 0, 0, 0)

  // 2. Tomorrow afternoon: tomorrow at 1:00 PM (13:00)
  const tomorrowAfternoon = new Date(now)
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1)
  tomorrowAfternoon.setHours(13, 0, 0, 0)

  // 3. Monday morning: next Monday at 8:00 AM
  const mondayMorning = new Date(now)
  const currentDay = mondayMorning.getDay()
  let daysToAdd = (1 - currentDay + 7) % 7
  if (daysToAdd === 0) daysToAdd = 7
  mondayMorning.setDate(mondayMorning.getDate() + daysToAdd)
  mondayMorning.setHours(8, 0, 0, 0)

  // Format helper to YYYY-MM-DDTHH:mm
  const formatToLocalISO = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, "0")
    const yyyy = date.getFullYear()
    const MM = pad(date.getMonth() + 1)
    const dd = pad(date.getDate())
    const hh = pad(date.getHours())
    const mm = pad(date.getMinutes())
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
  }

  // Format helper to human readable label
  const formatHuman = (date: Date) => {
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  return [
    {
      id: "tomorrow-morning",
      label: "Tomorrow morning",
      dateString: formatHuman(tomorrowMorning),
      value: formatToLocalISO(tomorrowMorning),
    },
    {
      id: "tomorrow-afternoon",
      label: "Tomorrow afternoon",
      dateString: formatHuman(tomorrowAfternoon),
      value: formatToLocalISO(tomorrowAfternoon),
    },
    {
      id: "monday-morning",
      label: "Monday morning",
      dateString: formatHuman(mondayMorning),
      value: formatToLocalISO(mondayMorning),
    },
  ]
}

function CustomCalendarPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [currentView, setCurrentView] = useState<Date>(() => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date() : d
  })

  const selectedDate = useMemo(() => {
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date() : d
  }, [value])

  const [timeStr, setTimeStr] = useState(() => {
    const d = new Date(value)
    if (isNaN(d.getTime())) return "08:00"
    const pad = (num: number) => String(num).padStart(2, "0")
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  const year = currentView.getFullYear()
  const month = currentView.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayIndex = new Date(year, month, 1).getDay()

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const handlePrevMonth = () => {
    setCurrentView(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentView(new Date(year, month + 1, 1))
  }

  const handleSelectDay = (day: number) => {
    const newDate = new Date(year, month, day)
    const [hh, mm] = timeStr.split(":").map(Number)
    newDate.setHours(hh || 0, mm || 0, 0, 0)
    
    const pad = (num: number) => String(num).padStart(2, "0")
    const formatted = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`
    onChange(formatted)
  }

  const handleTimeChange = (newTime: string) => {
    setTimeStr(newTime)
    const [hh, mm] = newTime.split(":").map(Number)
    const newDate = new Date(selectedDate)
    newDate.setHours(hh || 0, mm || 0, 0, 0)
    
    const pad = (num: number) => String(num).padStart(2, "0")
    const formatted = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`
    onChange(formatted)
  }

  const days = []
  // Empty offset days
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(<div key={`empty-${i}`} className="w-8 h-8" />)
  }
  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    const isSelected = selectedDate.getDate() === d &&
                       selectedDate.getMonth() === month &&
                       selectedDate.getFullYear() === year
    const isToday = new Date().getDate() === d &&
                    new Date().getMonth() === month &&
                    new Date().getFullYear() === year

    days.push(
      <button
        type="button"
        key={`day-${d}`}
        onClick={() => handleSelectDay(d)}
        className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center transition-all ${
          isSelected
            ? "bg-indigo-600 text-white font-bold"
            : isToday
            ? "border border-indigo-500/50 text-indigo-400 hover:bg-slate-800"
            : "text-slate-350 hover:bg-slate-800 hover:text-white"
        }`}
      >
        {d}
      </button>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 max-w-[280px] mx-auto shadow-xl select-none">
      {/* Calendar Header */}
      <div className="flex justify-between items-center text-xs font-semibold text-slate-200">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
        >
          &lt;
        </button>
        <span>{monthNames[month]} {year}</span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
        >
          &gt;
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
        <span>Su</span>
        <span>Mo</span>
        <span>Tu</span>
        <span>We</span>
        <span>Th</span>
        <span>Fr</span>
        <span>Sa</span>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-1 justify-items-center">
        {days}
      </div>

      {/* Time Picker */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Time</span>
        <input
          type="time"
          value={timeStr}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="bg-slate-955 border border-slate-800 text-xs text-slate-200 py-1 px-2.5 rounded focus:outline-none focus:border-indigo-500 font-mono w-[100px] text-center"
        />
      </div>
    </div>
  )
}

export default function CampaignPage() {
  // --- Dashboard State ---
  const [campaignsList, setCampaignsList] = useState<CampaignItem[]>([])
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({})
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null) // null = show list
  const [step, setStep] = useState<number>(1) // 1 to 4

  const [selectedDashboardCampaignId, setSelectedDashboardCampaignId] = useState<string | null>(null)
  const [dashboardRecipients, setDashboardRecipients] = useState<RecipientRow[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  const searchParams = useSearchParams()
  const campaignIdParam = searchParams.get("id")

  // --- Step 1: Upload / Setup State ---
  const [campaignName, setCampaignName] = useState("")
  const [sheetUrl, setSheetUrl] = useState("")
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState("")
  const [activeTab, setActiveTab] = useState<"file" | "google" | "followup">("file")
  const [selectedParentCampaignId, setSelectedParentCampaignId] = useState<string>("")

  // --- Step 2: Placeholder Selection State ---
  const [activeHeaders, setActiveHeaders] = useState<string[]>([])

  // --- Step 3: Template Editor & Live Preview State ---
  const [savedTemplates, setSavedTemplates] = useState<TemplateProfile[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateProfileName, setTemplateProfileName] = useState("Default Template")
  const [subject, setSubject] = useState("Hello {First Name}!")
  const [bodyHtml, setBodyHtml] = useState("<p>Dear {First Name},</p><p>We are excited to work with you at {Company}!</p>")
  const [fallbacks, setFallbacks] = useState<Record<string, string>>({})
  const [unsubscribeEnabled, setUnsubscribeEnabled] = useState(false)
  const [attachmentsList, setAttachmentsList] = useState<Array<{ name: string; mimeType: string; size: number; content: string }>>([])
  const [recipientsList, setRecipientsList] = useState<RecipientRow[]>([])
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("")
  const [lastFocusedField, setLastFocusedField] = useState<"subject" | "body">("body")
  const subjectInputRef = useRef<HTMLInputElement>(null)

  // --- Step 4: Delivery Settings State ---
  const [deliveryMode, setDeliveryMode] = useState<"now" | "schedule">("now")
  const [scheduleTime, setScheduleTime] = useState("")
  const [selectedPreset, setSelectedPreset] = useState<string>("tomorrow-morning")

  // --- Global UI State ---
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; text: string } | null>(null)

  // TipTap Rich Editor Setup
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

  // Synchronize editor content when changing template profile
  useEffect(() => {
    if (editor && editor.getHTML() !== bodyHtml) {
      editor.commands.setContent(bodyHtml)
    }
  }, [bodyHtml, editor])

  // Fetch campaigns on load and when dashboard is shown
  useEffect(() => {
    if (activeCampaignId === null) {
      fetchCampaigns()
    }
  }, [activeCampaignId])

  const parentCampaignIdParam = searchParams.get("parentCampaignId")

  // Automatically load campaign if campaignId is present in URL query searchParams
  useEffect(() => {
    if (campaignIdParam) {
      handleOpenCampaignWizard(campaignIdParam)
    }
  }, [campaignIdParam, campaignsList.length])

  // Automatically load follow-up wizard if parentCampaignId is present in URL query searchParams
  useEffect(() => {
    if (parentCampaignIdParam && campaignsList.length > 0) {
      handleStartFollowup(parentCampaignIdParam)
    }
  }, [parentCampaignIdParam, campaignsList.length])

  // Poll campaigns list if any campaign is in scheduled status (sending/scheduled)
  useEffect(() => {
    const hasActive = campaignsList.some((c) => c.status === "scheduled")
    if (!hasActive || activeCampaignId !== null) return

    const interval = setInterval(async () => {
      try {
        const res = await getCampaignsAction()
        if (res.success && res.campaigns) {
          setCampaignsList(res.campaigns as CampaignItem[])
        }

        // If sidebar campaign inspector is open, update its recipient details live
        if (selectedDashboardCampaignId) {
          const recRes = await getCampaignRecipientsAction(selectedDashboardCampaignId)
          if (recRes.success && recRes.recipients) {
            setDashboardRecipients(recRes.recipients as RecipientRow[])
          }
        }
      } catch (err) {
        console.error("Failed to poll campaign list updates:", err)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [campaignsList, activeCampaignId, selectedDashboardCampaignId])

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const res = await getCampaignsAction()
      if (res.success && res.campaigns) {
        setCampaignsList(res.campaigns as CampaignItem[])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDashboardCampaign = async (campaignId: string) => {
    setSelectedDashboardCampaignId(campaignId)
    setLoadingRecipients(true)
    try {
      const res = await getCampaignRecipientsAction(campaignId)
      if (res.success && res.recipients) {
        setDashboardRecipients(res.recipients as RecipientRow[])
      } else {
        alert("Failed to load campaign recipients: " + res.error)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingRecipients(false)
    }
  }

  // Load Wizard state if opening an existing campaign
  const handleOpenCampaignWizard = async (campaignId: string) => {
    setLoading(true)
    setStatusMessage(null)
    try {
      // 1. Fetch details
      const detailRes = await getCampaignDetailsAction(campaignId)
      if (detailRes.success && detailRes.campaign) {
        const camp = detailRes.campaign
        setCampaignName(camp.name)
        setFileHeaders(camp.headers)
        setActiveHeaders(camp.activeHeaders || camp.headers)
        setActiveCampaignId(campaignId)
        
        // 2. Fetch recipients
        const recRes = await getCampaignRecipientsAction(campaignId)
        if (recRes.success && recRes.recipients) {
          setRecipientsList(recRes.recipients as RecipientRow[])
          if (recRes.recipients.length > 0) {
            setSelectedRecipientId(recRes.recipients[0].id)
          }
        }

        // 3. Fetch templates
        const tplRes = await getTemplatesAction(campaignId)
        if (tplRes.success && tplRes.templates) {
          setSavedTemplates(tplRes.templates as TemplateProfile[])
          // Search for a template specifically matching this campaign
          const campaignTemplate = (tplRes.templates as TemplateProfile[]).find(
            (t) => t.campaignId === campaignId || t.id === camp.templateId
          )
          if (campaignTemplate) {
            setSelectedTemplateId(campaignTemplate.id)
            setTemplateProfileName(campaignTemplate.name)
            setSubject(campaignTemplate.subject)
            setBodyHtml(campaignTemplate.body)
            setFallbacks(campaignTemplate.fallbacks || {})
            setUnsubscribeEnabled(campaignTemplate.unsubscribeEnabled || false)
            setAttachmentsList(campaignTemplate.attachments || [])
          } else {
            // Reset editor inputs to defaults (fresh template)
            setSelectedTemplateId(null)
            setTemplateProfileName("Default Template")
            setSubject("Hello {First Name}!")
            setBodyHtml("<p>Dear {First Name},</p><p>We are excited to work with you at {Company}!</p>")
            setFallbacks({})
            setUnsubscribeEnabled(false)
            setAttachmentsList([])
          }
        }
        
        // Move directly to Step 3 if template and recipients already loaded, otherwise Step 2
        setStep(3)
      } else {
        alert("Failed to load campaign: " + (detailRes.error || "Unknown error"))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 1. Handle File Upload (SheetJS)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    // Autofill campaign name with filename (without extension) if empty
    if (!campaignName.trim()) {
      const defaultName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name
      setCampaignName(defaultName)
    }

    setLoading(true)
    try {
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result
          if (!data) throw new Error("Could not read file data.")

          const workbook = XLSX.read(data, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]

          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][]
          if (jsonData.length === 0) {
            throw new Error("Spreadsheet is empty.")
          }

          const headers = jsonData[0].map((h) => String(h || "").trim()).filter((h) => h !== "")
          if (headers.length === 0) {
            throw new Error("No column headers detected in Row 1.")
          }

          const rows = jsonData.slice(1).map((row) => {
            const rowData: Record<string, string> = {}
            headers.forEach((header, index) => {
              rowData[header] = row[index] !== undefined ? String(row[index]).trim() : ""
            })
            return rowData
          })

          setFileHeaders(headers)
          setFileRows(rows)
        } catch (parseError: unknown) {
          const errMsg = parseError instanceof Error ? parseError.message : String(parseError)
          alert(`Spreadsheet parse error: ${errMsg}`)
          setFileName("")
        } finally {
          setLoading(false)
        }
      }
      reader.readAsArrayBuffer(file)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  // Submit Step 1 (Upload/Persist)
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campaignName.trim()) {
      alert("Please enter a campaign name.")
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      let res
      if (activeTab === "file") {
        if (fileRows.length === 0) {
          alert("Please upload a spreadsheet file.")
          setLoading(false)
          return
        }
        res = await createCampaignAction(campaignName, fileHeaders, fileRows)
      } else if (activeTab === "google") {
        if (!sheetUrl.trim()) {
          alert("Please enter a Google Sheets URL.")
          setLoading(false)
          return
        }
        res = await importGoogleSheetAction(campaignName, sheetUrl)
      } else {
        if (!selectedParentCampaignId) {
          alert("Please select a parent campaign to follow up.")
          setLoading(false)
          return
        }
        res = await createFollowupCampaignAction(campaignName, selectedParentCampaignId)
      }

      if (res.success && res.campaignId) {
        setActiveCampaignId(res.campaignId)
        setFileHeaders(res.headers || [])
        setActiveHeaders(res.headers || [])
        
        // Fetch recipients for the newly created campaign
        const recRes = await getCampaignRecipientsAction(res.campaignId)
        if (recRes.success && recRes.recipients) {
          setRecipientsList(recRes.recipients as RecipientRow[])
          if (recRes.recipients.length > 0) {
            setSelectedRecipientId(recRes.recipients[0].id)
          }
        }
        
        setStep(2) // Move to active placeholders selection
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to create campaign." })
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errMsg })
    } finally {
      setLoading(false)
    }
  }

  // Submit Step 2 (Active Placeholders)
  const handleStep2Submit = async () => {
    if (activeHeaders.length === 0) {
      alert("Please select at least one header to use as an active placeholder.")
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await updateCampaignActiveHeadersAction(activeCampaignId!, activeHeaders)
      if (res.success) {
        // Fetch templates list for the campaign
        const tplRes = await getTemplatesAction(activeCampaignId!)
        if (tplRes.success && tplRes.templates) {
          setSavedTemplates(tplRes.templates as TemplateProfile[])
        }
        setStep(3) // Move to Template composing
      } else {
        alert(res.error || "Failed to save active placeholders.")
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Step 3 Actions: Placeholders toolbar token insertion
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
        setTimeout(() => {
          input.focus()
          input.setSelectionRange(start + token.length, start + token.length)
        }, 10)
      }
    } else {
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

  // Step 3 Actions: Profile Management
  const handleLoadTemplateProfile = (id: string) => {
    if (id === "") {
      setSelectedTemplateId(null)
      setTemplateProfileName("New Template Profile")
      setSubject("Hello {First Name}!")
      setBodyHtml("<p>Dear {First Name},</p><p>We are excited to work with you at {Company}!</p>")
      setFallbacks({})
      setUnsubscribeEnabled(false)
      setAttachmentsList([])
      return
    }

    const tpl = savedTemplates.find((t) => t.id === id)
    if (tpl) {
      if (tpl.campaignId !== activeCampaignId) {
        setSelectedTemplateId(tpl.id)
        setTemplateProfileName(tpl.name + " (Copy)")
      } else {
        setSelectedTemplateId(tpl.id)
        setTemplateProfileName(tpl.name)
      }
      setSubject(tpl.subject)
      setBodyHtml(tpl.body)
      setFallbacks(tpl.fallbacks || {})
      setUnsubscribeEnabled(tpl.unsubscribeEnabled || false)
      setAttachmentsList(tpl.attachments || [])
    }
  }

  const handleSaveTemplateProfile = async () => {
    if (!templateProfileName.trim()) {
      alert("Please name your template profile.")
      return
    }
    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await saveTemplateAction(
        selectedTemplateId,
        activeCampaignId!,
        templateProfileName,
        subject,
        bodyHtml,
        fallbacks,
        unsubscribeEnabled,
        attachmentsList
      )

      if (res.success) {
        setStatusMessage({ success: true, text: `Template "${templateProfileName}" saved successfully!` })
        const listRes = await getTemplatesAction(activeCampaignId!)
        if (listRes.success && listRes.templates) {
          setSavedTemplates(listRes.templates as TemplateProfile[])
        }
        if (res.templateId) {
          setSelectedTemplateId(res.templateId)
        }
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to save template." })
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errMsg })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTemplateProfile = async () => {
    if (!selectedTemplateId) return
    if (!confirm("Delete this template profile?")) return

    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await deleteTemplateAction(selectedTemplateId)
      if (res.success) {
        setStatusMessage({ success: true, text: "Template profile deleted." })
        const listRes = await getTemplatesAction(activeCampaignId!)
        if (listRes.success && listRes.templates) {
          setSavedTemplates(listRes.templates as TemplateProfile[])
        }
        handleLoadTemplateProfile("")
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to delete template." })
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errMsg })
    } finally {
      setLoading(false)
    }
  }

  // Submit Step 3 (Template Saved -> Move to Step 4)
  const handleStep3Submit = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      alert("Subject line and email body cannot be empty.")
      return
    }
    setLoading(true)
    try {
      // Auto-save the template first
      const res = await saveTemplateAction(
        selectedTemplateId,
        activeCampaignId!,
        templateProfileName,
        subject,
        bodyHtml,
        fallbacks,
        unsubscribeEnabled,
        attachmentsList
      )
      if (res.success) {
        if (res.templateId) {
          setSelectedTemplateId(res.templateId)
        }
        setStep(4) // Move to Delivery Options
      } else {
        alert("Failed to save template configuration: " + res.error)
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Submit Step 4 (Send / Schedule)
  const handleStep4Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deliveryMode === "schedule" && !scheduleTime) {
      alert("Please select a date and time to schedule sending.")
      return
    }

    setLoading(true)
    setStatusMessage(null)

    try {
      const res = await sendCampaignMailsAction(
        activeCampaignId!,
        selectedTemplateId!,
        deliveryMode === "schedule" ? scheduleTime : undefined
      )

      if (res.success) {
        setStatusMessage({ success: true, text: res.message || "Action processed successfully!" })
        setTimeout(() => {
          setActiveCampaignId(null) // Return to Dashboard
        }, 3000)
      } else {
        setStatusMessage({ success: false, text: res.error || "Failed to process campaign delivery." })
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errMsg })
    } finally {
      setLoading(false)
    }
  }

  // Live Token Replace preview calculations
  const mergePreviewText = (textToMerge: string) => {
    if (!textToMerge) return ""
    const activeRec = recipientsList.find((r) => r.id === selectedRecipientId)
    if (!activeRec) return textToMerge

    let merged = textToMerge
    fileHeaders.forEach((header) => {
      const escapedHeader = header.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s*")
      const regex = new RegExp(`\\{\\s*${escapedHeader}\\s*\\}`, "gi")
      const cellValue = activeRec.fields[header]
      const fallbackValue = fallbacks[header] || ""
      const replacementValue =
        cellValue !== undefined && cellValue !== null && cellValue.trim() !== "" ? cellValue : fallbackValue

      merged = merged.replace(regex, replacementValue)
    })
    merged = merged.replace(/\{\s*\}/g, "")
    // Ensure empty paragraphs or paragraphs with only trailing breaks do not collapse in preview & email clients
    merged = merged.replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "<p>&nbsp;</p>")
    return merged
  }

  const mergedSubjectPreview = mergePreviewText(subject)
  const mergedBodyPreview = mergePreviewText(bodyHtml)

  const handleSyncReplies = async () => {
    if (!activeCampaignId) return
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await checkCampaignRepliesAction(activeCampaignId)
      if (res.success) {
        setStatusMessage({
          success: true,
          text: res.message || "Successfully checked for replies!",
        })
        const recRes = await getCampaignRecipientsAction(activeCampaignId)
        if (recRes.success && recRes.recipients) {
          setRecipientsList(recRes.recipients as RecipientRow[])
        }
        fetchCampaigns()
      } else {
        setStatusMessage({
          success: false,
          text: res.error || "Failed to check for replies.",
        })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to permanently delete this draft campaign? This will clean up all imported recipients and templates.")) {
      return
    }

    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await deleteCampaignAction(campaignId)
      if (res.success) {
        setStatusMessage({
          success: true,
          text: "Campaign deleted successfully!",
        })
        fetchCampaigns()
      } else {
        setStatusMessage({
          success: false,
          text: res.error || "Failed to delete campaign.",
        })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelScheduledCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to cancel the schedule for this campaign? The campaign and recipients will return to draft/pending status.")) {
      return
    }

    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await cancelScheduledCampaignAction(campaignId)
      if (res.success) {
        setStatusMessage({
          success: true,
          text: "Campaign schedule canceled successfully!",
        })
        fetchCampaigns()
      } else {
        setStatusMessage({
          success: false,
          text: res.error || "Failed to cancel campaign schedule.",
        })
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setStatusMessage({ success: false, text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  const handleDashboardSyncReplies = async (campaignId: string) => {
    setSyncingMap((prev) => ({ ...prev, [campaignId]: true }))
    try {
      const res = await checkCampaignRepliesAction(campaignId)
      if (res.success) {
        // Refresh campaigns
        const listRes = await getCampaignsAction()
        if (listRes.success && listRes.campaigns) {
          setCampaignsList(listRes.campaigns as CampaignItem[])
        }
        alert(res.message || "Replies synchronized successfully.")
      } else {
        alert("Failed to sync replies: " + res.error)
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncingMap((prev) => ({ ...prev, [campaignId]: false }))
    }
  }

  // Reset helper to close Wizard and return to Dashboard
  const handleCloseWizard = () => {
    setActiveCampaignId(null)
    setStep(1)
    setCampaignName("")
    setSheetUrl("")
    setFileName("")
    setFileHeaders([])
    setFileRows([])
    setActiveHeaders([])
    setRecipientsList([])
    setSelectedRecipientId("")
    setSavedTemplates([])
    setSelectedTemplateId(null)
    setStatusMessage(null)
  }

  function handleStartFollowup(parentCampaignId: string) {
    handleCloseWizard()
    setActiveCampaignId("new")
    setStep(1)
    setActiveTab("followup")
    setSelectedParentCampaignId(parentCampaignId)
    
    const parent = campaignsList.find(c => c.id === parentCampaignId)
    if (parent) {
      setCampaignName(`Follow-up to ${parent.name}`)
    } else {
      setCampaignName("Follow-up Campaign")
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start relative overflow-hidden font-sans p-6 pt-10">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* --- DASHBOARD VIEW --- */}
      {activeCampaignId === null ? (
        <div className="relative z-10 w-full max-w-5xl space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6">
            <div>
              <h1 className="text-3xl font-serif font-extrabold tracking-tight text-slate-100">
                Outreach Campaigns
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Manage your Gmail Outreacher campaigns, check statuses, or launch a new campaign flow.
              </p>
            </div>
            <button
              onClick={() => {
                handleCloseWizard()
                setActiveCampaignId("new")
                setStep(1)
              }}
              className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-950/20 active:scale-[0.98]"
            >
              + Create New Campaign
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* List Table */}
            <div className="lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-200 mb-4">Saved Campaigns</h2>
              
              {loading && campaignsList.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">Loading database rows...</div>
              ) : campaignsList.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-850 rounded-xl">
                  <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-slate-400 text-sm font-medium">No campaigns found in SQLite database.</p>
                  <p className="text-slate-500 text-xs mt-1">Upload a spreadsheet using the button above to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800/60 rounded-xl bg-slate-950/20">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-850 text-slate-400 font-semibold">
                        <th className="p-3">Campaign Name</th>
                        <th className="p-3">Recipients</th>
                        <th className="p-3">Stats (O/C/R)</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Created</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {campaignsList.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-900/40 text-slate-300">
                          <td 
                            className="p-3 font-semibold text-slate-200 cursor-pointer hover:text-indigo-400 transition-colors"
                            onClick={() => handleSelectDashboardCampaign(c.id)}
                          >
                            {c.name}
                          </td>
                          <td className="p-3 font-mono text-[11px]">{c.recipientCount} rows</td>
                          <td className="p-3 font-mono text-[11px] text-slate-350">
                            <div className="flex items-center gap-1.5">
                              <div>
                                <span className="text-emerald-400" title="Unique Opens">{c.opensCount || 0} O</span>
                                <span className="text-slate-500 mx-1">/</span>
                                <span className="text-indigo-400" title="Unique Clicks">{c.clicksCount || 0} C</span>
                                <span className="text-slate-500 mx-1">/</span>
                                <span className="text-pink-400" title="Replies">{c.repliesCount || 0} R</span>
                              </div>
                              {c.status === "completed" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDashboardSyncReplies(c.id)
                                  }}
                                  disabled={syncingMap[c.id]}
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
                                  title="Sync Replies from Gmail"
                                >
                                  <svg className={`w-3.5 h-3.5 ${syncingMap[c.id] ? "animate-spin text-indigo-400" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1.5 max-w-[140px]">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border uppercase ${
                                c.status === "completed"
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : c.status === "scheduled"
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                  : "bg-slate-800 border-slate-700 text-slate-400"
                              }`}>
                                {c.status}
                                {c.status === "scheduled" && c.scheduledAt && (
                                  <span className="lowercase text-[9px] text-amber-500 ml-1">
                                    ({new Date(c.scheduledAt).toLocaleDateString()})
                                  </span>
                                )}
                              </span>

                              {/* Progress bar for scheduled or completed campaigns */}
                              {c.status !== "draft" && (
                                <div className="space-y-0.5">
                                  <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                                    <span>Sent {c.sentCount || 0}/{c.recipientCount}</span>
                                    {c.failedCount ? (
                                      <span className="text-rose-450 font-bold" title={`${c.failedCount} failures`}>
                                        {c.failedCount} F
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all duration-500 rounded-full ${
                                        c.status === "completed" ? "bg-emerald-500" : "bg-indigo-500 animate-pulse"
                                      }`}
                                      style={{ width: `${Math.min(100, Math.round(((c.sentCount || 0) + (c.failedCount || 0)) / (c.recipientCount || 1) * 100))}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-500 font-mono text-[10px]">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-right flex items-center justify-end gap-2">
                            {c.status === "draft" && (
                              <button
                                onClick={() => handleDeleteCampaign(c.id)}
                                disabled={loading}
                                className="py-1 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 hover:border-rose-550 text-rose-450 hover:text-white transition-all text-xs font-semibold"
                              >
                                Delete
                              </button>
                            )}
                            {c.status === "scheduled" && (
                              <button
                                onClick={() => handleCancelScheduledCampaign(c.id)}
                                disabled={loading}
                                className="py-1 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-600 border border-amber-500/30 hover:border-amber-550 text-amber-450 hover:text-white transition-all text-xs font-semibold"
                              >
                                Cancel Schedule
                              </button>
                            )}
                            {c.status === "completed" && (
                              <button
                                onClick={() => handleStartFollowup(c.id)}
                                className="py-1 px-2.5 rounded-lg bg-pink-950 hover:bg-pink-900 border border-pink-500/30 hover:border-pink-400 text-pink-300 hover:text-pink-200 transition-all font-semibold text-xs active:scale-95"
                              >
                                Create Follow-up
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenCampaignWizard(c.id)}
                              className="py-1 px-3 rounded-lg bg-indigo-955 border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 hover:text-indigo-200 transition-all font-semibold"
                            >
                              Setup Wizard
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick help info card or Sidebar Recipient Inspector */}
            <div className="lg:col-span-4 space-y-6">
              {selectedDashboardCampaignId ? (
                <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200 truncate max-w-[200px]" title={campaignsList.find(c => c.id === selectedDashboardCampaignId)?.name || "Recipients"}>
                        {campaignsList.find(c => c.id === selectedDashboardCampaignId)?.name || "Recipients"}
                      </h3>
                      <p className="text-[10px] text-slate-400">Recipient-level delivery & read details</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedDashboardCampaignId(null)
                        setDashboardRecipients([])
                      }}
                      className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-bold text-sm"
                    >
                      ×
                    </button>
                  </div>

                  {!loadingRecipients && dashboardRecipients.length > 0 && (() => {
                    const unrepliedCount = dashboardRecipients.filter(r => r.status !== "replied" && r.status !== "unsubscribed" && r.status !== "pending").length;
                    const camp = campaignsList.find(c => c.id === selectedDashboardCampaignId);
                    if (unrepliedCount > 0 && camp && camp.status !== "draft") {
                      return (
                        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-3.5 space-y-2.5 animate-slide-down">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">Unreplied contacts:</span>
                            <span className="font-mono text-indigo-400 font-bold">{unrepliedCount}</span>
                          </div>
                          <button
                            onClick={() => handleStartFollowup(selectedDashboardCampaignId)}
                            className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Follow Up with Unreplied
                          </button>
                        </div>
                      )
                    }
                    return null;
                  })()}

                  {loadingRecipients ? (
                    <div className="py-12 text-center text-slate-500 text-xs">Loading recipients...</div>
                  ) : dashboardRecipients.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">No recipients found.</div>
                  ) : (
                    <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                      {dashboardRecipients.map((r) => (
                        <div key={r.id} className="bg-slate-955/60 border border-slate-850 p-2.5 rounded-xl space-y-1.5 hover:border-slate-800 transition-all">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[11px] text-slate-300 truncate font-mono select-all font-semibold" title={r.email}>
                              {r.email}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${
                              r.status === "replied"
                                ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                                : r.status === "sent"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : r.status.startsWith("failed")
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                : "bg-slate-850 border-slate-800 text-slate-450"
                            }`}>
                              {r.status.startsWith("failed") ? "failed" : r.status}
                            </span>
                          </div>

                          {/* Stats / Checkmarks */}
                          {(r.status === "sent" || r.status === "replied") && (
                            <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-900/60 pt-1.5">
                              <div className="flex items-center gap-1">
                                {r.opensCount && r.opensCount > 0 ? (
                                  <span className="text-emerald-400 flex items-center gap-0.5 font-semibold">
                                    <span className="font-sans text-xs">✓✓</span>
                                    <span>{r.opensCount} opens</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 flex items-center gap-0.5">
                                    <span className="font-sans text-xs">✓</span>
                                    <span>delivered</span>
                                  </span>
                                )}
                              </div>

                              {r.clicksCount && r.clicksCount > 0 ? (
                                <span className="text-indigo-400 font-semibold">
                                  {r.clicksCount} clicks
                                </span>
                              ) : (
                                <span className="text-slate-650">0 clicks</span>
                              )}
                            </div>
                          )}

                          {r.status.startsWith("failed") && (
                            <p className="text-[9px] text-rose-455 leading-normal font-mono break-all bg-rose-950/10 p-1.5 rounded border border-rose-955/20">
                              {r.status}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Quick help info card */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">How Outreacher Works</h3>
                <ul className="text-xs text-slate-400 space-y-3 pl-4 list-decimal">
                  <li>Create a campaign and import your recipient spreadsheet details.</li>
                  <li>Choose active placeholder columns that represent variable tokens (e.g. {"{First Name}"}, {"{Company}"}).</li>
                  <li>Use the TipTap rich editor to write templates, inserting placeholders dynamically.</li>
                  <li>Preview the results in real-time, stepping through rows with fallback defaults.</li>
                  <li>Click send or schedule a timed delivery using the Google Gmail API!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* --- STEP-BY-STEP WIZARD VIEW --- */
        <div className="relative z-10 w-full max-w-6xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl flex flex-col gap-6">
          
          {/* Wizard Navigation Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">
                Outreach Setup Wizard
              </span>
              <h1 className="text-xl font-extrabold text-slate-100 mt-0.5">
                {activeCampaignId === "new" ? "New Outreach Campaign" : campaignName}
              </h1>
            </div>
            <button
              onClick={handleCloseWizard}
              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Exit to Dashboard
            </button>
          </div>

          {/* Stepper progress circles */}
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2 max-w-lg w-full justify-between">
              {[
                { s: 1, label: "Upload" },
                { s: 2, label: "Placeholders" },
                { s: 3, label: "Templates" },
                { s: 4, label: "Delivery" },
              ].map((stepItem, idx) => (
                <div key={idx} className="flex items-center flex-1 last:flex-initial">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                      step === stepItem.s
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : step > stepItem.s
                        ? "bg-slate-800 border-indigo-900/80 text-indigo-400"
                        : "bg-slate-950 border-slate-800 text-slate-600"
                    }`}>
                      {stepItem.s}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider hidden sm:inline ${
                      step === stepItem.s ? "text-slate-100" : "text-slate-500"
                    }`}>
                      {stepItem.label}
                    </span>
                  </div>
                  {idx < 3 && <div className="h-px bg-slate-800 flex-1 mx-3 min-w-[20px]" />}
                </div>
              ))}
            </div>
          </div>

          {/* --- STEP 1 WORKSPACE: UPLOAD DATA --- */}
          {step === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto w-full animate-slide-up">
              <div className="flex border-b border-slate-850">
                <button
                  type="button"
                  onClick={() => { setActiveTab("file"); setStatusMessage(null); }}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all ${
                    activeTab === "file"
                      ? "border-indigo-500 text-indigo-400 bg-indigo-950/10"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Upload Local File (.xlsx, .csv)
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("google"); setStatusMessage(null); }}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all ${
                    activeTab === "google"
                      ? "border-indigo-500 text-indigo-400 bg-indigo-950/10"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Google Sheets Link URL
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("followup"); setStatusMessage(null); }}
                  className={`py-2 px-4 text-xs font-semibold border-b-2 transition-all ${
                    activeTab === "followup"
                      ? "border-indigo-500 text-indigo-400 bg-indigo-950/10"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Follow-up Campaign Setup
                </button>
              </div>

              <form onSubmit={handleStep1Submit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sales Outreach - Product Launch"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-200 transition-colors"
                  />
                </div>

                 {activeTab === "file" ? (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Select Spreadsheet
                    </label>
                    <div className="relative group border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-200 cursor-pointer">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <svg className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition-colors mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-xs text-slate-300 font-semibold group-hover:text-indigo-300 transition-colors">
                        {fileName ? fileName : "Drag and drop or click to upload file"}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">Excel (.xlsx) or CSV format</p>
                    </div>
                  </div>
                ) : activeTab === "google" ? (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Google Sheets Sharing URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-200 transition-colors"
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      Ensure you authorize Gmail & Google Sheets scopes when signing in to retrieve private sheets.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Select Campaign to Follow Up On
                    </label>
                    <select
                      value={selectedParentCampaignId}
                      onChange={(e) => setSelectedParentCampaignId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:outline-none rounded-lg py-2.5 px-3 text-xs text-slate-200 transition-colors cursor-pointer"
                    >
                      <option value="">-- Choose a Campaign --</option>
                      {campaignsList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.status.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      This will automatically select all recipients who did not reply and did not unsubscribe from the selected campaign.
                    </p>
                  </div>
                )}

                {/* Local Preview table prior to saving */}
                {fileHeaders.length > 0 && activeTab === "file" && (
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Detected Columns: {fileHeaders.join(", ")}
                    </h3>
                    <div className="overflow-x-auto border border-slate-850 rounded-lg">
                      <table className="w-full text-[10px] font-mono text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 font-semibold">
                            {fileHeaders.slice(0, 4).map((h, i) => (
                              <th key={i} className="p-2 border-r border-slate-850/50">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {fileRows.slice(0, 3).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/20 text-slate-300">
                              {fileHeaders.slice(0, 4).map((h, ci) => (
                                <td key={ci} className="p-2 border-r border-slate-850/50 truncate max-w-[150px]">{row[h]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || (!fileName && activeTab === "file") || (!sheetUrl && activeTab === "google") || (!selectedParentCampaignId && activeTab === "followup")}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-indigo-950/20 active:scale-[0.98]"
                >
                  {loading ? "Processing and saving database records..." : "Next: Select Placeholders"}
                </button>
              </form>
            </div>
          )}

          {/* --- STEP 2 WORKSPACE: PLACEHOLDER SELECTION --- */}
          {step === 2 && (
            <div className="space-y-6 max-w-2xl mx-auto w-full animate-slide-up">
              <div className="bg-slate-950/30 border border-slate-800/40 rounded-xl p-5 text-center">
                <h2 className="text-base font-bold text-slate-200 mb-1">Select Merge Placeholders</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  We found the following columns in your spreadsheet. Toggle which columns to keep as active placeholders for merge tags. Dropped columns will be skipped.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setActiveHeaders(fileHeaders)}
                  className="px-3 py-1 rounded bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 font-semibold transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHeaders([])}
                  className="px-3 py-1 rounded bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 font-semibold transition-colors"
                >
                  Deselect All
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/20 border border-slate-850 rounded-xl p-6">
                {fileHeaders.map((header) => {
                  const isChecked = activeHeaders.includes(header)
                  return (
                    <label
                      key={header}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all ${
                        isChecked
                          ? "bg-indigo-950/30 border-indigo-500/50 text-indigo-200"
                          : "bg-slate-900/30 border-slate-850 text-slate-400 hover:border-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setActiveHeaders(activeHeaders.filter((h) => h !== header))
                          } else {
                            setActiveHeaders([...activeHeaders, header])
                          }
                        }}
                        className="rounded border-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                      />
                      <span className="text-xs font-mono truncate">{header}</span>
                    </label>
                  )
                })}
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold border border-slate-750 transition-colors"
                >
                  Back to Setup
                </button>
                <button
                  type="button"
                  onClick={handleStep2Submit}
                  disabled={activeHeaders.length === 0}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-md active:scale-[0.98]"
                >
                  Next: Compose Template
                </button>
              </div>
            </div>
          )}

          {/* --- STEP 3 WORKSPACE: TEMPLATE COMPOSE & LIVE PREVIEW --- */}
          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-slide-up">
              
              {/* LEFT PANEL: Editor & Profile Configurations (7 cols) */}
              <div className="lg:col-span-7 bg-slate-950/20 border border-slate-850 rounded-2xl p-6 space-y-6">
                
                {/* Active Campaign Selector */}
                <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">
                      Selected Campaign
                    </span>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5">
                      <h3 className="text-sm font-extrabold text-slate-200">
                        {campaignName}
                      </h3>
                      {activeCampaignId && (
                        <button
                          type="button"
                          onClick={handleSyncReplies}
                          disabled={loading}
                          className="py-1 px-2.5 rounded bg-indigo-600/20 hover:bg-indigo-650 border border-indigo-500/30 hover:border-indigo-450 text-indigo-300 hover:text-indigo-200 transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                          </svg>
                          {loading ? "Syncing..." : "Sync Replies"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full sm:w-[220px]">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Switch Campaign
                    </label>
                    <select
                      value={activeCampaignId || ""}
                      onChange={(e) => handleOpenCampaignWizard(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-slate-200 font-semibold text-indigo-300"
                    >
                      {campaignsList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.recipientCount} rows)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Profile Picker Dashboard */}
                <div className="flex flex-col sm:flex-row gap-3 items-end bg-slate-950/30 border border-slate-850/50 rounded-xl p-4">
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Saved Template Profiles
                    </label>
                    <select
                      value={selectedTemplateId || ""}
                      onChange={(e) => handleLoadTemplateProfile(e.target.value)}
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
                      onClick={handleDeleteTemplateProfile}
                      disabled={loading}
                      className="w-full sm:w-auto py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 text-xs font-semibold transition-all duration-200"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Form Editor */}
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Profile Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Cold Pitch - Standard"
                        value={templateProfileName}
                        onChange={(e) => setTemplateProfileName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:outline-none rounded-lg py-2 px-3 text-xs text-slate-200 placeholder-slate-500 transition-colors"
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={handleSaveTemplateProfile}
                        disabled={loading}
                        className="w-full sm:w-auto py-2 px-4 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-750 text-xs font-semibold transition-all duration-200 shadow-md"
                      >
                        {selectedTemplateId ? "Save Profile Changes" : "Save as New Profile"}
                      </button>
                    </div>
                  </div>

                  {/* Placeholders Toolbar (Only chosen active placeholders!) */}
                  <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-4">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Active Placeholders (Click to insert)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {activeHeaders.map((header) => (
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
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:outline-none rounded-lg py-2.5 px-4 text-xs text-slate-200 placeholder-slate-500 transition-colors font-sans"
                    />
                  </div>

                  {/* TipTap Rich Body Editor */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Email Body (Rich HTML Layout)
                    </label>
                    <div className="flex flex-col rounded-lg overflow-hidden border border-slate-850">
                      {/* Custom Editor Toolbar */}
                      <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-850 flex flex-wrap gap-1 items-center">
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
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold border border-slate-750 transition-colors"
                  >
                    Back to Placeholders
                  </button>
                  <button
                    type="button"
                    onClick={handleStep3Submit}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md active:scale-[0.98]"
                  >
                    Next: Delivery Options
                  </button>
                </div>
              </div>

              {/* RIGHT PANEL: Live Merge Preview & Fallbacks (5 cols) */}
              <div className="lg:col-span-5 bg-slate-950/20 border border-slate-850 rounded-2xl p-6 space-y-6">
                
                {/* Fallbacks Panel */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Placeholder Fallbacks</h2>
                    <p className="text-[11px] text-slate-400">
                      Provide default values when recipient spreadsheet cells are empty.
                    </p>
                  </div>

                  <div className="bg-slate-950/30 border border-slate-850/40 rounded-xl p-4 space-y-4 max-h-[220px] overflow-y-auto">
                    {activeHeaders.map((header) => (
                      <div key={header} className="flex items-center gap-3 justify-between">
                        <span className="text-[11px] font-mono text-slate-400 truncate max-w-[120px]">{header}</span>
                        <input
                          type="text"
                          placeholder={`e.g. Friend`}
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
                      <h2 className="text-sm font-semibold text-slate-200">Live Merge Preview</h2>
                      <p className="text-[11px] text-slate-400">Preview merged email text using real database rows.</p>
                    </div>
                    {recipientsList.length > 0 && (
                      <div className="flex items-center gap-2">
                        {/* Recipient status indicator */}
                        {(() => {
                          const activeRec = recipientsList.find(r => r.id === selectedRecipientId)
                          if (!activeRec) return null
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                                activeRec.status === "replied"
                                  ? "bg-pink-500/10 border-pink-500/30 text-pink-400"
                                  : activeRec.status === "sent"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : activeRec.status.startsWith("failed")
                                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                  : "bg-slate-850 border-slate-800 text-slate-400"
                              }`}>
                                {activeRec.status}
                              </span>

                              {/* Ticks and open/click counts */}
                              {(activeRec.status === "sent" || activeRec.status === "replied") && (
                                <div className="flex items-center gap-1 bg-slate-950 border border-slate-850 rounded px-2 py-0.5 text-[9px] font-mono font-medium select-none">
                                  {activeRec.opensCount && activeRec.opensCount > 0 ? (
                                    <span className="text-emerald-400 flex items-center gap-0.5" title={`Opened ${activeRec.opensCount} times`}>
                                      <span className="font-sans text-xs font-semibold">✓✓</span>
                                      <span>{activeRec.opensCount} opens</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 flex items-center gap-0.5" title="Sent, not opened yet">
                                      <span className="font-sans text-xs">✓</span>
                                      <span>delivered</span>
                                    </span>
                                  )}

                                  {activeRec.clicksCount && activeRec.clicksCount > 0 ? (
                                    <>
                                      <span className="text-slate-700 mx-0.5">|</span>
                                      <span className="text-indigo-400" title={`Clicked links ${activeRec.clicksCount} times`}>
                                        {activeRec.clicksCount} clicks
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        <button
                          type="button"
                          onClick={() => {
                            const idx = recipientsList.findIndex(r => r.id === selectedRecipientId);
                            if (idx > 0) {
                              setSelectedRecipientId(recipientsList[idx - 1].id);
                            }
                          }}
                          disabled={recipientsList.findIndex(r => r.id === selectedRecipientId) <= 0}
                          className="p-1.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-800 disabled:opacity-30 disabled:hover:bg-slate-950 text-slate-300 transition-all"
                          title="Previous Recipient"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        
                        <span className="text-[10px] md:text-xs font-mono text-indigo-300 bg-slate-950 border border-slate-850 px-2 py-1.5 rounded max-w-[200px] truncate select-none" title={recipientsList.find(r => r.id === selectedRecipientId)?.email}>
                          Row {recipientsList.findIndex(r => r.id === selectedRecipientId) + 1} of {recipientsList.length}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            const idx = recipientsList.findIndex(r => r.id === selectedRecipientId);
                            if (idx < recipientsList.length - 1) {
                              setSelectedRecipientId(recipientsList[idx + 1].id);
                            }
                          }}
                          disabled={recipientsList.findIndex(r => r.id === selectedRecipientId) >= recipientsList.length - 1}
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
                  {/* Tracking unreliability note */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-3 text-[10px] text-slate-500 leading-normal">
                    <strong className="text-slate-400">Note on Open Tracking:</strong> Pixel-based open tracking is approximate and subject to inflation (e.g. Apple Mail Privacy Protection pre-fetching) or suppression (e.g. Gmail image proxies or users blocking remote images).
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* --- STEP 4 WORKSPACE: DELIVERY OPTIONS & SCHEDULING --- */}
          {step === 4 && (
            <div className="space-y-6 max-w-xl mx-auto w-full animate-slide-up">
              <div className="bg-slate-950/30 border border-slate-800/40 rounded-xl p-5 text-center">
                <h2 className="text-base font-bold text-slate-200 mb-1">Confirm Delivery Settings</h2>
                <p className="text-xs text-slate-400">
                  Your Outreacher campaign is configured and ready. Choose how you want these emails delivered.
                </p>
              </div>

              {/* Summary panel */}
              <div className="bg-slate-950/20 border border-slate-850 rounded-xl p-4 space-y-2 text-xs font-medium">
                <div className="flex justify-between border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400">Campaign Name:</span>
                  <span className="text-slate-200">{campaignName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400">Selected Template:</span>
                  <span className="text-indigo-400">{templateProfileName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/50 pb-2">
                  <span className="text-slate-400">Subject:</span>
                  <span className="text-slate-300 font-mono text-[10px] truncate max-w-[250px]">{subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient Count:</span>
                  <span className="text-slate-200 font-mono">{recipientsList.length} recipients</span>
                </div>
              </div>

              {/* Delivery Tabs */}
              <div className="flex border-b border-slate-850">
                <button
                  type="button"
                  onClick={() => setDeliveryMode("now")}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${
                    deliveryMode === "now"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Send Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMode("schedule")
                    if (!scheduleTime) {
                      const presetsList = getSchedulePresets()
                      const defaultPreset = presetsList[0]
                      setSelectedPreset(defaultPreset.id)
                      setScheduleTime(defaultPreset.value)
                    }
                  }}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-all ${
                    deliveryMode === "schedule"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Schedule Send
                </button>
              </div>

              <form onSubmit={handleStep4Submit} className="space-y-6">
                {deliveryMode === "now" ? (
                  <p className="text-xs text-slate-400 text-center leading-relaxed">
                    This will immediately send merged emails to all <strong>{recipientsList.length}</strong> recipients from your Gmail account. Click the button below to execute.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Select Schedule Preset
                    </label>
                    <div className="grid grid-cols-1 gap-2.5">
                      {getSchedulePresets().map((preset) => {
                        const isSelected = selectedPreset === preset.id
                        return (
                          <button
                            type="button"
                            key={preset.id}
                            onClick={() => {
                              setSelectedPreset(preset.id)
                              setScheduleTime(preset.value)
                            }}
                            className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-200 ${
                              isSelected
                                ? "bg-indigo-950/30 border-indigo-500/60 text-slate-100 shadow-md shadow-indigo-950/25 font-semibold"
                                : "bg-slate-900/40 border-slate-850 hover:border-slate-800 text-slate-350 hover:text-slate-200"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected ? "border-indigo-500 text-indigo-400" : "border-slate-700"
                              }`}>
                                {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                              </span>
                              <span className="text-xs">{preset.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">{preset.dateString}</span>
                          </button>
                        )
                      })}
                      
                      {/* Custom option */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPreset("custom")
                          const presetsList = getSchedulePresets()
                          const isPreset = presetsList.some(p => p.value === scheduleTime)
                          if (isPreset || !scheduleTime) {
                            const now = new Date()
                            now.setMinutes(now.getMinutes() + 30) // default 30 mins from now
                            const pad = (num: number) => String(num).padStart(2, "0")
                            const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
                            setScheduleTime(formatted)
                          }
                        }}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 ${
                          selectedPreset === "custom"
                            ? "bg-indigo-950/30 border-indigo-500/60 text-slate-100 shadow-md shadow-indigo-950/25 font-semibold"
                            : "bg-slate-900/40 border-slate-850 hover:border-slate-800 text-slate-350 hover:text-slate-200"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selectedPreset === "custom" ? "border-indigo-500 text-indigo-400" : "border-slate-700"
                        }`}>
                          {selectedPreset === "custom" && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                        </span>
                        <span className="text-xs">Pick date & time</span>
                      </button>
                    </div>

                    {/* Custom DateTime Input (shown only when selectedPreset is 'custom') */}
                    {selectedPreset === "custom" && (
                      <div className="pt-1.5 space-y-1.5 transition-all duration-300">
                        <label className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider text-center">
                          Custom Date & Time
                        </label>
                        <CustomCalendarPicker
                          value={scheduleTime}
                          onChange={setScheduleTime}
                        />
                      </div>
                    )}

                    {scheduleTime && (
                      <div className="p-3 bg-slate-950/35 border border-slate-900 rounded-xl text-center text-xs text-indigo-300 font-medium">
                        Scheduled for: <span className="font-mono text-slate-300 ml-1">{
                          (() => {
                            try {
                              const d = new Date(scheduleTime);
                              if (isNaN(d.getTime())) return "(Invalid date)";
                              return d.toLocaleString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              });
                            } catch {
                              return scheduleTime;
                            }
                          })()
                        }</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold border border-slate-750 transition-colors"
                  >
                    Back to Compose
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md active:scale-[0.98]"
                  >
                    {loading
                      ? "Processing campaign run..."
                      : deliveryMode === "now"
                      ? "Send Emails Now"
                      : "Schedule Delivery"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Status toast for wizard */}
          {statusMessage && (
            <div className={`p-4 rounded-xl border text-xs text-left max-w-md mx-auto w-full ${
              statusMessage.success
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}>
              {statusMessage.text}
            </div>
          )}

        </div>
      )}
    </main>
  )
}
