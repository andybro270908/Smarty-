import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";

const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

const PORT = process.env.PORT || 3000;

const mongoURI = process.env.MONGO_URI;

let db;

async function connectDB(){

const client = new MongoClient(mongoURI);

await client.connect();

db = client.db("smarty");

console.log("MongoDB connected");

}

connectDB();



/* REGISTER */

app.post("/register", async(req,res)=>{

try{

const {username,password}=req.body;

const hash = await bcrypt.hash(password,10);

await db.collection("users").insertOne({

username,
password:hash

});

res.json({status:"registered"});

}catch(err){

res.json({status:"error"});

}

});



/* LOGIN */

app.post("/login", async(req,res)=>{

try{

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

res.json({status:"error"});

}

});



/* AI CHAT */

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

const data=await r.json();

reply=data.candidates?.[0]?.content?.parts?.[0]?.text || reply;

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

const data=await r.json();

reply=data.choices?.[0]?.message?.content || reply;

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

const data=await r.json();

reply=data.choices?.[0]?.message?.content || reply;

}

}catch(e){}



/* SAVE MEMORY */

await db.collection("chat").insertOne({

user:message,

ai:reply,

time:new Date()

});



res.json({reply});



}catch(err){

res.json({reply:"Server error occurred."});

}

});



app.get("/",(req,res)=>{

res.send("Smarty backend running");

});



app.listen(PORT,()=>{

console.log("Server started");

});
