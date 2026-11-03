require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const http = require('http');
const crypto = require('crypto');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Server } = require('socket.io');
const postgres = require('postgres');

// CORREÇÃO: Apenas uma declaração da variável sql.
const sql = postgres.default(process.env.DATABASE_URL, { prepare: false });

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

if(!SECRET){ console.error('Defina JWT_SECRET.'); process.exit(1); }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Demasiadas tentativas.' } });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  auth: { user: process.env.SMTP_USER || 'teste@ethereal.email', pass: process.env.SMTP_PASS || 'teste123' }
});

const run = async (query, params = []) => { const result = await sql.unsafe(query, params); return { id: result[0]?.id, changes: result.count }; };
const all = async (query, params = []) => await sql.unsafe(query, params);
const get = async (query, params = []) => { const res = await sql.unsafe(query, params); return res[0]; };

function auth(req, res, next){
  try{ const h = req.headers.authorization || ''; req.user = jwt.verify(h.replace(/^Bearer /,''), SECRET); next(); }catch{ return res.status(401).json({ error: 'Inicia sessão.' }); }
}
const str = (x, n) => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= n;
const isEmail = (x) => typeof x === 'string' && /^\S+@\S+\.\S+$/.test(x);

// --- Autenticação ---
app.post('/api/auth/register', async (req, res) => {
  try{
    const { email, password, company } = req.body || {};
    if(!str(email, 254) || !isEmail(email) || typeof password !== 'string' || password.length < 10) return res.status(400).json({ error: 'Dados inválidos.' });
    const hash = await bcrypt.hash(password, 12);
    const u = await run('INSERT INTO users(email,password,company) VALUES($1,$2,$3) RETURNING id', [email.toLowerCase().trim(), hash, company.trim()]);
    res.status(201).json({ token: jwt.sign({ id: u.id, email: email.toLowerCase(), company, role: 'employer' }, SECRET, { expiresIn: '7d' }), company });
  }catch(e){ res.status(409).json({ error: 'Email já registado.' }); }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const u = await get('SELECT * FROM users WHERE email=$1', [String(email || '').toLowerCase().trim()]);
  if(!u || !(await bcrypt.compare(String(password || ''), u.password))) return res.status(401).json({ error: 'Email ou palavra-passe incorretos.' });
  res.json({ token: jwt.sign({ id: u.id, email: u.email, company: u.company, role: 'employer' }, SECRET, { expiresIn: '7d' }), company: u.company });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const u = await get('SELECT company, email FROM users WHERE id=$1', [req.user.id]);
  if(!u) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(u);
});

// --- Candidatos ---
app.post('/api/candidates/register', async (req, res) => {
  try{
    const { email, password, name, city = '', skills = '' } = req.body || {};
    if(!str(email, 254) || !isEmail(email) || typeof password !== 'string' || password.length < 10) return res.status(400).json({ error: 'Dados inválidos.' });
    const hash = await bcrypt.hash(password, 12);
    const r = await run('INSERT INTO candidates(email,password,name,city,skills) VALUES($1,$2,$3,$4,$5) RETURNING id', [email.toLowerCase().trim(), hash, name.trim(), String(city).trim(), String(skills).trim()]);
    res.status(201).json({ token: jwt.sign({ id: r.id, email: email.toLowerCase(), name, role: 'candidate' }, SECRET, { expiresIn: '7d' }), profile: { name, skills, cv_path: null, avatar_url: null } });
  }catch(e){ res.status(409).json({ error: 'Email já registado.' }); }
});

app.post('/api/candidates/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const u = await get('SELECT * FROM candidates WHERE email=$1', [String(email || '').toLowerCase().trim()]);
  if(!u || !(await bcrypt.compare(String(password || ''), u.password))) return res.status(401).json({ error: 'Email ou palavra-passe incorretos.' });
  res.json({ token: jwt.sign({ id: u.id, email: u.email, name: u.name, role: 'candidate' }, SECRET, { expiresIn: '7d' }), profile: { name: u.name, skills: u.skills, cv_path: u.cv_path, avatar_url: u.avatar_url } });
});

app.get('/api/candidates/me', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  const c = await get('SELECT name,email,city,created_at,cv_path,skills,avatar_url FROM candidates WHERE id=$1', [req.user.id]);
  if(!c) return res.status(404).json({ error: 'Perfil não encontrado.' });
  res.json(c);
});

app.put('/api/candidates/profile', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  const { skills, city } = req.body;
  await run('UPDATE candidates SET skills=$1, city=$2 WHERE id=$3', [String(skills||'').slice(0,500), String(city||'').slice(0,80), req.user.id]);
  res.json({ message: 'Perfil atualizado!' });
});

// Upload de CV e Avatar
app.post('/api/candidates/upload-cv', auth, upload.single('cv'), async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  if(!req.file) return res.status(400).json({ error: 'Nenhum ficheiro.' });
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'auto', folder: 'curriculos' }, (error, result) => { if (error) reject(error); else resolve(result); });
      uploadStream.end(req.file.buffer);
    });
    await run('UPDATE candidates SET cv_path=$1 WHERE id=$2', [result.secure_url, req.user.id]);
    res.json({ message: 'CV atualizado!', cv_path: result.secure_url });
  } catch (e) { res.status(500).json({ error: 'Erro no upload.' }); }
});

app.post('/api/candidates/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  if(!req.file) return res.status(400).json({ error: 'Nenhum ficheiro.' });
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'avatares', width: 200, height: 200, crop: 'fill' }, (error, result) => { if (error) reject(error); else resolve(result); });
      uploadStream.end(req.file.buffer);
    });
    await run('UPDATE candidates SET avatar_url=$1 WHERE id=$2', [result.secure_url, req.user.id]);
    res.json({ message: 'Avatar atualizado!', avatar_url: result.secure_url });
  } catch (e) { res.status(500).json({ error: 'Erro no upload.' }); }
});

// --- Candidaturas & Avaliações ---
app.post('/api/jobs/:id/apply', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const job = await get('SELECT j.*, u.email as employer_email FROM jobs j JOIN users u ON j.user_id = u.id WHERE j.id=$1 AND j.active=1', [req.params.id]);
    if(!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const candidate = await get('SELECT * FROM candidates WHERE id=$1', [req.user.id]);
    if(!candidate.cv_path) return res.status(400).json({ error: 'Carrega um CV primeiro.' });
    const existing = await get('SELECT id FROM applications WHERE job_id=$1 AND candidate_id=$2', [job.id, req.user.id]);
    if(existing) return res.status(409).json({ error: 'Já te candidataste.' });
    await run('INSERT INTO applications(job_id, candidate_id, company_email) VALUES($1,$2,$3)', [job.id, req.user.id, job.employer_email]);
    io.to(`user_${job.user_id}`).emit('new_application', { message: `Nova candidatura de ${candidate.name}!` });
    res.status(201).json({ message: 'Candidatura enviada!' });
  } catch (e) { res.status(500).json({ error: 'Erro ao processar.' }); }
});

app.get('/api/employer/applications', auth, async (req, res) => {
  if(req.user.role !== 'employer') return res.status(403).json({ error: 'Acesso negado.' });
  const apps = await all('SELECT a.id, a.status, a.created_at, j.title, c.name as candidate_name, c.email as candidate_email, c.cv_path, c.avatar_url FROM applications a JOIN jobs j ON a.job_id = j.id JOIN candidates c ON a.candidate_id = c.id WHERE j.user_id = $1 ORDER BY a.created_at DESC', [req.user.id]);
  res.json(apps);
});

app.put('/api/employer/applications/:id', auth, async (req, res) => {
  await run('UPDATE applications SET status=$1 WHERE id=$2 AND company_email=$3', [req.body.status, req.params.id, req.user.email]);
  res.json({ message: 'Atualizado.' });
});

// --- VAGAS COM FILTROS E CANDIDATURAS ---
app.get('/api/jobs', async (req, res) => {
  const q = '%' + String(req.query.q || '').slice(0, 100) + '%';
  const city = String(req.query.city || '').slice(0, 80);
  const minSalary = parseInt(req.query.minSalary) || 0;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 6;
  const offset = (page - 1) * limit;
  
  let candidateId = null;
  if(req.headers.authorization) {
    try { const decoded = jwt.verify(req.headers.authorization.replace('Bearer ',''), SECRET); if(decoded.role==='candidate') candidateId = decoded.id; } catch(e){}
  }

  const whereClause = `active=1 AND (title ILIKE $1 OR company ILIKE $1) AND ($2 = '' OR city=$2) AND (salary IS NULL OR salary >= $3)`;
  const params = [q, city, minSalary];
  const rows = await all(`SELECT * FROM jobs WHERE ${whereClause} ORDER BY created_at DESC LIMIT $4 OFFSET $5`, [...params, limit, offset]);
  const totalRow = await get(`SELECT COUNT(*) as count FROM jobs WHERE ${whereClause}`, params);
  
  // Adicionar flag 'hasApplied'
  const data = await Promise.all(rows.map(async j => {
    let hasApplied = false;
    if(candidateId) { const app = await get('SELECT id FROM applications WHERE job_id=$1 AND candidate_id=$2', [j.id, candidateId]); if(app) hasApplied = true; }
    return { ...j, hasApplied };
  }));

  res.json({ data, meta: { total: parseInt(totalRow.count), page, limit, totalPages: Math.ceil(totalRow.count / limit) } });
});

app.post('/api/jobs', auth, async (req, res) => {
  const b = req.body || {};
  const r = await run('INSERT INTO jobs(user_id,title,company,city,type,area,salary,description,contact_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [req.user.id, b.title, req.user.company, b.city, b.type, b.area, b.salary||null, b.description, b.contact_email]);
  res.status(201).json(await get('SELECT * FROM jobs WHERE id=$1', [r.id]));
});

app.get('/api/my/jobs', auth, async (req, res) => { res.json(await all('SELECT * FROM jobs WHERE user_id=$1 AND active=1', [req.user.id])); });
app.delete('/api/jobs/:id', auth, async (req, res) => { await run('UPDATE jobs SET active=0 WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.status(204).end(); });

// --- ROTA PÚBLICA DA EMPRESA ---
app.get('/api/companies/:id', async (req, res) => {
  const company = await get('SELECT id, company FROM users WHERE id=$1', [req.params.id]);
  if(!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
  const jobs = await all('SELECT * FROM jobs WHERE user_id=$1 AND active=1 ORDER BY created_at DESC', [req.params.id]);
  const reviews = await all('SELECT r.rating, r.comment, c.name FROM reviews r JOIN candidates c ON r.candidate_id = c.id JOIN jobs j ON r.job_id = j.id WHERE j.user_id = $1 ORDER BY r.created_at DESC', [req.params.id]);
  const avg = reviews.length ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : "0.0";
  res.json({ company: company.company, jobs, reviews: { average: avg, total: reviews.length, list: reviews } });
});

// --- SAVED & ALERTS ---
app.post('/api/candidates/saved/:jobId', auth, async (req, res) => { await run('INSERT INTO saved_jobs(candidate_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.jobId]); res.status(201).json({saved:true}); });
app.delete('/api/candidates/saved/:jobId', auth, async (req, res) => { await run('DELETE FROM saved_jobs WHERE candidate_id=$1 AND job_id=$2', [req.user.id, req.params.jobId]); res.status(204).end(); });
app.post('/api/alerts', async (req, res) => { res.status(201).json({ message: 'Registado.' }); });

app.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

io.on('connection', (socket) => { socket.on('join_employer', (userId) => { socket.join(`user_${userId}`); }); });
server.listen(PORT, () => console.log('Tramponorte online: ' + PORT));