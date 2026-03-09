import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";
import pdfParse from "pdf-parse";
import PDFDocument from "pdfkit";

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ---------------- session memory ---------------- */
const sessions = {}; // { sessionId: [{role,content}] }

/* ---------------- small math tool ---------------- */
function tryMath(input) {
  try {
    if (!/^[0-9+\-*/().\s^%]+$/.test(input)) return null;
    const expr = input.replace(/\^/g, "**");
    const result = Function(`"use strict";return (${expr})`)();
    if (Number.isFinite(result)) return String(result);
  } catch {}
  return null;
}

/* ---------------- rules ---------------- */
function applyRules(message) {
  const m = message.trim().toLowerCase();

  if (m === "hi" || m === "hello") return "Hi";

  if (m.includes("who is your developer") || m.includes("who built you"))
    return "My developer is Mr. Anand.";

  const math = tryMath(message);
  if (math !== null) return `Result: ${math}`;

  if (m.includes("health advice"))
    return "I can provide general health information only. Please consult a qualified medical professional for diagnosis or treatment.";

  return null;
}

/* ---------------- web search tool ---------------- */
/* Uses DuckDuckGo instant answer API (no key required) */
async function webSearch(query) {
  try {
    const r = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    );
    const d = await r.json();
    return (
      d.AbstractText ||
      (d.RelatedTopics?.[0]?.Text ?? null) ||
      "No clear answer found."
    );
  } catch {
    return null;
  }
}

/* ---------------- AI failover chain ---------------- */
async function askAI(messages) {
  let reply = null;

  /* GROQ */
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages,
      }),
    });
    const d = await r.json();
    reply = d.choices?.[0]?.message?.content || null;
  } catch {}

  /* GEMINI */
  if (!reply) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: messages.at(-1).content }] }],
          }),
        }
      );
      const d = await r.json();
      reply = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {}
  }

  /* OPENAI */
  if (!reply) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
        }),
      });
      const d = await r.json();
      reply = d.choices?.[0]?.message?.content || null;
    } catch {}
  }

  /* HUGGINGFACE */
  if (!reply) {
    try {
      const r = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: messages.at(-1).content }),
        }
      );
      const d = await r.json();
      reply = d?.[0]?.generated_text || null;
    } catch {}
  }

  return reply || "All AI services are currently unavailable.";
}

/* ---------------- chat endpoint ---------------- */
app.post("/chat", async (req, res) => {
  const { message, session = "default" } = req.body;

  /* local rules first */
  const rule = applyRules(message);
  if (rule) return res.json({ reply: rule });

  /* current affairs / search trigger */
  if (message.toLowerCase().includes("current") || message.toLowerCase().includes("news")) {
    const search = await webSearch(message);
    if (search) return res.json({ reply: search });
  }

  /* conversation memory */
  const history = sessions[session] || [];
  history.push({ role: "user", content: message });

  const messages = [
    {
      role: "system",
      content:
        "You are Smarty AI. Provide accurate answers, strong coding help, reasoning, and explanations.",
    },
    ...history.slice(-6),
  ];

  const reply = await askAI(messages);

  history.push({ role: "assistant", content: reply });
  sessions[session] = history.slice(-10);

  res.json({ reply });
});

/* ---------------- PDF reading ---------------- */
const upload = multer({ storage: multer.memoryStorage() });

app.post("/read-pdf", upload.single("file"), async (req, res) => {
  try {
    const data = await pdfParse(req.file.buffer);
    const text = data.text.slice(0, 4000);

    const reply = await askAI([
      { role: "system", content: "Summarize this PDF text." },
      { role: "user", content: text },
    ]);

    res.json({ reply });
  } catch {
    res.json({ reply: "Unable to read the PDF." });
  }
});

/* ---------------- PDF generation ---------------- */
app.post("/make-pdf", async (req, res) => {
  const { text = "Report generated by Smarty AI." } = req.body;

  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=report.pdf");

  doc.pipe(res);
  doc.fontSize(14).text(text);
  doc.end();
});

/* ---------------- root ---------------- */
app.get("/", (req, res) => {
  res.send("Smarty AI backend running");
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
