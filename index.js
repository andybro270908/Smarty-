import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fetch from "node-fetch";
import bcrypt from "bcryptjs";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});

const MessageSchema = new mongoose.Schema({
  userId: String,
  role: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});

const SummarySchema = new mongoose.Schema({
  userId: String,
  summary: String,
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);
const Summary = mongoose.model("Summary", SummarySchema);

/* ================= AUTH ================= */

app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashed
    });

    res.json({ userId: user._id });

  } catch (err) {
    res.status(400).json({ error: "Username may already exist." });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  res.json({ userId: user._id });
});

/* ================= EMOTION ================= */

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

    const top = data[0].sort((a,b)=>b.score-a.score)[0];
    return top.label.toLowerCase();

  } catch {
    return "neutral";
  }
}

/* ================= MEMORY SUMMARIZER ================= */

async function summarizeMemory(userId) {

  const messages = await Message
    .find({ userId })
    .sort({ timestamp: 1 });

  if (messages.length === 0) return;

  const text = messages
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const openaiRes = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "Summarize this conversation while preserving important user facts, goals, preferences and context."
          },
          { role: "user", content: text }
        ],
        temperature: 0.2
      })
    }
  );

  const data = await openaiRes.json();
  const summary = data.choices[0].message.content;

  await Summary.findOneAndUpdate(
    { userId },
    { summary, updatedAt: new Date() },
    { upsert: true }
  );

  await Message.deleteMany({ userId });
}

/* ================= CODE DETECTION ================= */

function isCodingRequest(text) {
  const keywords = [
    "code","function","api","debug","class",
    "error","javascript","python","program"
  ];
  return keywords.some(k =>
    text.toLowerCase().includes(k)
  );
}

/* ================= CHAT ROUTE ================= */

app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!userId) return res.status(400).json({ error: "No userId" });

    await Message.create({
      userId,
      role: "user",
      content: message
    });

    const summaryDoc = await Summary.findOne({ userId });

    const recentMessages = await Message
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(10);

    const formattedRecent = recentMessages.reverse().map(m => ({
      role: m.role,
      content: m.content
    }));

    const systemPrompt = {
      role: "system",
      content: `
      You are SMARTY AI developed by Mr. Anand.
      Previous summarized memory:
      ${summaryDoc ? summaryDoc.summary : "No summary yet."}
      `
    };

    let aiReply = "";
    let provider = "";

    /* ===== CODING → OPENAI ===== */
    if (isCodingRequest(message)) {

      const openaiRes = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + process.env.OPENAI_API_KEY
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [systemPrompt, ...formattedRecent],
            temperature: 0.1
          })
        }
      );

      const data = await openaiRes.json();
      aiReply = data.choices[0].message.content;
      provider = "openai";

    } else {

      /* ===== NORMAL CHAT → GROQ ===== */
      try {

        const groqRes = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + process.env.GROQ_API_KEY
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [systemPrompt, ...formattedRecent],
              temperature: 0.2
            })
          }
        );

        const groqData = await groqRes.json();
        aiReply = groqData.choices[0].message.content;
        provider = "groq";

      } catch {

        /* ===== FALLBACK → GEMINI ===== */

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `
                  ${systemPrompt.content}
                  ${formattedRecent.map(m=>m.content).join("\n")}
                  `
                }]
              }]
            })
          }
        );

        const geminiData = await geminiRes.json();
        aiReply = geminiData.candidates[0].content.parts[0].text;
        provider = "gemini";
      }
    }

    await Message.create({
      userId,
      role: "assistant",
      content: aiReply
    });

    const count = await Message.countDocuments({ userId });
    if (count > 40) {
      await summarizeMemory(userId);
    }

    const emotion = await detectEmotion(message + " " + aiReply);

    res.json({
      reply: aiReply,
      emotion,
      provider
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 10000);
