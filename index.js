import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import bcrypt from "bcrypt";
import { MongoClient, ServerApiVersion } from "mongodb";

const app = express();

app.use(express.json());

app.use(cors({
  origin: "*",
  methods: ["GET","POST"]
}));

const PORT = process.env.PORT || 3000;

/* -------------------- MONGODB -------------------- */

const uri = process.env.MONGO_URI;

let db = null;

const client = new MongoClient(uri,{
  serverApi:{
    version:ServerApiVersion.v1,
    strict:true,
    deprecationErrors:true
  }
});

async function connectDB(){

  try{

    await client.connect();

    db = client.db("smarty");

    console.log("MongoDB connected");

  }catch(err){

    console.log("MongoDB connection error:",err);

  }

}

await connectDB();

/* -------------------- REGISTER -------------------- */

app.post("/register", async(req,res)=>{

try{

if(!db){
return res.json({status:"database not ready"});
}

const {username,password}=req.body;

const exist = await db.collection("users").findOne({username});

if(exist){
return res.json({status:"user exists"});
}

const hash = await bcrypt.hash(password,10);

await db.collection("users").insertOne({

username:username,
password:hash,
created:new Date()

});

res.json({status:"registered"});

}catch(err){

console.log(err);

res.json({status:"error"});

}

});

/* -------------------- LOGIN -------------------- */

app.post("/login", async(req,res)=>{

try{

if(!db){
return res.json({status:"database not ready"});
}

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

}catch(err){

console.log(err);

res.json({status:"error"});

}

});

/* -------------------- CHAT -------------------- */

app.post("/chat", async(req,res)=>{

try{

const message=req.body.message;

let reply="I could not generate response.";

/* GEMINI */

try{

if(process.env.GEMINI_API_KEY){

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

}

}catch(e){}

/* GROQ */

try{

if(reply==="I could not generate response." && process.env.GROQ_API_KEY){

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

const data = await r.json();

reply = data.choices?.[0]?.message?.content || reply;

}

}catch(e){}

/* OPENAI */

try{

if(reply==="I could not generate response." && process.env.OPENAI_API_KEY){

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
messages:[{role:"user",content:message}]
})
}
);

const data = await r.json();

reply = data.choices?.[0]?.message?.content || reply;

}

}catch(e){}

/* SAVE CHAT */

try{

if(db){

await db.collection("chat").insertOne({

user:message,
ai:reply,
time:new Date()

});

}

}catch(e){}

res.json({reply:reply});

}catch(err){

console.log(err);

res.json({reply:"Server error occurred."});

}

});

/* -------------------- TEST ROUTE -------------------- */

app.get("/",(req,res)=>{

res.send("Smarty backend running");

});

/* -------------------- START SERVER -------------------- */

app.listen(PORT,()=>{

console.log("Server running on port "+PORT);

});
