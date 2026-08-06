import crypto from "crypto"

// Helper function to build MIME message (multipart if attachments are present)
export function buildMimeMessage({
  to,
  from,
  subject,
  htmlBody,
  unsubscribeLink,
  attachmentsList,
}: {
  to: string
  from: string
  subject: string
  htmlBody: string
  unsubscribeLink?: string
  attachmentsList?: Array<{ name: string; mimeType: string; content: string }>
}) {
  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
  ]

  if (unsubscribeLink) {
    headers.push(`List-Unsubscribe: <${unsubscribeLink}>`)
    headers.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
  }

  if (attachmentsList && attachmentsList.length > 0) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    const parts: string[] = []
    parts.push(headers.join("\r\n"))
    parts.push("")

    // HTML Body
    parts.push(`--${boundary}`)
    parts.push(`Content-Type: text/html; charset=utf-8`)
    parts.push(`Content-Transfer-Encoding: 7bit`)
    parts.push("")
    parts.push(htmlBody)

    // File Attachments
    for (const att of attachmentsList) {
      parts.push(`--${boundary}`)
      parts.push(`Content-Type: ${att.mimeType}; name="${att.name}"`)
      parts.push(`Content-Disposition: attachment; filename="${att.name}"`)
      parts.push(`Content-Transfer-Encoding: base64`)
      parts.push("")
      let base64Content = att.content
      if (base64Content.includes(";base64,")) {
        base64Content = base64Content.split(";base64,").pop() || ""
      }
      parts.push(base64Content)
    }

    parts.push(`--${boundary}--`)
    return parts.join("\r\n")
  } else {
    headers.push(`Content-Type: text/html; charset=utf-8`)
    headers.push(`Content-Transfer-Encoding: 7bit`)
    const parts = [headers.join("\r\n"), "", htmlBody]
    return parts.join("\r\n")
  }
}
