import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const secret = process.env.JWT_SECRET || 'dev-only-change-me';
export function signUser(user){ return jwt.sign({id:user.id, username:user.username, role:user.role}, secret, {expiresIn:'7d'}); }
export function requireAuth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  try { req.user=jwt.verify(token,secret); next(); } catch { res.status(401).json({error:'ورود لازم است'}); }
}
export function requireAdmin(req,res,next){ if(req.user?.role!=='admin') return res.status(403).json({error:'دسترسی مدیر لازم است'}); next(); }
export function login(username,password){
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if(!user || !bcrypt.compareSync(password,user.password_hash)) return null;
  db.prepare('UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
  return {id:user.id,username:user.username,role:user.role,token:signUser(user)};
}
