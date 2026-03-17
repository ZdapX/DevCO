const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const axios = require('axios');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// --- 1. DATABASE CONNECTION ---
// Pastikan MONGO_URI ada di Environment Variables Vercel
const MONGO_URI = process.env.MONGO_URI; 
mongoose.connect(MONGO_URI)
    .then(() => console.log("DevCORE Database: SECURED 🛡️"))
    .catch(err => console.error("DB Connection Error:", err));

// Database Schemas
const ConfigSchema = new mongoose.Schema({
    key: String,
    value: mongoose.Schema.Types.Mixed
});
const Config = mongoose.model('Config', ConfigSchema);

const ChatSchema = new mongoose.Schema({
    userId: String,
    role: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', ChatSchema);

const UserSchema = new mongoose.Schema({
    userId: String,
    status: { type: String, default: 'active' }, // 'active' or 'banned'
    lastSeen: Date
});
const User = mongoose.model('User', UserSchema);

// --- 2. SECURITY MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false, // Dimatikan agar CDN luar bisa masuk (Tailwind/JSDelivr)
}));
app.use(xss()); // Filter input dari script berbahaya
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Anti-DDoS / Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Rate limit exceeded. System protection active."
});
app.use(globalLimiter);

// --- 3. VIEW ENGINE & PATH CONFIG (Vercel Fix) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));

// Session Management with MongoDB (Anti-Reset)
app.use(session({
    secret: 'devcore_secret_key_xdpzq_99',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 Hari
}));

// --- 4. CORE LOGIC & PERSONA ---
const DEFAULT_PERSONA = "Kamu adalah DevCORE - AI, asisten cerdas yang sangat kuat, disiplin, dan setia kepada Tuan XdpzQ. Kamu ahli dalam coding dan cybersecurity.";
const ADMIN_CODE = "020510";

// --- 5. ROUTES ---

// [Root] Loading Screen
app.get('/', (req, res) => {
    res.render('loading', { user: req.session.userId || null });
});

// [Auth] Login Page & Logic
app.get('/masuk', (req, res) => res.render('masuk'));

app.post('/auth/login', async (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        req.session.userId = "OWNER_XDPZQ";
        req.session.role = "admin";
        return res.json({ status: 'success', redirect: '/chat' });
    }
    // Simple User Auto-Registration
    const tempId = "USER_" + Math.floor(Math.random() * 10000);
    req.session.userId = tempId;
    req.session.role = "user";
    await User.findOneAndUpdate({ userId: tempId }, { lastSeen: new Date() }, { upsert: true });
    res.json({ status: 'success', redirect: '/chat' });
});

// [Main] Chat Interface
app.get('/chat', (req, res) => {
    if (!req.session.userId) return res.redirect('/masuk');
    res.render('chat', { 
        userId: req.session.userId, 
        role: req.session.role 
    });
});

// [AI Logic] OpenRouter API Handler
app.post('/api/chat', async (req, res) => {
    if (!req.session.userId) return res.status(403).json({ error: "Unauthorized" });

    const { message } = req.body;

    try {
        // Cek status banned
        const checkUser = await User.findOne({ userId: req.session.userId });
        if (checkUser && checkUser.status === 'banned') {
            return res.json({ response: "AKSES DIBLOKIR: Akun Anda telah di-banned oleh Admin." });
        }

        // Ambil Persona & API Key dari DB
        const personaConfig = await Config.findOne({ key: 'persona' });
        const apiKeys = await Config.findOne({ key: 'api_keys' });
        
        const currentPersona = personaConfig ? personaConfig.value : DEFAULT_PERSONA;
        const currentApiKey = apiKeys ? apiKeys.value[0] : process.env.OPENROUTER_KEY;

        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-exp:free",
            messages: [
                { role: "system", content: currentPersona },
                { role: "user", content: message }
            ]
        }, {
            headers: { "Authorization": `Bearer ${currentApiKey}` }
        });

        const aiMsg = response.data.choices[0].message.content;
        
        // Simpan History
        await Chat.create({ userId: req.session.userId, role: 'user', content: message });
        await Chat.create({ userId: req.session.userId, role: 'ai', content: aiMsg });

        res.json({ response: aiMsg });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI Core Offline" });
    }
});

// --- 6. ADMIN ROUTES ---

const isAdmin = (req, res, next) => {
    if (req.session.role === 'admin') next();
    else res.status(403).send("ACCESS DENIED: ADMIN ONLY");
};

app.get('/admin/ceo', isAdmin, (req, res) => res.render('admin/ceo'));
app.get('/admin/listuser', isAdmin, async (req, res) => {
    const users = await User.find();
    res.render('admin/listuser', { users });
});
app.get('/admin/vastur', isAdmin, async (req, res) => {
    const persona = await Config.findOne({ key: 'persona' });
    res.render('admin/vastur', { current: persona ? persona.value : DEFAULT_PERSONA });
});

// Admin Post Actions
app.post('/admin/vastur/update', isAdmin, async (req, res) => {
    await Config.findOneAndUpdate({ key: 'persona' }, { value: req.body.persona }, { upsert: true });
    res.redirect('/admin/vastur');
});

app.post('/admin/api/add', isAdmin, async (req, res) => {
    const { apiKey } = req.body;
    await Config.findOneAndUpdate({ key: 'api_keys' }, { $push: { value: apiKey } }, { upsert: true });
    res.redirect('/admin/ceo');
});

app.post('/admin/user/ban', isAdmin, async (req, res) => {
    await User.findOneAndUpdate({ userId: req.body.targetId }, { status: 'banned' });
    res.json({ status: 'success' });
});

// --- 7. EXPORT FOR VERCEL ---
module.exports = app;
