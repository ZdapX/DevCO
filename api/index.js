const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const connectDB = require('../db');
const path = require('path');

const app = express();
connectDB();

// --- SECURITY LAYER ---
app.use(helmet()); // Anti-Sniffing & Header Protection
app.use(xss());    // Anti-XSS (Clean user input)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Limit per IP (Anti-DDoS)
    message: "Terlalu banyak permintaan, sistem pertahanan aktif."
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Session Management (Persistent)
app.use(session({
    secret: 'devcore_secret_key_xdpzq',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 minggu
}));

// Middleware Cek Login
const isAuth = (req, res, next) => {
    if (req.session.userId) next();
    else res.redirect('/masuk');
};

const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.redirect('/masuk');
};

// --- ROUTES ---

// Loading Page (Root)
app.get('/', (req, res) => {
    res.render('loading', { user: req.session.userId });
});

// Auth
app.get('/masuk', (req, res) => res.render('masuk'));
app.post('/auth/login', async (req, res) => {
    const { code } = req.body;
    if (code === "020510") {
        req.session.isAdmin = true;
        req.session.userId = "ADMIN_OWNER";
        return res.json({ status: 'success', redirect: '/admin/ceo' });
    }
    // Logika login user biasa tambahkan di sini
});

// Chat Page
app.get('/chat', isAuth, (req, res) => {
    res.render('chat', { owner: "XdpzQ" });
});

// Admin Pages
app.get('/admin/ceo', isAdmin, (req, res) => res.render('admin/ceo'));
app.get('/admin/listuser', isAdmin, (req, res) => res.render('admin/listuser'));
app.get('/admin/vastur', isAdmin, (req, res) => res.render('admin/vastur'));

module.exports = app;
