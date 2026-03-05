import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ===== MongoDB ===== */

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

const User = mongoose.model("User", new mongoose.Schema({
  username:String,
  password:String
}));

const Memory = mongoose.model("Memory", new mongoose.Schema({
  username:String,
  message:String,
  reply:String,
  time:{type:Date,default:Date.now}
}));

/* ===== Register ===== */

app.post("/register", async(req,res)=>{
  const {username,password}=req.body;

  const exist=await User.findOne({username});
  if(exist) return res.json({status:"user_exists"});

  await User.create({username,password});
  res.json({status:"registered"});
});

/* ===== Login ===== */

app.post("/login", async(req,res)=>{
  const {username,password}=req.body;

  const user=await User.findOne({username,password});
  if(!user) return res.json({status:"invalid"});

  res.json({status:"success"});
});

/* ===== Emotion Detection ===== */

async function detectEmotion(text){

  try{

  const r=await fetch(
  "https://api-inference.huggingface.co/models/j-hartmann/emotion-english-distilroberta-base",
  {
    method:"POST",
    headers:{
      Authorization:`Bearer ${process.env.HF_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({inputs:text})
  });

  const data=await r.json();

  return data?.[0]?.[0]?.label || "neutral";

  }catch(e){
    return "neutral";
  }

}

/* ===== AI Router ===== */

async function askAI(message){

/* --- GROQ --- */

try{

const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.GROQ_API_KEY}`,
"Content-Type":"application/json"
},

body:JSON.stringify({
model:"llama3-70b-8192",
messages:[{role:"user",content:message}]
})

});

const data=await r.json();

if(data.choices){
return data.choices[0].message.content;
}

}catch(e){}

/* --- GEMINI --- */

try{

const r=await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
{
method:"POST",
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
contents:[{parts:[{text:message}]}]
})
});

const data=await r.json();

if(data.candidates){
return data.candidates[0].content.parts[0].text;
}

}catch(e){}

/* --- OPENAI --- */

try{

const r=await fetch("https://api.openai.com/v1/chat/completions",{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type":"application/json"
},

body:JSON.stringify({
model:"gpt-4o-mini",
messages:[{role:"user",content:message}]
})

});

const data=await r.json();

if(data.choices){
return data.choices[0].message.content;
}

}catch(e){}

return "I could not generate response.";

}

/* ===== Chat ===== */

app.post("/chat", async(req,res)=>{

const {message,username}=req.body;

const reply=await askAI(message);

const emotion=await detectEmotion(reply);

await Memory.create({
username,
message,
reply
});

res.json({
reply,
emotion
});

});

/* ===== Start ===== */

const PORT=process.env.PORT || 3000;

app.listen(PORT,()=>console.log("Smarty AI server running"));
