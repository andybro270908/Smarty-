import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

/* session memory */

const memory = {};

/* root */

app.get("/", (req,res)=>{
res.send("Smarty AI backend running");
});

/* chat endpoint */

app.post("/chat", async (req,res)=>{

const {message,session} = req.body;

let history = memory[session] || [];

history.push({role:"user",content:message});

let reply = "AI could not generate response.";

const messages = [
...history.slice(-6)
];

/* GROQ (UPDATED MODEL) */

try{

if(process.env.GROQ_API_KEY){

const r = await fetch(
"https://api.groq.com/openai/v1/chat/completions",
{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.GROQ_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"gpt-oss-120b",
messages
})
}
);

const data = await r.json();

reply = data.choices?.[0]?.message?.content || reply;

}

}catch(e){}

/* GEMINI fallback */

if(reply==="AI could not generate response."){

try{

const r = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
contents:[{parts:[{text:message}]}]
})
}
);

const data = await r.json();

reply = data.candidates?.[0]?.content?.parts?.[0]?.text || reply;

}catch(e){}

}

/* OPENAI fallback */

if(reply==="AI could not generate response."){

try{

const r = await fetch(
"https://api.openai.com/v1/chat/completions",
{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"gpt-4o-mini",
messages
})
}
);

const data = await r.json();

reply = data.choices?.[0]?.message?.content || reply;

}catch(e){}

}

/* HUGGINGFACE fallback */

if(reply==="AI could not generate response."){

try{

const r = await fetch(
"https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.HF_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({inputs:message})
}
);

const data = await r.json();

reply = data?.[0]?.generated_text || reply;

}catch(e){}

}

/* update memory */

history.push({role:"assistant",content:reply});

memory[session] = history.slice(-10);

res.json({reply});

});

/* start server */

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});
