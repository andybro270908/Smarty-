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
   MEMORY CONFIG
========================= */

const memory = {};
const MAX_MEMORY = 40;

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req,res)=>{
  res.send("Smarty AI backend running");
});

/* =========================
   WEB SEARCH (DuckDuckGo)
========================= */

async function webSearch(query){

  try{

    const r = await fetch(
      "https://api.duckduckgo.com/?q="+encodeURIComponent(query)+"&format=json"
    );

    const data = await r.json();

    if(data.AbstractText){
      return data.AbstractText;
    }

  }catch(e){
    console.log("Search failed");
  }

  return "";
}

/* =========================
   AI ROUTER
========================= */

async function askAI(message){

  /* -------- GROQ -------- */

  try{

    if(process.env.GROQ_API_KEY){

      const r = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":"Bearer "+process.env.GROQ_API_KEY
          },
          body:JSON.stringify({
            model:"llama-3.3-70b-versatile",
            messages:[{role:"user",content:message}]
          })
        }
      );

      const data = await r.json();

      if(data.choices){
        return data.choices[0].message.content;
      }

    }

  }catch(e){
    console.log("Groq failed");
  }

  /* -------- GEMINI -------- */

  try{

    if(process.env.GEMINI_API_KEY){

      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key="+process.env.GEMINI_API_KEY,
        {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            contents:[{parts:[{text:message}]}]
          })
        }
      );

      const data = await r.json();

      if(data.candidates){
        return data.candidates[0].content.parts[0].text;
      }

    }

  }catch(e){
    console.log("Gemini failed");
  }

  /* -------- OPENAI -------- */

  try{

    if(process.env.OPENAI_API_KEY){

      const r = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":"Bearer "+process.env.OPENAI_API_KEY
          },
          body:JSON.stringify({
            model:"gpt-4o-mini",
            messages:[{role:"user",content:message}]
          })
        }
      );

      const data = await r.json();

      if(data.choices){
        return data.choices[0].message.content;
      }

    }

  }catch(e){
    console.log("OpenAI failed");
  }

  /* -------- HUGGINGFACE -------- */

  try{

    if(process.env.HF_API_KEY){

      const r = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
          method:"POST",
          headers:{
            "Authorization":"Bearer "+process.env.HF_API_KEY,
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            inputs:message
          })
        }
      );

      const data = await r.json();

      if(Array.isArray(data)){
        return data[0].generated_text;
      }

    }

  }catch(e){
    console.log("HF failed");
  }

  return "All AI services are currently unavailable.";
}

/* =========================
   CHAT ENDPOINT
========================= */

app.post("/chat", async (req,res)=>{

  const {message,session} = req.body;

  if(!message){
    return res.json({reply:"Message missing"});
  }

  if(!memory[session]){
    memory[session]=[];
  }

  /* greeting rule */

  if(message.toLowerCase()=="hi"){
    return res.json({reply:"Hi"});
  }

  /* store user message */

  memory[session].push({
    role:"user",
    content:message
  });

  /* trim memory */

  if(memory[session].length > MAX_MEMORY){
    memory[session] = memory[session].slice(-MAX_MEMORY);
  }

  /* prepare context */

  let context = memory[session]
  .map(m=>`${m.role}:${m.content}`)
  .join("\n");

  /* web search trigger */

  if(
    message.toLowerCase().includes("news") ||
    message.toLowerCase().includes("current affairs") ||
    message.toLowerCase().includes("latest")
  ){

    const search = await webSearch(message);

    if(search){
      context += "\nWeb info:"+search;
    }

  }

  const reply = await askAI(context);

  memory[session].push({
    role:"assistant",
    content:reply
  });

  res.json({reply});

});

/* =========================
   PDF READER
========================= */

const upload = multer();

app.post("/read-pdf", upload.single("file"), async (req,res)=>{

  try{

    const pdf = await pdfParse(req.file.buffer);

    res.json({
      reply: pdf.text.substring(0,2000)
    });

  }catch{

    res.json({
      reply:"PDF could not be read."
    });

  }

});

/* =========================
   PDF GENERATOR
========================= */

app.post("/make-pdf",(req,res)=>{

  const doc = new PDFDocument();

  res.setHeader("Content-Type","application/pdf");

  doc.text(req.body.text || "Smarty AI PDF");

  doc.pipe(res);

  doc.end();

});

/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>{
  console.log("Server running on port "+PORT);
});
