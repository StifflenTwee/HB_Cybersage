export const config = { api: { bodyParser: false } }; // keep raw body for multipart

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    // Parse multipart/form-data using Web Fetch API (available on Vercel)
    const form = await new Response(req).formData();
    const file = form.get("file");
    if (!file) return res.status(400).json({ error: "Missing 'file' field" });

    const original = (file.name || `upload-${Date.now()}.csv`).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!/\.csv$/i.test(original)) return res.status(400).json({ error: "Only .csv files allowed" });

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentB64 = bytes.toString("base64");

    const owner  = process.env.GH_OWNER;
    const repo   = process.env.GH_REPO;
    const branch = process.env.GH_BRANCH || "main";
    const token  = process.env.GITHUB_TOKEN;
    const path   = `uploads/${original}`;

    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "csv-uploader",
      "Accept": "application/vnd.github+json"
    };

    // If file exists, include its sha to update instead of creating
    let sha;
    const head = await fetch(baseUrl, { headers });
    if (head.status === 200) sha = (await head.json()).sha;

    const put = await fetch(baseUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore: upload ${original}`,
        content: contentB64,
        branch,
        sha,
        committer: { name: "CSV Uploader Bot", email: "bot@example.com" }
      })
    });

    if (!put.ok) {
      const text = await put.text();
      return res.status(502).json({ error: `GitHub API ${put.status}: ${text}` });
    }

    const data = await put.json();
    return res.status(200).json({
      ok: true,
      path,
      commit: data.commit?.sha,
      html_url: data.content?.html_url
    });
  } catch (e) {
    return res.status(500).json({ error: "Upload failed" });
  }
}
