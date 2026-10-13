import crypto from "crypto"

export interface InlineImage {
  cid: string
  filename: string
  mimeType: string
  content: string // raw base64 string
}

// Helper function to build MIME message (multipart if attachments or inline images are present)
export function buildMimeMessage({
  to,
  from,
  subject,
  htmlBody,
  unsubscribeLink,
  attachmentsList,
  inlineImages,
}: {
  to: string
  from: string
  subject: string
  htmlBody: string
  unsubscribeLink?: string
  attachmentsList?: Array<{ name: string; mimeType: string; content: string }>
  inlineImages?: InlineImage[]
}) {
  const cleanTo = (to || "").trim().replace(/[\r\n]+/g, "")
  const cleanFrom = (from || "").trim().replace(/[\r\n]+/g, "")
  const hasAttachments = Boolean(attachmentsList && attachmentsList.length > 0)
  const hasInlineImages = Boolean(inlineImages && inlineImages.length > 0)

  const headers = [
    `To: ${cleanTo}`,
    `From: ${cleanFrom}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
  ]

  if (unsubscribeLink) {
    headers.push(`List-Unsubscribe: <${unsubscribeLink}>`)
    headers.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
  }

  // Helper to format inline image subparts
  const formatInlinePart = (img: InlineImage, boundary: string) => {
    let base64 = img.content
    if (base64.includes(";base64,")) {
      base64 = base64.split(";base64,").pop() || ""
    }
    // wrap long base64 lines to 76 chars per RFC
    const chunks = base64.match(/.{1,76}/g)?.join("\r\n") || base64

    return [
      `--${boundary}`,
      `Content-Type: ${img.mimeType}; name="${img.filename}"`,
      `Content-Disposition: inline; filename="${img.filename}"`,
      `Content-ID: <${img.cid}>`,
      `Content-Transfer-Encoding: base64`,
      "",
      chunks,
    ].join("\r\n")
  }

  // Case 1: Both attachments and inline images (or attachments only)
  if (hasAttachments) {
    const mixedBoundary = `----=_Part_Mixed_${crypto.randomUUID().replace(/-/g, "")}`
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)

    const parts: string[] = [headers.join("\r\n"), ""]

    if (hasInlineImages) {
      const relatedBoundary = `----=_Part_Related_${crypto.randomUUID().replace(/-/g, "")}`
      parts.push(`--${mixedBoundary}`)
      parts.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`)
      parts.push("")

      // HTML part inside related
      parts.push(`--${relatedBoundary}`)
      parts.push(`Content-Type: text/html; charset=utf-8`)
      parts.push(`Content-Transfer-Encoding: 7bit`)
      parts.push("")
      parts.push(htmlBody)

      // Inline image parts
      for (const img of inlineImages!) {
        parts.push(formatInlinePart(img, relatedBoundary))
      }
      parts.push(`--${relatedBoundary}--`)
    } else {
      // HTML part directly in mixed
      parts.push(`--${mixedBoundary}`)
      parts.push(`Content-Type: text/html; charset=utf-8`)
      parts.push(`Content-Transfer-Encoding: 7bit`)
      parts.push("")
      parts.push(htmlBody)
    }

    // Attachments
    for (const att of attachmentsList!) {
      let base64Content = att.content
      if (base64Content.includes(";base64,")) {
        base64Content = base64Content.split(";base64,").pop() || ""
      }
      const chunks = base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content

      parts.push(`--${mixedBoundary}`)
      parts.push(`Content-Type: ${att.mimeType}; name="${att.name}"`)
      parts.push(`Content-Disposition: attachment; filename="${att.name}"`)
      parts.push(`Content-Transfer-Encoding: base64`)
      parts.push("")
      parts.push(chunks)
    }

    parts.push(`--${mixedBoundary}--`)
    return parts.join("\r\n")
  }

  // Case 2: Inline images only (no file attachments)
  if (hasInlineImages) {
    const relatedBoundary = `----=_Part_Related_${crypto.randomUUID().replace(/-/g, "")}`
    headers.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`)

    const parts: string[] = [headers.join("\r\n"), ""]

    // HTML part
    parts.push(`--${relatedBoundary}`)
    parts.push(`Content-Type: text/html; charset=utf-8`)
    parts.push(`Content-Transfer-Encoding: 7bit`)
    parts.push("")
    parts.push(htmlBody)

    // Inline image parts
    for (const img of inlineImages!) {
      parts.push(formatInlinePart(img, relatedBoundary))
    }

    parts.push(`--${relatedBoundary}--`)
    return parts.join("\r\n")
  }

  // Case 3: Simple HTML email (no attachments, no inline images)
  headers.push(`Content-Type: text/html; charset=utf-8`)
  headers.push(`Content-Transfer-Encoding: 7bit`)
  const parts = [headers.join("\r\n"), "", htmlBody]
  return parts.join("\r\n")
}
