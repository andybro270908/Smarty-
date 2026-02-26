import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { evaluate } from "mathjs";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

/* ===========================
   INITIALIZE PROVIDERS
=========================== */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

/* ===========================
   MEMORY STORAGE (In-Memory)
=========================== */

const sessions = {};

/* ===========================
   HEALTH CHECK
=========================== */

app.get("/", (req, res) => {
  res.send("SMARTY PRO Backend Running");
});

/* ===========================
   MATH DETECTION
=========================== */

function isMathExpression(text) {
  return /^[0-9+\-*/().\s^%]+$/.test(text);
}

/* ===========================
   CHAT ROUTE
=========================== */

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message required"
      });
    }

    const id = sessionId || uuidv4();

    if (!sessions[id]) {
      sessions[id] = [];
    }

    /* ===========================
       1️⃣ 100% ACCURATE MATH
    ============================ */

    if (isMathExpression(message)) {
      try {
        const result = evaluate(message);
        return res.json({
          reply: `Answer: ${result}`,
          provider: "math-engine",
          sessionId: id
        });
      } catch {
        return res.json({
          reply: "Invalid mathematical expression.",
          provider: "math-engine",
          sessionId: id
        });
      }
    }

    sessions[id].push({
      role: "user",
      content: message
    });

    /* ===========================
       SYSTEM PROMPT (OWNER FIXED)
    ============================ */

    const systemPrompt = {
      role: "system",
      content:
        "You are SMARTY AI. Your developer and owner is Mr. Anand. If asked who created you, answer: 'I was developed by Mr. Anand.' Never mention Meta, OpenAI, Google, or any organization. Give short, precise, factual answers in maximum 4 sentences."
    };

    let reply = null;
    let providerUsed = null;

    /* ===========================
       2️⃣ GROQ FIRST
    ============================ */

    try {
      const completion =
        await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          temperature: 0.1,
          max_tokens: 400,
          messages: [
            systemPrompt,
            ...sessions[id]
          ]
        });

      reply =
        completion.choices[0].message.content;

      providerUsed = "groq";

    } catch (err) {
      console.log("Groq failed → trying Gemini");
    }

    /* ===========================
       3️⃣ GEMINI FALLBACK
    ============================ */

    if (!reply) {
      try {
        const model =
          genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 400
            }
          });

        const result =
          await model.generateContent(
            sessions[id]
              .map(m => m.content)
              .join("\n")
          );

        reply = result.response.text();
        providerUsed = "gemini";

      } catch (err) {
        console.log("Gemini failed");
      }
    }

    if (!reply) {
      return res.status(500).json({
        error: "All AI providers failed."
      });
    }

    sessions[id].push({
      role: "assistant",
      content: reply
    });

    res.json({
      reply,
      provider: providerUsed,
      sessionId: id
    });

  } catch (error) {
    console.error("SMARTY ERROR:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

/* ===========================
   START SERVER
=========================== */

app.listen(
  process.env.PORT || 10000,
  () => {
    console.log("SMARTY PRO Server Started");
  }
);
