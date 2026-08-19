import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { db } from './db.js';
import { login, requireAuth, requireAdmin } from './auth.js';
import { askAI, getPublicConfig } from './ai.js';

const app=express();
app.use(helmet());
app.use(cors({origin:process.env.CLIENT_ORIGIN || true}));
app.use(express.json({limit:'1mb'}));

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Kourosh AI',version:'1.0.0'}));
app.get('/api/config',(req,res)=>res.json(getPublicConfig()));
app.post('/api/auth/login',(req,res)=>{
  const parsed=z.object({username:z.string().min(1),password:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'اطلاعات ورود نامعتبر است'});
  const result=login(parsed.data.username,parsed.data.password);
  if(!result) return res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'});
  res.json(result);
});

app.get('/api/conversations',requireAuth,(req,res)=>{
  const rows=db.prepare('SELECT id,title,created_at,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id);
  res.json(rows);
});
app.post('/api/conversations',requireAuth,(req,res)=>{
  const title=(req.body?.title||'گفتگوی جدید').slice(0,100);
  const r=db.prepare('INSERT INTO conversations(user_id,title) VALUES(?,?)').run(req.user.id,title);
  res.json({id:r.lastInsertRowid,title});
});
app.get('/api/conversations/:id/messages',requireAuth,(req,res)=>{
  const c=db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!c) return res.status(404).json({error:'گفتگو پیدا نشد'});
  res.json(db.prepare('SELECT role,content,created_at FROM messages WHERE conversation_id=? ORDER BY id').all(c.id));
});
app.post('/api/chat',requireAuth,async(req,res)=>{
  const parsed=z.object({conversationId:z.coerce.number().int().positive(),message:z.string().min(1).max(20000)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'پیام نامعتبر است'});
  const {conversationId,message}=parsed.data;
  const c=db.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').get(conversationId,req.user.id);
  if(!c) return res.status(404).json({error:'گفتگو پیدا نشد'});
  const history=db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id').all(conversationId);
  db.prepare('INSERT INTO messages(conversation_id,role,content) VALUES(?,?,?)').run(conversationId,'user',message);
  try {
    const answer=await askAI(history,message);
    db.prepare('INSERT INTO messages(conversation_id,role,content) VALUES(?,?,?)').run(conversationId,'assistant',answer);
    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP,title=CASE WHEN title="گفتگوی جدید" THEN ? ELSE title END WHERE id=?').run(message.slice(0,60),conversationId);
    res.json({answer});
  } catch(e){ res.status(502).json({error:e.message || 'خطا در اتصال به مدل هوش مصنوعی'}); }
});

app.get('/api/admin/settings',requireAuth,requireAdmin,(req,res)=>{
  const rows=db.prepare('SELECT key,value,updated_at FROM settings').all();
  res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])));
});
app.put('/api/admin/settings',requireAuth,requireAdmin,(req,res)=>{
  const allowed=['system_prompt','model','personality','brand_name'];
  const update=db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP');
  const tx=db.transaction(obj=>{for(const k of allowed) if(typeof obj[k]==='string') update.run(k,obj[k]);});
  tx(req.body||{}); res.json({ok:true,...getPublicConfig()});
});
app.get('/api/admin/knowledge',requireAuth,requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM knowledge ORDER BY updated_at DESC').all()));
app.post('/api/admin/knowledge',requireAuth,requireAdmin,(req,res)=>{
  const p=z.object({title:z.string().min(1).max(200),content:z.string().min(1).max(50000)}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'دانش نامعتبر است'});
  const r=db.prepare('INSERT INTO knowledge(title,content) VALUES(?,?)').run(p.data.title,p.data.content); res.json({id:r.lastInsertRowid});
});
app.delete('/api/admin/knowledge/:id',requireAuth,requireAdmin,(req,res)=>{db.prepare('DELETE FROM knowledge WHERE id=?').run(req.params.id);res.json({ok:true});});
app.get('/api/admin/users',requireAuth,requireAdmin,(req,res)=>res.json(db.prepare('SELECT id,username,role,created_at,last_seen FROM users ORDER BY id DESC').all()));
app.get('/api/admin/stats',requireAuth,requireAdmin,(req,res)=>{
  const users=db.prepare('SELECT COUNT(*) c FROM users WHERE role="user"').get().c;
  const conversations=db.prepare('SELECT COUNT(*) c FROM conversations').get().c;
  const messages=db.prepare('SELECT COUNT(*) c FROM messages').get().c;
  const today=db.prepare("SELECT COUNT(*) c FROM messages WHERE date(created_at)=date('now')").get().c;
  res.json({users,conversations,messages,todayMessages:today});
});

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const clientDist=path.resolve(__dirname,'../../client/dist');
if(process.env.SERVE_CLIENT==='true'){
  app.use(express.static(clientDist));
  app.use((req,res,next)=>{ if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(clientDist,'index.html')); next(); });
}
const port=Number(process.env.PORT||8787);
app.listen(port,()=>console.log(`Kourosh AI server running on http://localhost:${port}`));
