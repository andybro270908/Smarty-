import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";
import pdfParse from "pdf-parse";
import PDFDocument from "pdfkit";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================
   Health Check
========================= */

app.get("/", (req, res) => {
  res.send("Smarty AI backend running");
});

/* =========================
   AI Router
========================= */

async function askAI(message) {

  /* -------- GROQ -------- */

  try {

    if (process.env.GROQ_API_KEY) {

      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },

        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{ role: "user", content: message }]
        })

      });

      const data = await r.json();

      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }

    }

  } catch (e) {
    console.log("Groq error");
  }

  /* -------- GEMINI -------- */

  try {

    if (process.env.GEMINI_API_KEY) {

      const r = await fetch(

        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,

        {
          method: "POST",
          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }]
          })

        }
      );

      const data = await r.json();

      if (data.candidates?.length) {
        return data.candidates[0].content.parts[0].text;
      }

    }

  } catch (e) {
    console.log("Gemini error");
  }

  /* -------- OPENAI -------- */

  try {

    if (process.env.OPENAI_API_KEY) {

      const r = await fetch("https://api.openai.com/v1/chat/completions", {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: message }]
        })

      });

      const data = await r.json();

      if (data.choices?.length) {
        return data.choices[0].message.content;
      }

    }

  } catch (e) {
    console.log("OpenAI error");
  }

  /* -------- HUGGINGFACE -------- */

  try {

    if (process.env.HF_API_KEY) {

      const r = await fetch(

        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",

        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            inputs: message
          })

        }
      );

      const data = await r.json();

      if (Array.isArray(data) && data[0]?.generated_text) {
        return data[0].generated_text;
      }

    }

  } catch (e) {
    console.log("HF error");
  }

  return "All AI services are currently unavailable.";

}

/* =========================
   Chat Endpoint
========================= */

app.post("/chat", async (req, res) => {

  try {

    const { message } = req.body;

    if (!message) {
      return res.json({ reply: "Message missing." });
    }

    /* greeting rule */

    if (message.toLowerCase() === "hi") {
      return res.json({ reply: "Hi" });
    }

    const reply = await askAI(message);

    res.json({ reply });

  } catch (error) {

    console.log(error);

    res.json({
      reply: "AI could not respond."
    });

  }

});

/* =========================
   PDF Reader
========================= */

const upload = multer();

app.post("/read-pdf", upload.single("file"), async (req, res) => {

  try {

    const pdf = await pdfParse(req.file.buffer);

    res.json({
      reply: pdf.text.substring(0, 2000)
    });

  } catch (err) {

    res.json({
      reply: "Could not read PDF."
    });

  }

});

/* =========================
   PDF Generator
========================= */

app.post("/make-pdf", (req, res) => {

  const { text } = req.body;

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");

  doc.text(text || "Smarty AI PDF");

  doc.pipe(res);

  doc.end();

});

/* =========================
   Start Server
========================= */

app.listen(PORT, () => {

  console.log("Server running on port " + PORT);

});
