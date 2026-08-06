const { db } = require("./src/db/index");
const { campaigns, templates, attachments, users } = require("./src/db/schema");
const { eq } = require("drizzle-orm");

async function test() {
  console.log("[Test] Initializing DB queries verification...");
  
  const testUserId = "test-user-123";
  const testCampaignId = "test-camp-123";
  const testTemplateId = "test-tpl-123";
  
  try {
    // 1. Clean up any leftover test data first
    await db.delete(users).where(eq(users.id, testUserId));
    
    // 2. Insert dummy user
    console.log("[Test] Inserting dummy user...");
    await db.insert(users).values({
      id: testUserId,
      name: "Test User",
      email: "test-user-123@example.com",
    });

    // 3. Insert test campaign
    console.log("[Test] Inserting campaign...");
    await db.insert(campaigns).values({
      id: testCampaignId,
      userId: testUserId,
      name: "Test Attachments Campaign",
      headers: ["Email", "Name"],
      activeHeaders: ["Email", "Name"],
      status: "draft",
    });
    
    // 4. Insert test template
    console.log("[Test] Inserting template...");
    await db.insert(templates).values({
      id: testTemplateId,
      campaignId: testCampaignId,
      name: "Test Template Profile",
      subject: "Test Subject",
      body: "<p>Hello World</p>",
      fallbacks: {},
      unsubscribeEnabled: false,
    });
    
    // 5. Insert test attachment
    console.log("[Test] Inserting attachment...");
    await db.insert(attachments).values({
      id: "test-att-123",
      templateId: testTemplateId,
      name: "test-document.pdf",
      mimeType: "application/pdf",
      size: 1024,
      content: "dGVzdCBwZGYgY29udGVudA==", // base64 of "test pdf content"
    });
    
    // 6. Run the query logic from templates/page.tsx
    console.log("[Test] Running page query logic...");
    const savedTemplates = await db
      .select()
      .from(templates)
      .where(eq(templates.campaignId, testCampaignId));

    const templateData = await Promise.all(
      savedTemplates.map(async (t) => {
        const atts = await db
          .select({
            name: attachments.name,
            mimeType: attachments.mimeType,
            size: attachments.size,
            content: attachments.content,
          })
          .from(attachments)
          .where(eq(attachments.templateId, t.id));
        return {
          ...t,
          attachments: atts,
        };
      })
    );
    
    console.log("[Test] Retrieved template data:", JSON.stringify(templateData, null, 2));
    
    // 7. Assertions
    if (templateData.length !== 1) {
      throw new Error(`Expected 1 template, got ${templateData.length}`);
    }
    const t = templateData[0];
    if (t.name !== "Test Template Profile") {
      throw new Error(`Expected template name 'Test Template Profile', got '${t.name}'`);
    }
    if (!t.attachments || t.attachments.length !== 1) {
      throw new Error(`Expected 1 attachment, got ${t.attachments ? t.attachments.length : 0}`);
    }
    const att = t.attachments[0];
    if (att.name !== "test-document.pdf") {
      throw new Error(`Expected attachment name 'test-document.pdf', got '${att.name}'`);
    }
    if (att.mimeType !== "application/pdf") {
      throw new Error(`Expected mimeType 'application/pdf', got '${att.mimeType}'`);
    }
    if (att.size !== 1024) {
      throw new Error(`Expected size 1024, got ${att.size}`);
    }
    if (att.content !== "dGVzdCBwZGYgY29udGVudA==") {
      throw new Error(`Expected content 'dGVzdCBwZGYgY29udGVudA==', got '${att.content}'`);
    }
    
    console.log("[Test] Verification SUCCESS! All assertions passed.");
    
  } catch (err) {
    console.error("[Test] Verification FAILED:", err);
  } finally {
    // 8. Clean up
    console.log("[Test] Cleaning up database...");
    await db.delete(users).where(eq(users.id, testUserId));
    console.log("[Test] Done.");
  }
}

test();
