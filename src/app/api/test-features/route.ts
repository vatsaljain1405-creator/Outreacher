import { buildMimeMessage } from "@/lib/mime"

export async function GET() {
  try {
    console.log("[Test Endpoint] Running MIME message generation tests...")

    const testAttachmentContent = "Hello Attachment Content!"
    const base64Content = Buffer.from(testAttachmentContent).toString("base64")

    const mime = buildMimeMessage({
      to: "recipient@test.com",
      from: "sender@test.com",
      subject: "Test Subject",
      htmlBody: "<p>Hello World</p>",
      unsubscribeLink: "http://localhost:3001/api/unsubscribe/123",
      attachmentsList: [
        {
          name: "test.txt",
          mimeType: "text/plain",
          content: base64Content,
        }
      ]
    })

    const containsUnsubHeader = mime.includes("List-Unsubscribe:")
    const containsUnsubPostHeader = mime.includes("List-Unsubscribe-Post:")
    const containsUnsubFooter = mime.includes("Unsubscribe here")
    const containsAttachmentContent = mime.includes(base64Content)
    const isMultipart = mime.includes("Content-Type: multipart/mixed;")

    return new Response(JSON.stringify({
      success: true,
      testsPassed: {
        containsUnsubHeader,
        containsUnsubPostHeader,
        containsUnsubFooter,
        containsAttachmentContent,
        isMultipart,
      },
      rawMimeSample: mime
    }), {
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
