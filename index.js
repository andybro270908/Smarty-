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

app.get("/", (req, res) => {
  res.send("SMARTY PRO v2 Running");
});

function isMathExpression(text) {
  return /^[0-9+\-*/().\s^%]+$/.test(text);
}

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const id = sessionId || uuidv4();
    if (!sessions[id]) sessions[id] = [];

    if (isMathExpression(message)) {
      try {
        const result = evaluate(message);
        return res.json({
          reply: `Answer: ${result}`,
          provider: "math",
          sessionId: id
        });
      } catch {
        return res.json({
          reply: "Invalid mathematical expression.",
          provider: "math",
          sessionId: id
        });
      }
    }

    sessions[id].push({ role: "user", content: message });

    const systemPrompt = {
      role: "system",
      content:
        "You are SMARTY AI. Give short, precise, and factual answers. Maximum 4 sentences. No unnecessary explanations."
    };

    let reply = null;
    let providerUsed = null;

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 400,
        messages: [systemPrompt, ...sessions[id]]
      });

      reply = completion.choices[0].message.content;
      providerUsed = "groq";
    } catch {}

    if (!reply) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 400
          }
        });

        const result = await model.generateContent(
          sessions[id].map(m => m.content).join("\n")
        );

        reply = result.response.text();
        providerUsed = "gemini";
      } catch {}
    }

    if (!reply)
      return res.status(500).json({ error: "All providers failed" });

    sessions[id].push({ role: "assistant", content: reply });

    res.json({ reply, provider: providerUsed, sessionId: id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 10000);
