import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";
import path from "path";

const app = express();

app.use(express.json());

app.use(cors({
origin:"*"
}));

/* ---------- STATIC FILES ---------- */

app.use(express.static("public"));

/* ---------- PORT ---------- */

const PORT = process.env.PORT || 3000;

/* ---------- MONGODB ---------- */

const uri = process.env.MONGO_URI;

let db;

const client = new MongoClient(uri);

async function connectDB(){

await client.connect();

db = client.db("smarty");

console.log("MongoDB connected");

}

connectDB();

/* ---------- REGISTER ---------- */

app.post("/register",async(req,res)=>{

const {username,password}=req.body;

const exist = await db.collection("users").findOne({username});

if(exist){
return res.json({status:"user exists"});
}

const hash = await bcrypt.hash(password,10);

await db.collection("users").insertOne({
username,
password:hash
});

res.json({status:"registered"});

});

/* ---------- LOGIN ---------- */

app.post("/login",async(req,res)=>{

const {username,password}=req.body;

const user = await db.collection("users").findOne({username});

if(!user){
return res.json({status:"user not found"});
}

const ok = await bcrypt.compare(password,user.password);

if(!ok){
return res.json({status:"wrong password"});
}

res.json({status:"success"});

});

/* ---------- CHAT ---------- */

app.post("/chat",async(req,res)=>{

const message=req.body.message;

let reply="AI could not respond";

/* GROQ */

try{

const r = await fetch(
"https://api.groq.com/openai/v1/chat/completions",
{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.GROQ_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"llama3-70b-8192",
messages:[{role:"user",content:message}]
})
}
);

const data=await r.json();

reply=data.choices?.[0]?.message?.content || reply;

}catch(e){}

/* GEMINI */

if(reply==="AI could not respond"){

try{

const r = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
contents:[
{parts:[{text:message}]}
]
})
}
);

const data=await r.json();

reply=data.candidates?.[0]?.content?.parts?.[0]?.text || reply;

}catch(e){}

}

res.json({reply});

});

/* ---------- HEALTH ---------- */

app.get("/health",(req,res)=>{

res.json({status:"server running"});

});

/* ---------- SERVER ---------- */

app.listen(PORT,()=>{

console.log("Server running on port "+PORT);

});
