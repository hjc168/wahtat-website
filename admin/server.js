const express = require('express');
const session = require('express-session');
const multer = require('multer');
const svgCaptcha = require('svg-captcha');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// ── Paths ──────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const IMAGES_FILE = path.join(DATA_DIR, 'images.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Ensure directories & files exist ───────────────────
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(IMAGES_FILE)) fs.writeFileSync(IMAGES_FILE, '[]', 'utf-8');

// ── Default admin user (created on first run) ──────────
function ensureDefaultUser() {
    let needsWrite = false;
    let user = null;

    if (fs.existsSync(USERS_FILE)) {
        try {
            user = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
            // Validate username field exists and passwordHash is a valid bcrypt hash
            if (!user.username || !user.passwordHash || !user.passwordHash.startsWith('$2')) {
                console.log('[init] Users file has invalid hash — regenerating...');
                needsWrite = true;
            }
        } catch (e) {
            console.log('[init] Users file corrupted — regenerating...');
            needsWrite = true;
        }
    } else {
        needsWrite = true;
    }

    if (needsWrite) {
        const hash = bcrypt.hashSync('admin123', 10);
        fs.writeFileSync(USERS_FILE, JSON.stringify({ username: 'admin', passwordHash: hash }, null, 2), 'utf-8');
        console.log('[init] Default admin user created (admin / admin123)');
    }
}
ensureDefaultUser();

// ── Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
}));

// Serve admin UI from /admin/*
app.use('/admin', express.static(PUBLIC_DIR));

// Serve uploaded images
app.use('/admin/uploads', express.static(UPLOADS_DIR));

// Serve main website from root — allows previewing changes locally
app.use(express.static(ROOT));

// ── Auth middleware ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// ── Auth helper ─────────────────────────────────────────
function getUser() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

// ══════════════════════════════════════════════════════════
//  AUTHENTICATION API
// ══════════════════════════════════════════════════════════

// GET  /api/captcha  — generate CAPTCHA
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({ size: 4, noise: 2, color: true, background: '#f7f5f0' });
    req.session.captchaText = captcha.text.toLowerCase();
    res.json({ svg: captcha.data });
});

// POST /api/login
app.post('/api/login', (req, res) => {
    const { username, password, captchaInput } = req.body;

    // Validate CAPTCHA
    if (!captchaInput || captchaInput.toLowerCase() !== req.session.captchaText) {
        return res.json({ success: false, message: 'Incorrect CAPTCHA. Please try again.' });
    }
    req.session.captchaText = null; // one-time use

    // Validate credentials
    const user = getUser();
    if (username !== user.username || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.json({ success: false, message: 'Invalid username or password.' });
    }

    req.session.loggedIn = true;
    req.session.username = username;
    res.json({ success: true, message: 'Login successful.', redirect: '/admin/dashboard.html' });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, redirect: '/admin/' });
    });
});

// GET  /api/session  — check if logged in
app.get('/api/session', (req, res) => {
    res.json({ loggedIn: !!req.session.loggedIn, username: req.session.username || null });
});

// ══════════════════════════════════════════════════════════
//  IMAGE LIBRARY API
// ══════════════════════════════════════════════════════════

// Multer config
// Multer — save all images to a single global uploads directory
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
        cb(null, name);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
        if (allowed.test(path.extname(file.originalname))) cb(null, true);
        else cb(new Error('Only image files (jpg, png, gif, webp, svg, bmp) are allowed.'));
    }
});

// GET  /api/images  — list all images (global library)
app.get('/api/images', requireAuth, (req, res) => {
    const images = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf-8'));
    res.json(images);
});

// POST /api/images/upload  — upload image(s) to global library
app.post('/api/images/upload', requireAuth, upload.array('images', 20), (req, res) => {
    const images = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf-8'));

    const added = req.files.map(file => {
        const entry = {
            id: 'img_' + crypto.randomBytes(4).toString('hex'),
            filename: file.filename,
            originalName: file.originalname,
            path: 'admin/uploads/' + file.filename,
            size: file.size,
            uploadedAt: new Date().toISOString()
        };
        images.push(entry);
        return entry;
    });

    fs.writeFileSync(IMAGES_FILE, JSON.stringify(images, null, 2), 'utf-8');
    res.json({ success: true, images: added });
});

// DELETE /api/images/:id
app.delete('/api/images/:id', requireAuth, (req, res) => {
    let images = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf-8'));
    const idx = images.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Image not found' });

    const img = images[idx];
    // Delete file from disk — strip 'admin/' prefix (__dirname already is admin/)
    const uploadRelPath = img.path.replace(/^admin[\/\\]?/, '');
    const filePath = path.join(__dirname, uploadRelPath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    images.splice(idx, 1);
    fs.writeFileSync(IMAGES_FILE, JSON.stringify(images, null, 2), 'utf-8');
    res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
//  CONTENT MANAGEMENT API
// ══════════════════════════════════════════════════════════

// Content registry: defines which elements are editable per module & sub-page
// Structure: { module: { pages: { pageKey: { label, labelZh, items: [...] } } } }
const CONTENT_REGISTRY = {
    home: { pages: {
        index: { label: 'Home Page', labelZh: '首页', items: [
            { key: 'heroQuote', file: 'index.html', selector: '.hero__quote', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Quote' },
            { key: 'heroCta', file: 'index.html', selector: '.hero__cta .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero CTA Button' },
            { key: 'heroScroll', file: 'index.html', selector: '.hero__scroll', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Scroll Indicator' },
            { key: 'productsLabel', file: 'index.html', selector: '#products .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Products Section Label' },
            { key: 'productsTitle', file: 'index.html', selector: '#products .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Products Section Title' },
            { key: 'card1Label', file: 'index.html', selector: '.product-card:nth-child(1) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 1 Label (Spring)' },
            { key: 'card1Title', file: 'index.html', selector: '.product-card:nth-child(1) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 1 Title (Spring)' },
            { key: 'card2Label', file: 'index.html', selector: '.product-card:nth-child(2) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 2 Label (Autumn)' },
            { key: 'card2Title', file: 'index.html', selector: '.product-card:nth-child(2) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 2 Title (Autumn)' },
            { key: 'card3Label', file: 'index.html', selector: '.product-card:nth-child(3) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 3 Label (Holiday)' },
            { key: 'card3Title', file: 'index.html', selector: '.product-card:nth-child(3) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 3 Title (Holiday)' },
            { key: 'globalLabel', file: 'index.html', selector: '.global-reach .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Global Reach Label' },
            { key: 'globalTitle', file: 'index.html', selector: '.global-reach .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Global Reach Title' },
            { key: 'testimonialsLabel', file: 'index.html', selector: '.testimonials .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Testimonials Label' },
            { key: 'testimonialsTitle', file: 'index.html', selector: '.testimonials .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Testimonials Title' },
            { key: 'ecoTitle', file: 'index.html', selector: 'section.section:not(.section--cream) .split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Eco-Friendly Title' },
            { key: 'ecoP1', file: 'index.html', selector: 'section.section:not(.section--cream) .split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Eco-Friendly Paragraph 1' },
            { key: 'ecoP2', file: 'index.html', selector: 'section.section:not(.section--cream) .split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Eco-Friendly Paragraph 2' },
            { key: 'ecoBtn', file: 'index.html', selector: 'section.section:not(.section--cream) .split__content .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'Eco-Friendly Button' },
            { key: 'sustTitle', file: 'index.html', selector: 'section.section--cream .split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Sustainability Journey Title' },
            { key: 'sustP1', file: 'index.html', selector: 'section.section--cream .split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Sustainability Journey Paragraph 1' },
            { key: 'sustP2', file: 'index.html', selector: 'section.section--cream .split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Sustainability Journey Paragraph 2' },
            { key: 'sustBtn', file: 'index.html', selector: 'section.section--cream .split__content .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'Sustainability Journey Button' },
            { key: 'impactLabel', file: 'index.html', selector: '.impact .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Impact Label' },
            { key: 'impactTitle', file: 'index.html', selector: '.impact .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Impact Title' },
            { key: 'peopleLabel', file: 'index.html', selector: '#people .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'People Label' },
            { key: 'peopleTitle', file: 'index.html', selector: '#people .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'People Title' },
            { key: 'peopleSubtitle', file: 'index.html', selector: '#people .section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'People Subtitle' },
            { key: 'ctaTitle', file: 'index.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Banner Title' },
            { key: 'ctaP', file: 'index.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Banner Text' },
            { key: 'ctaBtn', file: 'index.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]}
    }},
    products: { pages: {
        index: { label: 'Main Page', labelZh: '产品主页面', items: [
            { key: 'bannerBreadcrumb', file: 'products/index.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'products/index.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'sectionLabel', file: 'products/index.html', selector: '.section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Categories Section Label' },
            { key: 'sectionTitle', file: 'products/index.html', selector: '.section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Categories Section Title' },
            { key: 'sectionSubtitle', file: 'products/index.html', selector: '.section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'Categories Section Subtitle' },
            { key: 'card1Label', file: 'products/index.html', selector: '.product-card:nth-child(1) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 1 Label (Spring)' },
            { key: 'card1Title', file: 'products/index.html', selector: '.product-card:nth-child(1) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 1 Title (Spring)' },
            { key: 'card2Label', file: 'products/index.html', selector: '.product-card:nth-child(2) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 2 Label (Autumn)' },
            { key: 'card2Title', file: 'products/index.html', selector: '.product-card:nth-child(2) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 2 Title (Autumn)' },
            { key: 'card3Label', file: 'products/index.html', selector: '.product-card:nth-child(3) .product-card__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 3 Label (Holiday)' },
            { key: 'card3Title', file: 'products/index.html', selector: '.product-card:nth-child(3) .product-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Card 3 Title (Holiday)' },
            { key: 'splitTitle', file: 'products/index.html', selector: '.split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Inspired by Nature Title' },
            { key: 'splitP', file: 'products/index.html', selector: '.split__content p', attr: 'data-en', zhAttr: 'data-zh', label: 'Inspired by Nature Paragraph' },
            { key: 'split2Title', file: 'products/index.html', selector: '.split--reverse .split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Craftsmanship Title' },
            { key: 'split2P1', file: 'products/index.html', selector: '.split--reverse .split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Craftsmanship Paragraph 1' },
            { key: 'split2P2', file: 'products/index.html', selector: '.split--reverse .split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Craftsmanship Paragraph 2' },
            { key: 'ctaTitle', file: 'products/index.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/index.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/index.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]},
        'floral-plants': { label: 'Floral, Plants & Greeneries', labelZh: '仿真花卉、植物与绿色植物', items: [
            { key: 'bannerBreadcrumb', file: 'products/floral-plants.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'products/floral-plants.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'sectionLabel', file: 'products/floral-plants.html', selector: '.section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Label' },
            { key: 'sectionTitle', file: 'products/floral-plants.html', selector: '.section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Title' },
            { key: 'sectionSubtitle', file: 'products/floral-plants.html', selector: '.section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Subtitle' },
            { key: 'ctaTitle', file: 'products/floral-plants.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/floral-plants.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/floral-plants.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
            { key: 'galleryNote', file: 'products/floral-plants.html', selector: '.section--cream .container > div:last-child p', attr: 'data-en', zhAttr: 'data-zh', label: 'Gallery Note' },
        ]},
        'home-decor': { label: 'Autumn Collection', labelZh: '秋季系列', items: [
            { key: 'bannerBreadcrumb', file: 'products/home-decor.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'products/home-decor.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'sectionLabel', file: 'products/home-decor.html', selector: '.section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Label' },
            { key: 'sectionTitle', file: 'products/home-decor.html', selector: '.section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Title' },
            { key: 'sectionSubtitle', file: 'products/home-decor.html', selector: '.section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Subtitle' },
            { key: 'ctaTitle', file: 'products/home-decor.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/home-decor.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/home-decor.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
            { key: 'galleryNote', file: 'products/home-decor.html', selector: '.section--cream .container > div:last-child p', attr: 'data-en', zhAttr: 'data-zh', label: 'Gallery Note' },
        ]},
        'seasonal-festive': { label: 'Seasonal & Festive Décor', labelZh: '节庆装饰系列', items: [
            { key: 'bannerBreadcrumb', file: 'products/seasonal-festive.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'products/seasonal-festive.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'sectionLabel', file: 'products/seasonal-festive.html', selector: '.section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Label' },
            { key: 'sectionTitle', file: 'products/seasonal-festive.html', selector: '.section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Title' },
            { key: 'sectionSubtitle', file: 'products/seasonal-festive.html', selector: '.section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Subtitle' },
            { key: 'ctaTitle', file: 'products/seasonal-festive.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/seasonal-festive.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/seasonal-festive.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
            { key: 'galleryNote', file: 'products/seasonal-festive.html', selector: '.section--cream .container > div:last-child p', attr: 'data-en', zhAttr: 'data-zh', label: 'Gallery Note' },
        ]},
        'halloween': { label: 'Halloween Collection', labelZh: '万圣节系列', items: [
            { key: 'festBadge', file: 'products/halloween.html', selector: '.fest-hero__badge', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Badge' },
            { key: 'festTitle', file: 'products/halloween.html', selector: '.fest-hero__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Title' },
            { key: 'festSub', file: 'products/halloween.html', selector: '.fest-hero__sub', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Subtitle' },
            { key: 'festDesc', file: 'products/halloween.html', selector: '.fest-hero__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Description' },
            { key: 'ctaTitle', file: 'products/halloween.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/halloween.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/halloween.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]},
        'christmas': { label: 'Christmas Collection', labelZh: '圣诞系列', items: [
            { key: 'festBadge', file: 'products/christmas.html', selector: '.fest-hero__badge', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Badge' },
            { key: 'festTitle', file: 'products/christmas.html', selector: '.fest-hero__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Title' },
            { key: 'festSub', file: 'products/christmas.html', selector: '.fest-hero__sub', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Subtitle' },
            { key: 'festDesc', file: 'products/christmas.html', selector: '.fest-hero__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Description' },
            { key: 'galleryNote', file: 'products/christmas.html', selector: '.section--cream .container > div:last-child p', attr: 'data-en', zhAttr: 'data-zh', label: 'Gallery Note' },
            { key: 'ctaTitle', file: 'products/christmas.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'products/christmas.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'products/christmas.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]}
    }},
    sustainability: { pages: {
        index: { label: 'Our Breakthroughs', labelZh: '我们的突破', items: [
            { key: 'bannerBreadcrumb', file: 'sustainability/index.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'sustainability/index.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'sectionLabel', file: 'sustainability/index.html', selector: '.section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Label' },
            { key: 'sectionTitle', file: 'sustainability/index.html', selector: '.section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Section Title' },
            { key: 'ctaTitle', file: 'sustainability/index.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'sustainability/index.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
        ]},
        'climate-change': { label: 'Climate Change', labelZh: '气候变化', items: [
            { key: 'bannerBreadcrumb', file: 'sustainability/climate-change.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'sustainability/climate-change.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'commitTitle', file: 'sustainability/climate-change.html', selector: '.split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Title' },
            { key: 'commitP1', file: 'sustainability/climate-change.html', selector: '.split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Paragraph 1' },
            { key: 'commitP2', file: 'sustainability/climate-change.html', selector: '.split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Paragraph 2' },
            { key: 'sectionTitle', file: 'sustainability/climate-change.html', selector: '.section--cream .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Actions Title' },
            { key: 'action1', file: 'sustainability/climate-change.html', selector: '.innovation-item:nth-child(1) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 1 Title' },
            { key: 'action2', file: 'sustainability/climate-change.html', selector: '.innovation-item:nth-child(2) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 2 Title' },
            { key: 'action3', file: 'sustainability/climate-change.html', selector: '.innovation-item:nth-child(3) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 3 Title' },
            { key: 'action4', file: 'sustainability/climate-change.html', selector: '.innovation-item:nth-child(4) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 4 Title' },
            { key: 'ctaTitle', file: 'sustainability/climate-change.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'sustainability/climate-change.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
        ]},
        'sustainable-materials': { label: 'Sustainable Materials', labelZh: '可持续物料', items: [
            { key: 'bannerBreadcrumb', file: 'sustainability/sustainable-materials.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'sustainability/sustainable-materials.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'matTitle', file: 'sustainability/sustainable-materials.html', selector: '.split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Rethinking Materials Title' },
            { key: 'matP1', file: 'sustainability/sustainable-materials.html', selector: '.split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Rethinking Materials Paragraph 1' },
            { key: 'matP2', file: 'sustainability/sustainable-materials.html', selector: '.split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Rethinking Materials Paragraph 2' },
            { key: 'sectionTitle', file: 'sustainability/sustainable-materials.html', selector: '.section--cream .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Material Solutions Title' },
            { key: 'matCard1Title', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(1) .sus-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 1 Title' },
            { key: 'matCard1Desc', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(1) .sus-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 1 Description' },
            { key: 'matCard2Title', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(2) .sus-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 2 Title' },
            { key: 'matCard2Desc', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(2) .sus-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 2 Description' },
            { key: 'matCard3Title', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(3) .sus-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 3 Title' },
            { key: 'matCard3Desc', file: 'sustainability/sustainable-materials.html', selector: '.sus-card:nth-child(3) .sus-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Material 3 Description' },
            { key: 'ctaTitle', file: 'sustainability/sustainable-materials.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'sustainability/sustainable-materials.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
        ]},
        'green-manufacturing': { label: 'Green Manufacturing', labelZh: '绿色生产', items: [
            { key: 'bannerBreadcrumb', file: 'sustainability/green-manufacturing.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'sustainability/green-manufacturing.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'commitTitle', file: 'sustainability/green-manufacturing.html', selector: '.split__content h2', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Title' },
            { key: 'commitP1', file: 'sustainability/green-manufacturing.html', selector: '.split__content p:first-of-type', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Paragraph 1' },
            { key: 'commitP2', file: 'sustainability/green-manufacturing.html', selector: '.split__content p:nth-of-type(2)', attr: 'data-en', zhAttr: 'data-zh', label: 'Commitment Paragraph 2' },
            { key: 'sectionTitle', file: 'sustainability/green-manufacturing.html', selector: '.section--cream .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Actions Title' },
            { key: 'action1', file: 'sustainability/green-manufacturing.html', selector: '.innovation-item:nth-child(1) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 1 Title' },
            { key: 'action2', file: 'sustainability/green-manufacturing.html', selector: '.innovation-item:nth-child(2) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 2 Title' },
            { key: 'action3', file: 'sustainability/green-manufacturing.html', selector: '.innovation-item:nth-child(3) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 3 Title' },
            { key: 'action4', file: 'sustainability/green-manufacturing.html', selector: '.innovation-item:nth-child(4) .innovation-item__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Action 4 Title' },
            { key: 'ctaTitle', file: 'sustainability/green-manufacturing.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'sustainability/green-manufacturing.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
        ]}
    }},
    contact: { pages: {
        index: { label: 'Contact Us', labelZh: '联系我们', items: [
            { key: 'bannerBreadcrumb', file: 'contact/index.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'contact/index.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'formNameLabel', file: 'contact/index.html', selector: '.contact-form__group:nth-of-type(1) .contact-form__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Form Label 1 (Name)' },
            { key: 'formNamePh', file: 'contact/index.html', selector: '.contact-form__input[name="name"]', attr: 'data-en-placeholder', zhAttr: 'data-zh-placeholder', label: 'Form Placeholder 1 (Name)' },
            { key: 'formEmailLabel', file: 'contact/index.html', selector: '.contact-form__group:nth-of-type(2) .contact-form__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Form Label 2 (Email)' },
            { key: 'formEmailPh', file: 'contact/index.html', selector: '.contact-form__input[name="email"]', attr: 'data-en-placeholder', zhAttr: 'data-zh-placeholder', label: 'Form Placeholder 2 (Email)' },
            { key: 'formSubjectLabel', file: 'contact/index.html', selector: '.contact-form__group:nth-of-type(3) .contact-form__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Form Label 3 (Subject)' },
            { key: 'formSubjectPh', file: 'contact/index.html', selector: '.contact-form__input[name="subject"]', attr: 'data-en-placeholder', zhAttr: 'data-zh-placeholder', label: 'Form Placeholder 3 (Subject)' },
            { key: 'formMessageLabel', file: 'contact/index.html', selector: '.contact-form__group:nth-of-type(4) .contact-form__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Form Label 4 (Message)' },
            { key: 'formMessagePh', file: 'contact/index.html', selector: '.contact-form__textarea', attr: 'data-en-placeholder', zhAttr: 'data-zh-placeholder', label: 'Form Placeholder 4 (Message)' },
            { key: 'formSubmit', file: 'contact/index.html', selector: '.contact-form__submit', attr: 'data-en', zhAttr: 'data-zh', label: 'Submit Button' },
            { key: 'infoTitle', file: 'contact/index.html', selector: '.contact-info-card h3', attr: 'data-en', zhAttr: 'data-zh', label: 'Info Card Title' },
            { key: 'hkTitle', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(1) strong', attr: 'data-en', zhAttr: 'data-zh', label: 'Office 1 Name (HK)' },
            { key: 'hkAddr', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(1) p[data-en-html]', attr: 'data-en-html', zhAttr: 'data-zh-html', label: 'Office 1 Address (HK)' },
            { key: 'hkNote', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(1) p:last-child', attr: 'data-en', zhAttr: 'data-zh', label: 'Office 1 Wholesale Note' },
            { key: 'chinaTitle', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(2) strong', attr: 'data-en', zhAttr: 'data-zh', label: 'Office 2 Name (China)' },
            { key: 'chinaAddr', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(2) p[data-en-html]', attr: 'data-en-html', zhAttr: 'data-zh-html', label: 'Office 2 Address (China)' },
            { key: 'genTitle', file: 'contact/index.html', selector: '.contact-info__item:nth-of-type(3) strong', attr: 'data-en', zhAttr: 'data-zh', label: 'Office 3 Name (General Enquiries)' },
            { key: 'ctaTitle', file: 'contact/index.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'contact/index.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'contact/index.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]}
    }},
    about: { pages: {
        index: { label: 'Corporate Overview', labelZh: '企业概况', items: [
            { key: 'heroLabel', file: 'about/index.html', selector: '.overview-hero .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Label' },
            { key: 'heroTitle', file: 'about/index.html', selector: '.overview-hero__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Hero Title' },
            { key: 'businessLabel', file: 'about/index.html', selector: '.section--cream .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Business Section Label' },
            { key: 'businessTitle', file: 'about/index.html', selector: '.section--cream .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business Section Title' },
            { key: 'biz1Title', file: 'about/index.html', selector: '.biz-card:nth-child(1) .biz-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 1 Title' },
            { key: 'biz1Desc', file: 'about/index.html', selector: '.biz-card:nth-child(1) .biz-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 1 Description' },
            { key: 'biz2Title', file: 'about/index.html', selector: '.biz-card:nth-child(2) .biz-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 2 Title' },
            { key: 'biz2Desc', file: 'about/index.html', selector: '.biz-card:nth-child(2) .biz-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 2 Description' },
            { key: 'biz3Title', file: 'about/index.html', selector: '.biz-card:nth-child(3) .biz-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 3 Title' },
            { key: 'biz3Desc', file: 'about/index.html', selector: '.biz-card:nth-child(3) .biz-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 3 Description' },
            { key: 'biz4Title', file: 'about/index.html', selector: '.biz-card:nth-child(4) .biz-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 4 Title' },
            { key: 'biz4Desc', file: 'about/index.html', selector: '.biz-card:nth-child(4) .biz-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 4 Description' },
            { key: 'biz5Title', file: 'about/index.html', selector: '.biz-card:nth-child(5) .biz-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 5 Title' },
            { key: 'biz5Desc', file: 'about/index.html', selector: '.biz-card:nth-child(5) .biz-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Business 5 Description' },
            { key: 'valuesLabel', file: 'about/index.html', selector: 'section.section:not(.section--cream) .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Values Section Label' },
            { key: 'valuesTitle', file: 'about/index.html', selector: 'section.section:not(.section--cream) .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Values Section Title' },
            { key: 'val1Title', file: 'about/index.html', selector: '.value-card:nth-child(1) .value-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Value 1 Title' },
            { key: 'val1Desc', file: 'about/index.html', selector: '.value-card:nth-child(1) .value-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Value 1 Description' },
            { key: 'val2Title', file: 'about/index.html', selector: '.value-card:nth-child(2) .value-card__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Value 2 Title' },
            { key: 'val2Desc', file: 'about/index.html', selector: '.value-card:nth-child(2) .value-card__desc', attr: 'data-en', zhAttr: 'data-zh', label: 'Value 2 Description' },
            { key: 'quoteText', file: 'about/index.html', selector: '.quote-band__text', attr: 'data-en', zhAttr: 'data-zh', label: 'Quote Text' },
            { key: 'quoteSub', file: 'about/index.html', selector: '.quote-band__sub', attr: 'data-en', zhAttr: 'data-zh', label: 'Quote Subtext' },
            { key: 'ctaTitle', file: 'about/index.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'about/index.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'about/index.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]},
        history: { label: 'History & Milestones', labelZh: '历史与里程碑', items: [
            { key: 'bannerBreadcrumb', file: 'about/history.html', selector: '.page-banner__breadcrumb', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Breadcrumb' },
            { key: 'bannerTitle', file: 'about/history.html', selector: '.page-banner__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Banner Title' },
            { key: 'journeyLabel', file: 'about/history.html', selector: 'section.section:not(.section--cream) .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Journey Label' },
            { key: 'journeyTitle', file: 'about/history.html', selector: 'section.section:not(.section--cream) .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Journey Title' },
            { key: 'journeySubtitle', file: 'about/history.html', selector: 'section.section:not(.section--cream) .section__subtitle', attr: 'data-en', zhAttr: 'data-zh', label: 'Journey Subtitle' },
            { key: 'keyYear1', file: 'about/history.html', selector: '.key-years__item:nth-child(1) .key-years__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Year 1980' },
            { key: 'keyYear2', file: 'about/history.html', selector: '.key-years__item:nth-child(2) .key-years__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Year 1984' },
            { key: 'keyYear3', file: 'about/history.html', selector: '.key-years__item:nth-child(3) .key-years__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Year 2006' },
            { key: 'keyYear4', file: 'about/history.html', selector: '.key-years__item:nth-child(4) .key-years__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Key Year 2013' },
            { key: 'timelineLabel', file: 'about/history.html', selector: '.section--cream .section__label', attr: 'data-en', zhAttr: 'data-zh', label: 'Timeline Label' },
            { key: 'timelineTitle', file: 'about/history.html', selector: '.section--cream .section__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Timeline Title' },
            { key: 'era1Period', file: 'about/history.html', selector: '.timeline__item:nth-child(1) .timeline__period', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 1 Period' },
            { key: 'era1Title', file: 'about/history.html', selector: '.timeline__item:nth-child(1) .timeline__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 1 Title' },
            { key: 'era1Text', file: 'about/history.html', selector: '.timeline__item:nth-child(1) .timeline__text', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 1 Text' },
            { key: 'era2Period', file: 'about/history.html', selector: '.timeline__item:nth-child(2) .timeline__period', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 2 Period' },
            { key: 'era2Title', file: 'about/history.html', selector: '.timeline__item:nth-child(2) .timeline__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 2 Title' },
            { key: 'era2Text', file: 'about/history.html', selector: '.timeline__item:nth-child(2) .timeline__text', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 2 Text' },
            { key: 'era3Period', file: 'about/history.html', selector: '.timeline__item:nth-child(3) .timeline__period', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 3 Period' },
            { key: 'era3Title', file: 'about/history.html', selector: '.timeline__item:nth-child(3) .timeline__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 3 Title' },
            { key: 'era3Text', file: 'about/history.html', selector: '.timeline__item:nth-child(3) .timeline__text', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 3 Text' },
            { key: 'era4Period', file: 'about/history.html', selector: '.timeline__item:nth-child(4) .timeline__period', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 4 Period' },
            { key: 'era4Title', file: 'about/history.html', selector: '.timeline__item:nth-child(4) .timeline__title', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 4 Title' },
            { key: 'era4Text', file: 'about/history.html', selector: '.timeline__item:nth-child(4) .timeline__text', attr: 'data-en', zhAttr: 'data-zh', label: 'Era 4 Text' },
            { key: 'ctaTitle', file: 'about/history.html', selector: '.cta-banner h2', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Title' },
            { key: 'ctaP', file: 'about/history.html', selector: '.cta-banner p', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Text' },
            { key: 'ctaBtn', file: 'about/history.html', selector: '.cta-banner .btn', attr: 'data-en', zhAttr: 'data-zh', label: 'CTA Button' },
        ]}
    }}
};

// GET  /api/content/:module  — get editable content (with optional ?page= sub-page filter)
app.get('/api/content/:module', requireAuth, (req, res) => {
    const mod = req.params.module;
    const registry = CONTENT_REGISTRY[mod];
    if (!registry) return res.status(404).json({ error: 'Module not found' });

    const pageParam = req.query.page;
    const cheerio = require('cheerio');

    // Return list of available pages
    const pages = Object.entries(registry.pages).map(([key, pg]) => ({
        key, label: pg.label, labelZh: pg.labelZh, itemCount: pg.items.length
    }));

    // If a specific page is requested, return its items
    if (pageParam) {
        const page = registry.pages[pageParam];
        if (!page) return res.status(404).json({ error: `Page "${pageParam}" not found in module "${mod}"` });

        const items = [];
        for (const item of page.items) {
            const filePath = path.join(ROOT, item.file);
            if (!fs.existsSync(filePath)) continue;
            const html = fs.readFileSync(filePath, 'utf-8');
            const $ = cheerio.load(html);
            const el = $(item.selector).first();
            if (!el.length) continue;
            items.push({
                key: item.key, label: item.label, file: item.file, selector: item.selector,
                en: el.attr(item.attr) || el.text().trim(),
                zh: el.attr(item.zhAttr) || ''
            });
        }
        return res.json({ module: mod, page: pageParam, items, pages });
    }

    // No page specified — return all items from all pages (flat)
    const items = [];
    for (const [pageKey, page] of Object.entries(registry.pages)) {
        for (const item of page.items) {
            const filePath = path.join(ROOT, item.file);
            if (!fs.existsSync(filePath)) continue;
            const html = fs.readFileSync(filePath, 'utf-8');
            const $ = cheerio.load(html);
            const el = $(item.selector).first();
            if (!el.length) continue;
            items.push({
                key: item.key, label: item.label, file: item.file, selector: item.selector,
                page: pageKey, pageLabel: page.label,
                en: el.attr(item.attr) || el.text().trim(),
                zh: el.attr(item.zhAttr) || ''
            });
        }
    }
    res.json({ module: mod, items, pages });
});

// PUT  /api/content/:module  — update content
app.put('/api/content/:module', requireAuth, (req, res) => {
    const mod = req.params.module;
    const registry = CONTENT_REGISTRY[mod];
    if (!registry) return res.status(404).json({ error: 'Module not found' });

    const { key, en, zh } = req.body;

    // Search all pages for the key
    let item = null;
    for (const page of Object.values(registry.pages)) {
        item = page.items.find(i => i.key === key);
        if (item) break;
    }
    if (!item) return res.status(404).json({ error: 'Content item not found' });

    const filePath = path.join(ROOT, item.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'HTML file not found' });

    let html = fs.readFileSync(filePath, 'utf-8');
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const el = $(item.selector).first();
    if (!el.length) return res.status(404).json({ error: 'Element not found in HTML' });

    el.attr(item.attr, en);
    if (item.zhAttr && zh) el.attr(item.zhAttr, zh);
    if (el.children().length === 0) el.text(en);

    fs.writeFileSync(filePath, $.html(), 'utf-8');

    // Sync index.html ↔ website.html
    if (item.file === 'index.html' && fs.existsSync(path.join(ROOT, 'website.html'))) {
        fs.copyFileSync(filePath, path.join(ROOT, 'website.html'));
    } else if (item.file === 'website.html' && fs.existsSync(path.join(ROOT, 'index.html'))) {
        fs.copyFileSync(filePath, path.join(ROOT, 'index.html'));
    }

    res.json({ success: true, message: `Updated "${item.label}" in ${item.file}` });
});

// ══════════════════════════════════════════════════════════
//  IMAGE MOUNTING API
// ══════════════════════════════════════════════════════════

// POST /api/mount-image  — mount an image from library to a page element
app.post('/api/mount-image', requireAuth, (req, res) => {
    const { imageId, filePath, selector, attribute } = req.body;
    if (!imageId || !filePath || !selector) {
        return res.status(400).json({ error: 'imageId, filePath, and selector are required' });
    }

    // Get image from library
    const images = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf-8'));
    const img = images.find(i => i.id === imageId);
    if (!img) return res.status(404).json({ error: 'Image not found in library' });

    // Resolve HTML file
    const htmlPath = path.join(ROOT, filePath);
    if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'HTML file not found' });

    // Copy image to public image directory
    const pubImgDir = path.join(ROOT, 'image', 'products');
    if (!fs.existsSync(pubImgDir)) fs.mkdirSync(pubImgDir, { recursive: true });
    const pubImgPath = path.join(pubImgDir, img.filename);

    // img.path is 'admin/uploads/<filename>' — strip 'admin/' prefix
    const uploadRelPath = img.path.replace(/^admin[\/\\]?/, '');
    const srcUploadPath = path.join(__dirname, uploadRelPath);
    if (fs.existsSync(srcUploadPath)) {
        fs.copyFileSync(srcUploadPath, pubImgPath);
    } else {
        console.log('[mount-image] Source not found:', srcUploadPath, '(img.path=' + img.path + ')');
    }

    // Determine the correct relative path for the HTML file
    const htmlDir = path.dirname(filePath);
    const relImgPath = (htmlDir === '.')
        ? 'image/products/' + img.filename
        : '../image/products/' + img.filename;

    // Update the HTML
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const el = $(selector).first();

    if (!el.length) return res.status(404).json({ error: `Element "${selector}" not found in ${filePath}` });

    const attr = attribute || 'src';
    el.attr(attr, relImgPath);

    fs.writeFileSync(htmlPath, $.html(), 'utf-8');

    // Sync index.html ↔ website.html
    if (filePath === 'index.html') fs.copyFileSync(htmlPath, path.join(ROOT, 'website.html'));
    else if (filePath === 'website.html') fs.copyFileSync(htmlPath, path.join(ROOT, 'index.html'));

    res.json({ success: true, message: `Mounted "${img.originalName}" → ${filePath} ${selector}` });
});

// ══════════════════════════════════════════════════════════
//  PAGE IMAGE SCANNING API
// ══════════════════════════════════════════════════════════

// GET /api/page-images?file=products/floral-plants.html  — scan page for images
app.get('/api/page-images', requireAuth, (req, res) => {
    const filePath = req.query.file;
    if (!filePath) return res.status(400).json({ error: 'file query parameter required' });

    const htmlPath = path.join(ROOT, filePath);
    if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'File not found: ' + filePath });

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const images = [];
    $('img').each((i, el) => {
        const $el = $(el);
        const src = $el.attr('src') || '';
        // Skip header logo and favicon
        if (src.includes('home-icon/') || src.includes('website-icon/')) return;

        // Build a unique selector for this image
        let selector = '';
        const parent = $el.parent();
        const parentClass = parent.attr('class') || '';
        const grandParent = parent.parent();
        const gpClass = grandParent.attr('class') || '';

        if (parentClass) {
            selector = `${parentClass.split(' ')[0]} img`;
        } else if (gpClass) {
            selector = `${gpClass.split(' ')[0]} img`;
        }

        // Try to build a more specific selector
        if ($el.closest('.gallery-grid').length) {
            const idx = $el.closest('.gallery-item').index() + 1;
            selector = `.gallery-item:nth-child(${idx}) img`;
        } else if ($el.closest('.product-card').length) {
            const idx = $el.closest('.product-card').index() + 1;
            selector = `.product-card:nth-child(${idx}) .product-card__img`;
        } else if ($el.closest('.split__image').length) {
            selector = `.split__image img`;
        } else if ($el.closest('.video-card__thumb').length) {
            selector = `.video-card__thumb img`;
        }

        // Determine if local or external
        const isLocal = src.startsWith('image/') || src.startsWith('../image/');
        const isExternal = src.startsWith('http');

        images.push({
            index: i,
            src: src,
            alt: $el.attr('alt') || '',
            selector: selector || `img[src="${src}"]`,
            isLocal: isLocal,
            isExternal: isExternal
        });
    });

    res.json({ file: filePath, images, count: images.length });
});

// ══════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ══════════════════════════════════════════════════════════

app.get('/api/stats', requireAuth, async (req, res) => {
    const images = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf-8'));

    // 询盘统计（Supabase 未配置时返回 null，前端隐藏对应卡片）
    let inquiries = null;
    try {
        const rows = await supabaseRest('GET', 'inquiries?select=id,read');
        inquiries = {
            total: rows.length,
            unread: rows.filter(r => !r.read).length
        };
    } catch (e) {
        inquiries = null;
    }

    res.json({
        totalImages: images.length,
        recentUploads: images.slice(-5).reverse(),
        modules: Object.keys(CONTENT_REGISTRY),
        inquiries
    });
});

// ══════════════════════════════════════════════════════════
//  INQUIRIES API (询盘管理 — 数据存于 Supabase)
// ══════════════════════════════════════════════════════════

const SUPABASE_CONFIG_FILE = path.join(DATA_DIR, 'supabase-config.json');

function getSupabaseConfig() {
    if (!fs.existsSync(SUPABASE_CONFIG_FILE)) return null;
    try {
        const cfg = JSON.parse(fs.readFileSync(SUPABASE_CONFIG_FILE, 'utf-8'));
        if (!cfg.supabaseUrl || !cfg.serviceKey || cfg.serviceKey.startsWith('YOUR-')) return null;
        return cfg;
    } catch (e) {
        return null;
    }
}

async function supabaseRest(method, pathName, body, attempts) {
    const cfg = getSupabaseConfig();
    if (!cfg) {
        const err = new Error('Supabase not configured. Create admin/data/supabase-config.json (see supabase-config.example.json).');
        err.status = 503;
        throw err;
    }
    const headers = {
        'apikey': cfg.serviceKey,
        'Authorization': 'Bearer ' + cfg.serviceKey,
        'Content-Type': 'application/json'
    };
    if (method === 'GET') headers['Accept'] = 'application/json';
    else headers['Prefer'] = 'return=representation';

    const maxTries = attempts || 3;
    let lastErr = null;
    for (let i = 0; i < maxTries; i++) {
        try {
            const res = await fetch(cfg.supabaseUrl + '/rest/v1/' + pathName, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });
            if (res.ok) {
                const text = await res.text();
                return text ? JSON.parse(text) : null;
            }
            const err = new Error('Supabase request failed (HTTP ' + res.status + ')');
            err.status = 502;
            throw err;
        } catch (e) {
            lastErr = e;
            if (i < maxTries - 1) await new Promise(r => setTimeout(r, 1500)); // 网络抖动重试
        }
    }
    throw lastErr;
}

// GET /api/inquiries?unread=1 — 询盘列表（最新在前）
app.get('/api/inquiries', requireAuth, async (req, res) => {
    try {
        let q = 'inquiries?select=*&order=created_at.desc&limit=500';
        if (req.query.unread === '1') q += '&read=eq.false';
        const rows = await supabaseRest('GET', q);
        res.json(rows || []);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// PATCH /api/inquiries/:id — 标记已读/未读 { read: true|false }
app.patch('/api/inquiries/:id', requireAuth, async (req, res) => {
    try {
        const read = !!req.body.read;
        const rows = await supabaseRest('PATCH', 'inquiries?id=eq.' + encodeURIComponent(req.params.id), { read });
        res.json({ success: true, row: rows && rows[0] });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// DELETE /api/inquiries/:id — 删除询盘
app.delete('/api/inquiries/:id', requireAuth, async (req, res) => {
    try {
        await supabaseRest('DELETE', 'inquiries?id=eq.' + encodeURIComponent(req.params.id));
        res.json({ success: true });
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ══════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n  Admin panel running at http://localhost:${PORT}/admin\n`);
        console.log(`  Default login: admin / admin123\n`);
    });
}

// Exported for registry validation (see validate-content.js)
module.exports = { CONTENT_REGISTRY };
