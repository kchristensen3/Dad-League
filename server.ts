import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Link Preview
  app.get("/api/link-preview", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch page");
      }
      const html = await response.text();

      // Simple extraction of Open Graph tags
      const title = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] || 
                    html.match(/<title>([^<]+)<\/title>/i)?.[1];
      const description = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1] ||
                          html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
      const image = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1];

      res.json({
        url,
        title: title || url,
        description: description || "",
        image: image || ""
      });
    } catch (error) {
      console.error("Link preview error:", error);
      res.status(500).json({ error: "Failed to fetch link preview" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
