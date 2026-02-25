import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { evaluate } from "mathjs";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sessions = {};

/* ===========================
   Health Check
=========================== */

app.get("/", (req, res) => {
  res.send("SMARTY PRO Running (Groq + Gemini + Math Engine)");
});

/* ===========================
   Utility: Detect Math
=========================== */

function isMathExpression(text) {
  return /^[0-9+\-*/().\s^%]+$/.test(text);
}

/* ===========================
   Chat Route
=========================== */

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const id = sessionId || uuidv4();

    if (!sessions[id]) {
      sessions[id] = [];
    }

    /* ===========================
       1️⃣ Math Engine (Deterministic)
    ============================ */

    if (isMathExpression(message)) {
      try {
        const result = evaluate(message);
        return res.json({
          reply: `Answer: ${result}`,
          provider: "math-engine",
          sessionId: id
        });
      } catch (err) {
        return res.json({
          reply: "Invalid mathematical expression.",
          provider: "math-engine",
          sessionId: id
        });
      }
    }

    /* ===========================
       Add To Memory
    ============================ */

    sessions[id].push({ role: "user", content: message });

    const systemPrompt = {
      role: "system",
      content:
        "You are SMARTY AI. Provide precise, factual, and structured answers. If unsure, clearly say you are uncertain. Avoid guessing."
    };

    let reply = null;
    let providerUsed = null;

    /* ===========================
       2️⃣ Try GROQ First
    ============================ */

    try {
      if (process.env.GROQ_API_KEY) {
        const completion = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          temperature: 0.2,
          messages: [systemPrompt, ...sessions[id]]
        });

        reply = completion.choices[0].message.content;
        providerUsed = "groq";
      }
    } catch (err) {
      console.log("Groq failed → Gemini fallback");
    }

    /* ===========================
       3️⃣ Gemini Fallback
    ============================ */

    if (!reply && process.env.GEMINI_API_KEY) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 1024
          }
        });

        const result = await model.generateContent(
          sessions[id].map(m => m.content).join("\n")
        );

        reply = result.response.text();
        providerUsed = "gemini";
      } catch (err) {
        console.log("Gemini failed");
      }
    }

    if (!reply) {
      return res.status(500).json({ error: "All AI providers failed." });
    }

    sessions[id].push({ role: "assistant", content: reply });

    res.json({
      reply,
      provider: providerUsed,
      sessionId: id
    });

  } catch (error) {
    console.error("SMARTY PRO Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 10000);
