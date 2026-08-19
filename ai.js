import OpenAI from 'openai';
import { db } from './db.js';

function setting(key){ return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value || ''; }
export async function askAI(history, message){
  if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY تنظیم نشده است');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const knowledge=db.prepare('SELECT title,content FROM knowledge ORDER BY updated_at DESC LIMIT 20').all();
  const knowledgeText=knowledge.length ? '\n\nPROJECT KNOWLEDGE:\n'+knowledge.map(k=>`### ${k.title}\n${k.content}`).join('\n\n') : '';
  const instructions=[setting('system_prompt'), `PERSONALITY:\n${setting('personality')}`, knowledgeText].join('\n\n');
  const input=[...history.slice(-20).map(m=>({role:m.role,content:m.content})),{role:'user',content:message}];
  const response=await client.responses.create({model:setting('model')||process.env.OPENAI_MODEL||'gpt-5',instructions,input});
  return response.output_text || 'پاسخی دریافت نشد.';
}
export function getPublicConfig(){ return {brandName:setting('brand_name'), model:setting('model')}; }
