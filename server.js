require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;
if(!SECRET){
  console.error('Defina JWT_SECRET antes de iniciar.');
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { error: 'Demasiadas tentativas de login. Tenta novamente mais tarde.' }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    const fs = require('fs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, 'cv-' + req.user.id + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas ficheiros PDF são permitidos.'));
  }
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  auth: { user: process.env.SMTP_USER || 'teste@ethereal.email', pass: process.env.SMTP_PASS || 'teste123' }
});

const db = new sqlite3.Database(process.env.DB_PATH || path.join(__dirname, 'tramponorte.sqlite'));

db.serialize(() => {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, company TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  db.run('CREATE TABLE IF NOT EXISTS candidates(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, city TEXT, cv_path TEXT, skills TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  db.run('CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, company TEXT NOT NULL, city TEXT NOT NULL, type TEXT NOT NULL, area TEXT NOT NULL, salary INTEGER, description TEXT NOT NULL, contact_email TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, active INTEGER DEFAULT 1)');
  db.run('CREATE INDEX IF NOT EXISTS jobs_active_city ON jobs(active,city)');
  db.run('CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id)');
  db.run('CREATE TABLE IF NOT EXISTS saved_jobs(candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(candidate_id,job_id))');
  db.run('CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, email TEXT NOT NULL, query TEXT, city TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  
  db.run('CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), candidate_id INTEGER NOT NULL REFERENCES candidates(id), company_email TEXT NOT NULL, status TEXT DEFAULT "Pendente", created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  db.run('CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id), job_id INTEGER NOT NULL REFERENCES jobs(id), rating INTEGER NOT NULL, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  db.run('CREATE TABLE IF NOT EXISTS password_resets(id INTEGER PRIMARY KEY, email TEXT NOT NULL, token TEXT NOT NULL, role TEXT NOT NULL, expires_at TEXT NOT NULL)');
});

const run = (sql, p = []) => new Promise((resolve, reject) => db.run(sql, p, function(e){ e ? reject(e) : resolve({ id: this.lastID, changes: this.changes }); }));
const all = (sql, p = []) => new Promise((resolve, reject) => db.all(sql, p, (e, r) => e ? reject(e) : resolve(r)));
const get = (sql, p = []) => new Promise((resolve, reject) => db.get(sql, p, (e, r) => e ? reject(e) : resolve(r)));

function auth(req, res, next){
  try{
    const h = req.headers.authorization || '';
    req.user = jwt.verify(h.replace(/^Bearer /,''), SECRET);
    next();
  }catch{
    return res.status(401).json({ error: 'Inicia sessão para continuar.' });
  }
}

const str = (x, n) => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= n;
const isEmail = (x) => typeof x === 'string' && /^\S+@\S+\.\S+$/.test(x);
function likeEscape(s){ return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_'); }

// ================= AUTENTICAÇÃO =================
app.post('/api/auth/register', async (req, res) => {
  try{
    const { email, password, company } = req.body || {};
    if(!str(email, 254) || !isEmail(email) || typeof password !== 'string' || password.length < 10 || !str(company, 120)) return res.status(400).json({ error: 'Dados inválidos.' });
    const hash = await bcrypt.hash(password, 12);
    const u = await run('INSERT INTO users(email,password,company) VALUES(?,?,?)', [email.toLowerCase().trim(), hash, company.trim()]);
    res.status(201).json({ token: jwt.sign({ id: u.id, email: email.toLowerCase(), company, role: 'employer' }, SECRET, { expiresIn: '7d' }), company });
  }catch(e){ res.status(e.code === 'SQLITE_CONSTRAINT' ? 409 : 500).json({ error: 'Email já registado.' }); }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const u = await get('SELECT * FROM users WHERE email=?', [String(email || '').toLowerCase().trim()]);
  if(!u || !(await bcrypt.compare(String(password || ''), u.password))) return res.status(401).json({ error: 'Email ou palavra-passe incorretos.' });
  res.json({ token: jwt.sign({ id: u.id, email: u.email, company: u.company, role: 'employer' }, SECRET, { expiresIn: '7d' }), company: u.company });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const u = await get('SELECT company, email FROM users WHERE id=?', [req.user.id]);
  if(!u) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(u);
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, role } = req.body;
  const table = role === 'employer' ? 'users' : 'candidates';
  const user = await get(`SELECT * FROM ${table} WHERE email=?`, [String(email).toLowerCase().trim()]);
  if(!user) return res.status(200).json({ message: 'Se o email existir, receberás um link.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await run('INSERT INTO password_resets(email, token, role, expires_at) VALUES(?,?,?,?)', [email, token, role, expiresAt]);
  transporter.sendMail({ from: '"Trampo Norte"', to: email, subject: 'Recuperar Password', html: `<a href="http://localhost:3000/reset.html?token=${token}">Redefinir Password</a>` }, (err) => { if(err) console.log(err); });
  res.json({ message: 'Email enviado.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if(newPassword.length < 10) return res.status(400).json({ error: 'Mínimo 10 caracteres.' });
  const reset = await get('SELECT * FROM password_resets WHERE token=? AND expires_at > ?', [token, new Date().toISOString()]);
  if(!reset) return res.status(400).json({ error: 'Token inválido ou expirado.' });
  const hash = await bcrypt.hash(newPassword, 12);
  const table = reset.role === 'employer' ? 'users' : 'candidates';
  await run(`UPDATE ${table} SET password=? WHERE email=?`, [hash, reset.email]);
  await run('DELETE FROM password_resets WHERE token=?', [token]);
  res.json({ message: 'Password redefinida com sucesso!' });
});

// ================= CANDIDATOS =================
app.post('/api/candidates/register', async (req, res) => {
  try{
    const { email, password, name, city = '', skills = '' } = req.body || {};
    if(!str(email, 254) || !isEmail(email) || typeof password !== 'string' || password.length < 10 || !str(name, 120)) return res.status(400).json({ error: 'Dados inválidos.' });
    const hash = await bcrypt.hash(password, 12);
    const r = await run('INSERT INTO candidates(email,password,name,city,skills) VALUES(?,?,?,?,?)', [email.toLowerCase().trim(), hash, name.trim(), String(city).trim(), String(skills).trim()]);
    
    // Devolve o perfil completo no registo
    res.status(201).json({ 
      token: jwt.sign({ id: r.id, email: email.toLowerCase(), name, role: 'candidate' }, SECRET, { expiresIn: '7d' }), 
      profile: { name, skills, cv_path: null } 
    });
  }catch(e){ res.status(e.code === 'SQLITE_CONSTRAINT' ? 409 : 500).json({ error: 'Email já registado.' }); }
});

app.post('/api/candidates/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const u = await get('SELECT * FROM candidates WHERE email=?', [String(email || '').toLowerCase().trim()]);
  if(!u || !(await bcrypt.compare(String(password || ''), u.password))) return res.status(401).json({ error: 'Email ou palavra-passe incorretos.' });
  
  // Devolve o perfil completo no login
  res.json({ 
    token: jwt.sign({ id: u.id, email: u.email, name: u.name, role: 'candidate' }, SECRET, { expiresIn: '7d' }), 
    profile: { name: u.name, skills: u.skills, cv_path: u.cv_path } 
  });
});

app.get('/api/candidates/me', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  const c = await get('SELECT name,email,city,created_at,cv_path,skills FROM candidates WHERE id=?', [req.user.id]);
  if(!c) return res.status(404).json({ error: 'Perfil não encontrado.' });
  res.json(c);
});

app.get('/api/candidates/saved', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  res.json(await all('SELECT j.* FROM saved_jobs s JOIN jobs j ON j.id=s.job_id WHERE s.candidate_id=?', [req.user.id]));
});

app.put('/api/candidates/profile', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  const { skills, city } = req.body;
  await run('UPDATE candidates SET skills=?, city=? WHERE id=?', [String(skills||'').slice(0,500), String(city||'').slice(0,80), req.user.id]);
  res.json({ message: 'Perfil atualizado!' });
});

// ================= CANDIDATURAS & AVALIAÇÕES =================
app.post('/api/jobs/:id/apply', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const job = await get('SELECT j.*, u.email as employer_email FROM jobs j JOIN users u ON j.user_id = u.id WHERE j.id=? AND j.active=1', [req.params.id]);
    if(!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const candidate = await get('SELECT * FROM candidates WHERE id=?', [req.user.id]);
    if(!candidate.cv_path) return res.status(400).json({ error: 'Precisas de carregar um CV antes de te candidatares.' });
    const existing = await get('SELECT id FROM applications WHERE job_id=? AND candidate_id=?', [job.id, req.user.id]);
    if(existing) return res.status(409).json({ error: 'Já te candidataste a esta vaga.' });

    await run('INSERT INTO applications(job_id, candidate_id, company_email) VALUES(?,?,?)', [job.id, req.user.id, job.employer_email]);
    transporter.sendMail({ from: '"Trampo Norte"', to: job.employer_email, subject: `Nova candidatura: ${job.title}`, html: `<h3>Nova candidatura!</h3><p>Candidato: <b>${candidate.name}</b></p>` }, (err) => { if(err) console.log(err); });
    io.to(`user_${job.user_id}`).emit('new_application', { message: `Nova candidatura de ${candidate.name} para "${job.title}"!` });
    res.status(201).json({ message: 'Candidatura enviada!' });
  } catch (e) { res.status(500).json({ error: 'Erro ao processar candidatura.' }); }
});

app.get('/api/employer/applications', auth, async (req, res) => {
  if(req.user.role !== 'employer') return res.status(403).json({ error: 'Acesso negado.' });
  const apps = await all(`
    SELECT a.id, a.status, a.created_at, j.title, c.name as candidate_name, c.email as candidate_email, c.cv_path 
    FROM applications a JOIN jobs j ON a.job_id = j.id JOIN candidates c ON a.candidate_id = c.id 
    WHERE j.user_id = ? ORDER BY a.created_at DESC
  `, [req.user.id]);
  res.json(apps);
});

app.put('/api/employer/applications/:id', auth, async (req, res) => {
  if(req.user.role !== 'employer') return res.status(403).json({ error: 'Acesso negado.' });
  await run('UPDATE applications SET status=? WHERE id=? AND company_email=?', [req.body.status, req.params.id, req.user.email]);
  res.json({ message: 'Estado atualizado.' });
});

app.post('/api/reviews', auth, async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  const { job_id, rating, comment } = req.body;
  await run('INSERT INTO reviews(candidate_id, job_id, rating, comment) VALUES(?,?,?,?)', [req.user.id, job_id, rating, comment]);
  res.status(201).json({ message: 'Avaliação registada!' });
});

// ================= VAGAS =================
app.get('/api/jobs', async (req, res) => {
  const q = '%' + likeEscape(String(req.query.q || '').slice(0, 100)) + '%';
  const city = String(req.query.city || '').slice(0, 80);
  const area = String(req.query.area || '').slice(0, 80);
  const type = String(req.query.type || '').slice(0, 80);
  const typePattern = type ? type + '%' : '';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));
  const offset = (page - 1) * limit;
  let candidateSkills = null;

  if(req.headers.authorization) {
    try { const decoded = jwt.verify(req.headers.authorization.replace('Bearer ',''), SECRET); if(decoded.role==='candidate') { const c = await get('SELECT skills FROM candidates WHERE id=?', [decoded.id]); candidateSkills = c ? c.skills.toLowerCase() : null; } } catch(e){}
  }

  const whereClause = `active=1 AND (title LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR area LIKE ? ESCAPE '\\') AND (? = '' OR city = ?) AND (? = '' OR area = ?) AND (? = '' OR type LIKE ? ESCAPE '\\')`;
  const params = [q, q, q, city, city, area, area, type, typePattern];
  const totalRow = await get(`SELECT COUNT(*) as count FROM jobs WHERE ${whereClause}`, params);
  const totalPages = Math.ceil(totalRow.count / limit);
  const rows = await all(`SELECT id,title,company,city,type,area,salary,description,created_at FROM jobs WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  
  const data = rows.map(j => {
    let isMatch = false;
    if(candidateSkills && j.area && candidateSkills.includes(j.area.toLowerCase())) isMatch = true;
    return { ...j, isMatch };
  });

  res.json({ data, meta: { total: totalRow.count, page, limit, totalPages } });
});

app.post('/api/jobs', auth, async (req, res) => {
  if(req.user.role !== 'employer') return res.status(403).json({ error: 'Apenas empresas.' });
  const b = req.body || {};
  if(!str(b.title, 120) || !str(b.city, 80) || !str(b.type, 50) || !str(b.area, 80) || !str(b.description, 5000) || !str(b.contact_email, 254)) return res.status(400).json({ error: 'Dados inválidos.' });
  const salary = (b.salary === '' || b.salary == null) ? null : Number(b.salary);
  const r = await run('INSERT INTO jobs(user_id,title,company,city,type,area,salary,description,contact_email) VALUES(?,?,?,?,?,?,?,?,?)', [req.user.id, b.title.trim(), req.user.company, b.city.trim(), b.type.trim(), b.area.trim(), salary, b.description.trim(), b.contact_email.trim()]);
  res.status(201).json(await get('SELECT * FROM jobs WHERE id=?', [r.id]));
});

app.get('/api/my/jobs', auth, async (req, res) => { res.json(await all('SELECT * FROM jobs WHERE user_id=? AND active=1 ORDER BY created_at DESC', [req.user.id])); });
app.delete('/api/jobs/:id', auth, async (req, res) => { const r = await run('UPDATE jobs SET active=0 WHERE id=? AND user_id=?', [Number(req.params.id), req.user.id]); if(!r.changes) return res.status(404).json({ error: 'Vaga não encontrada.' }); res.status(204).end(); });

app.post('/api/candidates/upload-cv', auth, upload.single('cv'), async (req, res) => {
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  if(!req.file) return res.status(400).json({ error: 'Nenhum ficheiro.' });
  const cvPath = '/uploads/' + req.file.filename;
  await run('UPDATE candidates SET cv_path=? WHERE id=?', [cvPath, req.user.id]);
  res.json({ message: 'CV atualizado!', cv_path: cvPath });
});

app.post('/api/candidates/saved/:jobId', auth, async (req, res) => { 
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  await run('INSERT OR IGNORE INTO saved_jobs(candidate_id,job_id) VALUES(?,?)', [req.user.id, Number(req.params.jobId)]); 
  res.status(201).json({ saved: true }); 
});

app.delete('/api/candidates/saved/:jobId', auth, async (req, res) => { 
  if(req.user.role !== 'candidate') return res.status(403).json({ error: 'Acesso negado.' });
  await run('DELETE FROM saved_jobs WHERE candidate_id=? AND job_id=?', [req.user.id, Number(req.params.jobId)]); 
  res.status(204).end(); 
});

app.post('/api/alerts', async (req, res) => { await run('INSERT INTO alerts(email,query,city) VALUES(?,?,?)', [req.body.email, '', '']); res.status(201).json({ message: 'Registado.' }); });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

io.on('connection', (socket) => { socket.on('join_employer', (userId) => { socket.join(`user_${userId}`); }); });
server.listen(PORT, () => console.log('Tramponorte disponível na porta ' + PORT));