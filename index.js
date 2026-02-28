import express from "express";
import cors from "cors";
import fetch from "node-fetch";
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

/* ================= EMOTION (HUGGING FACE) ================= */

async function detectEmotion(text) {
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/nateraw/bert-base-uncased-emotion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.HF_API_KEY
        },
        body: JSON.stringify({ inputs: text })
      }
    );

    const data = await response.json();

    if (!Array.isArray(data) || !data[0]) return "neutral";

    const emotions = data[0];
    const top = emotions.sort((a,b)=>b.score-a.score)[0];
    return top.label.toLowerCase();

  } catch {
    return "neutral";
  }
}

/* ================= CODE DETECTION ================= */

function isCodingRequest(text) {
  const keywords = [
    "code","function","api","class","debug","error",
    "compile","script","program","javascript","python"
  ];
  const t = text.toLowerCase();
  return keywords.some(k => t.includes(k));
}

/* ================= CHAT ROUTE ================= */

app.post("/chat", async (req,res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error:"Message required" });

    const id = sessionId || uuidv4();
    if (!sessions[id]) sessions[id] = [];

    // Math shortcut
    if (/^[0-9+\-*/().\s^%]+$/.test(message)) {
      try {
        const result = evaluate(message);
        return res.json({
          reply:`Answer: ${result}`,
          emotion:"neutral",
          provider:"math",
          sessionId:id
        });
      } catch {}
    }

    sessions[id].push({ role:"user", content:message });

    const systemPrompt = {
      role:"system",
      content:
        "You are SMARTY AI developed by Mr. Anand. Give precise, accurate answers in maximum 4 sentences."
    };

    let aiReply="";
    let provider="";

    /* ===== CODING MODE ===== */
    if (isCodingRequest(message)) {

      const openaiRes = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":"Bearer "+process.env.OPENAI_API_KEY
          },
          body:JSON.stringify({
            model:"gpt-3.5-turbo",
            messages:[systemPrompt,...sessions[id]],
            temperature:0.1
          })
        }
      );

      const openaiData = await openaiRes.json();
      aiReply = openaiData.choices?.[0]?.message?.content || "";
      provider="openai_coder";

    } else {

      try {
        const groqResp = await groq.chat.completions.create({
          model:"llama-3.1-8b-instant",
          temperature:0.1,
          max_tokens:400,
          messages:[systemPrompt,...sessions[id]]
        });

        aiReply = groqResp.choices[0].message.content;
        provider="groq";

      } catch {

        const model = genAI.getGenerativeModel({
          model:"gemini-1.5-flash",
          generationConfig:{temperature:0.1,maxOutputTokens:400}
        });

        const gemRes = await model.generateContent(
          sessions[id].map(m=>m.content).join("\n")
        );

        aiReply = gemRes.response.text();
        provider="gemini";
      }
    }

    sessions[id].push({ role:"assistant", content:aiReply });

    const emotion = await detectEmotion(message + " " + aiReply);

    res.json({
      reply:aiReply,
      emotion,
      provider,
      sessionId:id
    });

  } catch (err) {
    res.status(500).json({ error:err.message });
  }
});

app.listen(process.env.PORT || 10000);
