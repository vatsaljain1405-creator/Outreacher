const { createClient } = require("@libsql/client");

async function run() {
  const client = createClient({
    url: "file:mailmerge.db",
  });
  
  try {
    const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table';");
    console.log("Tables in database:", res.rows.map(r => r.name));
    
    // Check template columns
    try {
      const templateCols = await client.execute("PRAGMA table_info(template);");
      console.log("Template columns:", templateCols.rows.map(r => `${r.name} (${r.type})`));
    } catch (e) {
      console.error("Error reading template table info:", e);
    }

    // Check campaign columns
    try {
      const campaignCols = await client.execute("PRAGMA table_info(campaign);");
      console.log("Campaign columns:", campaignCols.rows.map(r => `${r.name} (${r.type})`));
    } catch (e) {
      console.error("Error reading campaign table info:", e);
    }
  } catch (err) {
    console.error(err);
  }
}

run();
