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

app.get("/", (req,res)=>{
  res.send("Smarty AI backend running");
});

async function askAI(message){

  /* GROQ */

  try{

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+process.env.GROQ_API_KEY
      },
      body:JSON.stringify({
        model:"llama-3.3-70b-versatile",
        messages:[{role:"user",content:message}]
      })
    });

    const data = await r.json();

    if(data.choices){
      return data.choices[0].message.content;
    }

  }catch(e){
    console.log("Groq failed");
  }

  /* GEMINI */

  try{

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

  }catch(e){
    console.log("Gemini failed");
  }

  /* OPENAI */

  try{

    const r = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+process.env.OPENAI_API_KEY
      },
      body:JSON.stringify({
        model:"gpt-4o-mini",
        messages:[{role:"user",content:message}]
      })
    });

    const data = await r.json();

    if(data.choices){
      return data.choices[0].message.content;
    }

  }catch(e){
    console.log("OpenAI failed");
  }

  /* HUGGINGFACE */

  try{

    const r = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method:"POST",
        headers:{
          "Authorization":"Bearer "+process.env.HF_API_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({inputs:message})
      }
    );

    const data = await r.json();

    if(Array.isArray(data)){
      return data[0].generated_text;
    }

  }catch(e){
    console.log("HF failed");
  }

  return "All AI services are currently unavailable.";
}

app.post("/chat", async (req,res)=>{

  const {message} = req.body;

  if(!message){
    return res.json({reply:"Message missing"});
  }

  if(message.toLowerCase()=="hi"){
    return res.json({reply:"Hi"});
  }

  const reply = await askAI(message);

  res.json({reply});
});


/* PDF reader */

const upload = multer();

app.post("/read-pdf",upload.single("file"),async(req,res)=>{

  try{

    const pdf = await pdfParse(req.file.buffer);

    res.json({
      reply: pdf.text.substring(0,2000)
    });

  }catch{

    res.json({
      reply:"PDF could not be read"
    });

  }

});


/* PDF generator */

app.post("/make-pdf",(req,res)=>{

  const doc = new PDFDocument();

  res.setHeader("Content-Type","application/pdf");

  doc.text(req.body.text || "Smarty AI PDF");

  doc.pipe(res);

  doc.end();

});


app.listen(PORT,()=>{
  console.log("Server running on port "+PORT);
});
