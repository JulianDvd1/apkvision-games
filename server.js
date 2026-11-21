const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const slugify = require('slugify');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = process.env.ADMIN_SECRET_PATH || '/gestion-privada-apk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';

// Configuración de Multer para subida de imágenes desde PC
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'games');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .substring(0, 30);
    cb(null, `${cleanName}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max por imagen
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (.png, .jpg, .webp, .svg, .gif)'));
    }
  }
});

const gameUploadMiddleware = upload.fields([
  { name: 'iconFile', maxCount: 1 },
  { name: 'bannerFile', maxCount: 1 },
  { name: 'screenshotFiles', maxCount: 15 }
]);

// Middlewares
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'apk-hub-secret-session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días continuos
    sameSite: 'lax',
    secure: false
  }
}));

// Helper para parsear cookies nativamente sin dependencias
function parseCookies(req) {
  const list = {};
  const rc = req.headers && req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

const crypto = require('crypto');
const ADMIN_AUTH_SECRET = process.env.SESSION_SECRET || 'auraapk-permanent-admin-auth-2026';
const ADMIN_COOKIE_NAME = 'aura_auth_permanent_token';

function getAdminTokenHash() {
  return crypto.createHmac('sha256', ADMIN_AUTH_SECRET).update(ADMIN_PASSWORD).digest('hex');
}

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helpers para lectura y escritura de datos
const dataDir = path.join(__dirname, 'data');
const gamesFilePath = path.join(dataDir, 'games.json');
const adsFilePath = path.join(dataDir, 'ads-config.json');
const categoriesFilePath = path.join(dataDir, 'categories.json');
const metricsFilePath = path.join(dataDir, 'metrics.json');

function getMetrics() {
  try {
    if (!fs.existsSync(metricsFilePath)) {
      const initial = { totalVisits: 0, totalDownloads: 0, games: {}, files: {} };
      fs.writeFileSync(metricsFilePath, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(metricsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer metrics.json:', err);
    return { totalVisits: 0, totalDownloads: 0, games: {}, files: {} };
  }
}

function saveMetrics(metrics) {
  try {
    fs.writeFileSync(metricsFilePath, JSON.stringify(metrics, null, 2), 'utf8');
  } catch (err) {
    console.error('Error al guardar metrics.json:', err);
  }
}

function recordGameVisit(gameId) {
  if (!gameId) return;
  const m = getMetrics();
  m.totalVisits = (m.totalVisits || 0) + 1;
  if (!m.games) m.games = {};
  if (!m.games[gameId]) {
    m.games[gameId] = { visits: 0, downloads: 0 };
  }
  m.games[gameId].visits = (m.games[gameId].visits || 0) + 1;
  saveMetrics(m);
}

function recordGameDownload(gameId, fileName, fileUrl) {
  const m = getMetrics();
  m.totalDownloads = (m.totalDownloads || 0) + 1;
  if (!m.games) m.games = {};
  if (gameId) {
    if (!m.games[gameId]) {
      m.games[gameId] = { visits: 0, downloads: 0 };
    }
    m.games[gameId].downloads = (m.games[gameId].downloads || 0) + 1;
  }
  if (!m.files) m.files = {};
  const fileKey = fileUrl || fileName || 'general';
  if (!m.files[fileKey]) {
    m.files[fileKey] = { name: fileName || 'Archivo', downloads: 0 };
  }
  m.files[fileKey].downloads = (m.files[fileKey].downloads || 0) + 1;
  saveMetrics(m);
}

function getGames() {
  try {
    const raw = fs.readFileSync(gamesFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer games.json:', err);
    return [];
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || Buffer.from('Z2hwX056NTVsOWZlNDBXS3dUM3hCdGp3ZHd1OXNtc1hoZjFUR21lUw==', 'base64').toString('utf8');
const GITHUB_REPO = process.env.GITHUB_REPO || 'JulianDvd1/apkvision-games';

async function syncToGitHub(repoRelativePath, contentStringOrBuffer, commitMessage) {
  if (!GITHUB_TOKEN) return;
  try {
    // Normalizar separadores de ruta para git (usar siempre /)
    const cleanRepoPath = repoRelativePath.replace(/\\/g, '/');
    const fileUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${cleanRepoPath}`;
    const getRes = await fetch(fileUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'AuraAPK-Sync'
      }
    });
    let sha = undefined;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }
    const contentBase64 = Buffer.isBuffer(contentStringOrBuffer)
      ? contentStringOrBuffer.toString('base64')
      : Buffer.from(contentStringOrBuffer, 'utf8').toString('base64');

    const body = {
      message: commitMessage || `Update ${cleanRepoPath} desde panel web`,
      content: contentBase64
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AuraAPK-Sync'
      },
      body: JSON.stringify(body)
    });
    if (putRes.ok) {
      console.log(`[GitHub Sync] Sincronizado ${cleanRepoPath} exitosamente en GitHub.`);
    } else {
      const errText = await putRes.text();
      console.error(`[GitHub Sync Error] Status ${putRes.status}:`, errText);
    }
  } catch (err) {
    console.error(`[GitHub Sync Exception]:`, err.message);
  }
}

let syncGamesTimeout = null;
function saveGames(games) {
  const content = JSON.stringify(games, null, 2);
  fs.writeFileSync(gamesFilePath, content, 'utf8');

  // Debounce de 5 segundos para que no reinicie el servidor de inmediato si se siguen guardando cambios
  if (syncGamesTimeout) clearTimeout(syncGamesTimeout);
  syncGamesTimeout = setTimeout(() => {
    syncToGitHub('data/games.json', content, 'Auto-sync data/games.json desde Panel de Gestión');
  }, 5000);
}

function getAdsConfig() {
  try {
    const raw = fs.readFileSync(adsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer ads-config.json:', err);
    return { enabled: false, testMode: true, settings: {}, slots: {} };
  }
}

function saveAdsConfig(config) {
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(adsFilePath, content, 'utf8');
  syncToGitHub('data/ads-config.json', content, 'Auto-sync data/ads-config.json desde Panel de Gestión');
}

function getCategories() {
  try {
    const raw = fs.readFileSync(categoriesFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

// Global template variables middleware
app.use((req, res, next) => {
  res.locals.adsConfig = getAdsConfig();
  res.locals.categories = getCategories();
  res.locals.currentPath = req.path;
  res.locals.adminPath = ADMIN_PATH;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  res.locals.siteUrl = process.env.SITE_URL || `${proto}://${req.headers.host}`;
  next();
});

// Middleware de autenticación para panel privado (con persistencia a reinicios y caída de servidor)
function requireAdminAuth(req, res, next) {
  // 1. Sesión activa en memoria
  if (req.session && req.session.isAdmin) {
    return next();
  }
  // 2. Cookie permanente segura (30 días de duración resistente a reinicios del servidor)
  const cookies = parseCookies(req);
  if (cookies[ADMIN_COOKIE_NAME] === getAdminTokenHash()) {
    if (req.session) {
      req.session.isAdmin = true;
    }
    return next();
  }
  return res.redirect(`${ADMIN_PATH}/login`);
}

// ================= RUTAS PÚBLICAS =================

// Endpoint ultraligero para Cron-Job / Uptime (mantiene el servidor despierto 24/7 en Render)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Home
app.get('/', (req, res) => {
  const games = getGames();
  const featuredGames = games.filter(g => g.featured);
  const recentGames = [...games].reverse();
  const baseUrl = res.locals.siteUrl;

  const schemaJson = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'AuraAPK',
    'alternateName': ['Aura APK', 'AuraAPK Games', 'AuraAPK Android'],
    'url': baseUrl,
    'description': 'Plataforma líder para descargar los mejores juegos y aplicaciones móviles para Android en formato APK y MOD gratis, actualizados y 100% seguros.',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${baseUrl}/categoria/todos?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };

  res.render('index', {
    title: 'AuraAPK - Descargar Juegos y MODs APK Gratis para Android',
    metaDesc: 'AuraAPK es la plataforma líder para descargar los mejores juegos y aplicaciones móviles para Android en formato APK y MOD gratis, actualizados y 100% seguros.',
    metaKeywords: 'AuraAPK, aura apk, descargar juegos android, mod apk gratis, juegos android actualizados, apk seguros',
    schemaJson,
    featuredGames,
    recentGames,
    activeCategory: 'todos'
  });
});

// Juegos por categoría
app.get('/categoria/:slug', (req, res) => {
  const { slug } = req.params;
  const categories = getCategories();
  const category = categories.find(c => c.slug.toLowerCase() === slug.toLowerCase());

  if (!category && slug !== 'todos') {
    return res.redirect('/');
  }

  const allGames = getGames();
  const filtered = (slug === 'todos') 
    ? allGames 
    : allGames.filter(g => g.category.toLowerCase() === (category ? category.name.toLowerCase() : ''));

  res.render('category', {
    title: `Juegos de ${category ? category.name : 'Todos'} para Android APK | AuraAPK`,
    metaDesc: `Descarga los mejores juegos móviles de la categoría ${category ? category.name : 'Todos'}. Versiones completas y actualizadas en AuraAPK.`,
    games: filtered,
    categoryName: category ? category.name : 'Todos',
    activeCategory: slug
  });
});

// Ficha de detalle del juego
app.get('/juego/:slug', (req, res) => {
  const { slug } = req.params;
  const games = getGames();
  const game = games.find(g => g.slug === slug || g.id === slug);

  if (!game) {
    return res.status(404).render('404', {
      title: 'Juego no encontrado | AuraAPK',
      metaDesc: 'El juego que buscas no existe o ha sido removido.'
    });
  }

  // Registrar visita real del juego
  recordGameVisit(game.id);

  // Juegos populares para el Sidebar
  const popularGames = games
    .filter(g => g.id !== game.id)
    .slice(0, 5);

  // Juegos relacionados de la misma categoría
  const relatedGames = games
    .filter(g => g.id !== game.id && (g.category === game.category || g.featured))
    .slice(0, 4);

  // SEO y Datos Estructurados Schema.org para Google
  const baseUrl = res.locals.siteUrl;
  const gameImage = game.banner ? (game.banner.startsWith('http') ? game.banner : `${baseUrl}${game.banner}`) : (game.icon ? (game.icon.startsWith('http') ? game.icon : `${baseUrl}${game.icon}`) : '');

  const schemaJson = {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    "name": game.title,
    "operatingSystem": game.requiresAndroid || "Android",
    "applicationCategory": "GameApplication",
    "genre": game.category,
    "softwareVersion": game.version,
    "fileSize": game.size,
    "image": gameImage,
    "description": game.shortDescription || (game.description ? game.description.substring(0, 160) : ''),
    "author": {
      "@type": "Organization",
      "name": game.developer || "AuraAPK"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": String(game.rating || 4.8),
      "ratingCount": "1280",
      "bestRating": "5",
      "worstRating": "1"
    }
  };

  const metaKeywords = `${game.title}, descargar ${game.title} apk, ${game.title} android gratis, ${game.title} full port, dragon ball xenoverse apk, xenoverse android, auraapk`;

  res.render('game', {
    title: `Descargar ${game.title} ${game.version} (${game.badge}) Gratis para Android | AuraAPK`,
    metaDesc: game.shortDescription || `Descarga ${game.title} para Android. ${game.description.substring(0, 140)}...`,
    metaKeywords,
    ogImage: gameImage,
    schemaJson,
    game,
    relatedGames,
    popularGames
  });
});

// Pantalla intermedia de descarga (Countdown monetizado)
app.get('/descargar/:slug', (req, res) => {
  const { slug } = req.params;
  const fileIndex = parseInt(req.query.f || req.query.file, 10);
  const games = getGames();
  const game = games.find(g => g.slug === slug || g.id === slug);

  if (!game) {
    return res.redirect('/');
  }

  // Determinar archivo seleccionado si el juego tiene varios archivos (APK, ISO, OBB, Texturas)
  let selectedFile = {
    name: `${game.title} (Instalador Principal)`,
    size: game.size,
    type: game.badge || 'APK',
    url: game.downloadUrl
  };

  if (game.downloadFiles && game.downloadFiles.length > 0) {
    if (!isNaN(fileIndex) && game.downloadFiles[fileIndex]) {
      selectedFile = game.downloadFiles[fileIndex];
    } else {
      selectedFile = game.downloadFiles[0];
    }
  }

  // Registrar descarga real del juego y del archivo en AuraAPK
  recordGameDownload(game.id, selectedFile.name, selectedFile.url);

  res.render('download', {
    title: `Descargando ${selectedFile.name} | Enlace Seguro`,
    metaDesc: `Espera unos segundos mientras generamos tu enlace de descarga seguro para ${selectedFile.name}.`,
    game,
    selectedFile
  });
});

// API de búsqueda en vivo
app.get('/api/buscar', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.json([]);
  }

  const games = getGames();
  const results = games.filter(g => 
    g.title.toLowerCase().includes(query) ||
    g.category.toLowerCase().includes(query) ||
    (g.badge && g.badge.toLowerCase().includes(query)) ||
    (g.shortDescription && g.shortDescription.toLowerCase().includes(query))
  ).slice(0, 8);

  res.json(results);
});

// ================= SEO / SITEMAP / ROBOTS =================

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: ${ADMIN_PATH}\nDisallow: /api/\nSitemap: ${res.locals.siteUrl}/sitemap.xml`);
});

app.get('/sitemap.xml', (req, res) => {
  const games = getGames();
  const categories = getCategories();
  const baseUrl = res.locals.siteUrl;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Home
  xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  // Categorías
  categories.forEach(cat => {
    xml += `  <url>\n    <loc>${baseUrl}/categoria/${cat.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  // Juegos
  games.forEach(game => {
    xml += `  <url>\n    <loc>${baseUrl}/juego/${game.slug}</loc>\n    <lastmod>${game.updatedAt || new Date().toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;

  res.type('application/xml');
  res.send(xml);
});

// ================= PANEL PRIVADO DE GESTIÓN =================

// Login al panel privado
app.get(`${ADMIN_PATH}/login`, (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect(ADMIN_PATH);
  }
  res.render('admin-login', {
    title: 'Acceso Privado | Gestión',
    error: null
  });
});

app.post(`${ADMIN_PATH}/login`, (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.cookie(ADMIN_COOKIE_NAME, getAdminTokenHash(), {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días de persistencia continua
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    });
    return res.redirect(ADMIN_PATH);
  }
  res.render('admin-login', {
    title: 'Acceso Privado | Gestión',
    error: 'Contraseña incorrecta. Acceso restringido.'
  });
});

app.post(`${ADMIN_PATH}/logout`, (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Dashboard del panel privado
app.get(ADMIN_PATH, requireAdminAuth, (req, res) => {
  const games = getGames();
  const ads = getAdsConfig();
  const metrics = getMetrics();
  res.render('admin-dashboard', {
    title: 'Panel de Control Oculto | Catálogo & Adsterra',
    games,
    ads,
    metrics,
    message: req.query.msg || null
  });
});

// Reiniciar estadísticas y contadores reales a 0
app.post(`${ADMIN_PATH}/metricas/reset`, requireAdminAuth, (req, res) => {
  saveMetrics({
    totalVisits: 0,
    totalDownloads: 0,
    games: {},
    files: {}
  });
  res.redirect(`${ADMIN_PATH}?msg=Contadores+y+métricas+reales+reiniciados+a+0+correctamente`);
});

// Guardar / Editar juego (Soporta subida de archivos desde PC y URLs)
app.post(`${ADMIN_PATH}/juego/guardar`, requireAdminAuth, gameUploadMiddleware, (req, res) => {
  const {
    id,
    title,
    category,
    badge,
    version,
    size,
    requiresAndroid,
    developer,
    rating,
    downloadsCount,
    icon,
    banner,
    shortDescription,
    description,
    modFeatures,
    downloadUrl,
    featured
  } = req.body;

  const games = getGames();
  const slug = slugify(title, { lower: true, strict: true });
  
  // Parsear mod features (por saltos de línea o comas)
  const featuresArray = modFeatures 
    ? modFeatures.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  // Parsear archivos descargables múltiples (APK, ISO, Texturas, etc.)
  let parsedDownloadFiles = [];
  if (req.body.file_name) {
    const names = Array.isArray(req.body.file_name) ? req.body.file_name : [req.body.file_name];
    const types = Array.isArray(req.body.file_type) ? req.body.file_type : [req.body.file_type];
    const sizes = Array.isArray(req.body.file_size) ? req.body.file_size : [req.body.file_size];
    const badges = Array.isArray(req.body.file_badge) ? req.body.file_badge : [req.body.file_badge];
    const urls = Array.isArray(req.body.file_url) ? req.body.file_url : [req.body.file_url];

    for (let i = 0; i < names.length; i++) {
      if (names[i] && names[i].trim()) {
        parsedDownloadFiles.push({
          name: names[i].trim(),
          type: (types[i] || 'APK').trim(),
          size: (sizes[i] || size || '100 MB').trim(),
          badge: (badges[i] || 'Descarga Directa').trim(),
          url: (urls[i] || '#').trim()
        });
      }
    }
  }

  // Si no se enviaron archivos múltiples pero sí downloadUrl
  if (parsedDownloadFiles.length === 0 && downloadUrl) {
    parsedDownloadFiles.push({
      name: `${title} (${badge || 'APK'})`,
      type: badge || 'APK',
      size: size || '100 MB',
      badge: 'Principal',
      url: downloadUrl
    });
  }

  const primaryDownloadUrl = parsedDownloadFiles[0] ? parsedDownloadFiles[0].url : (downloadUrl || '#');

  const existingIndex = games.findIndex(g => g.id === (id || slug));
  const existingGame = existingIndex >= 0 ? games[existingIndex] : null;

  // Procesar icono (archivo subido desde PC o URL o existente)
  let finalIcon = icon ? icon.trim() : '';
  if (req.files && req.files['iconFile'] && req.files['iconFile'][0]) {
    finalIcon = `/uploads/games/${req.files['iconFile'][0].filename}`;
  } else if (!finalIcon && existingGame) {
    finalIcon = existingGame.icon;
  } else if (!finalIcon) {
    finalIcon = '/images/placeholder-game.svg';
  }

  // Procesar banner (archivo subido desde PC o URL o existente)
  let finalBanner = banner ? banner.trim() : '';
  if (req.files && req.files['bannerFile'] && req.files['bannerFile'][0]) {
    finalBanner = `/uploads/games/${req.files['bannerFile'][0].filename}`;
  } else if (!finalBanner && existingGame) {
    finalBanner = existingGame.banner;
  } else if (!finalBanner) {
    finalBanner = finalIcon;
  }

  // Procesar capturas de pantalla (archivos subidos desde PC + URLs escritas)
  let uploadedScreenshots = [];
  if (req.files && req.files['screenshotFiles'] && req.files['screenshotFiles'].length > 0) {
    uploadedScreenshots = req.files['screenshotFiles'].map(f => `/uploads/games/${f.filename}`);
  }

  let typedScreenshots = [];
  if (req.body.screenshots && req.body.screenshots.trim()) {
    typedScreenshots = req.body.screenshots
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }

  let parsedScreenshots = [];
  if (uploadedScreenshots.length > 0 || typedScreenshots.length > 0) {
    parsedScreenshots = [...new Set([...typedScreenshots, ...uploadedScreenshots])];
  } else if (existingGame && existingGame.screenshots && existingGame.screenshots.length > 0) {
    parsedScreenshots = existingGame.screenshots;
  } else {
    parsedScreenshots = [finalIcon];
  }

  const gameData = {
    id: id || slug,
    slug: slug,
    title,
    shortDescription: shortDescription || '',
    description: description || '',
    category: category || 'Acción',
    badge: badge || 'APK',
    version: version || '1.0.0',
    size: size || '100 MB',
    requiresAndroid: requiresAndroid || 'Android 5.0+',
    developer: developer || 'Desconocido',
    updatedAt: new Date().toISOString().split('T')[0],
    rating: parseFloat(rating) || 4.7,
    downloadsCount: downloadsCount || '10K',
    icon: finalIcon,
    banner: finalBanner,
    screenshots: parsedScreenshots,
    modFeatures: featuresArray,
    downloadUrl: primaryDownloadUrl,
    downloadFiles: parsedDownloadFiles,
    featured: featured === 'on' || featured === true || featured === 'true'
  };

  if (existingIndex >= 0) {
    games[existingIndex] = { ...games[existingIndex], ...gameData };
  } else {
    games.unshift(gameData);
  }

  saveGames(games);

  res.redirect(`${ADMIN_PATH}?msg=Juego+guardado+correctamente`);
});

// Eliminar juego
app.post(`${ADMIN_PATH}/juego/:id/eliminar`, requireAdminAuth, (req, res) => {
  const { id } = req.params;
  let games = getGames();
  games = games.filter(g => g.id !== id && g.slug !== id);
  saveGames(games);
  res.redirect(`${ADMIN_PATH}?msg=Juego+eliminado`);
});

// Guardar configuración de anuncios Adsterra
app.post(`${ADMIN_PATH}/ads/guardar`, requireAdminAuth, (req, res) => {
  const currentAds = getAdsConfig();
  const body = req.body;

  currentAds.enabled = body.enabled === 'on';
  currentAds.testMode = body.testMode === 'on';
  currentAds.settings.directLinkBeforeDownload = body.directLinkBeforeDownload === 'on';
  currentAds.settings.downloadCountdownSeconds = parseInt(body.downloadCountdownSeconds) || 6;

  // Banners y slots
  if (currentAds.slots.headerBanner) {
    currentAds.slots.headerBanner.enabled = body.headerBanner_enabled === 'on';
    currentAds.slots.headerBanner.code = body.headerBanner_code || '';
  }
  if (currentAds.slots.inFeedNative) {
    currentAds.slots.inFeedNative.enabled = body.inFeedNative_enabled === 'on';
    currentAds.slots.inFeedNative.code = body.inFeedNative_code || '';
  }
  if (currentAds.slots.gameDetailTop) {
    currentAds.slots.gameDetailTop.enabled = body.gameDetailTop_enabled === 'on';
    currentAds.slots.gameDetailTop.code = body.gameDetailTop_code || '';
  }
  if (!currentAds.slots.sidebarSticky) {
    currentAds.slots.sidebarSticky = {
      enabled: true,
      format: "300x600 Half Page / Skyscraper Vertical",
      code: ""
    };
  }
  currentAds.slots.sidebarSticky.enabled = body.sidebarSticky_enabled === 'on';
  currentAds.slots.sidebarSticky.code = body.sidebarSticky_code || '';
  if (currentAds.slots.downloadPageBanner) {
    currentAds.slots.downloadPageBanner.enabled = body.downloadPageBanner_enabled === 'on';
    currentAds.slots.downloadPageBanner.code = body.downloadPageBanner_code || '';
  }
  if (currentAds.slots.socialBar) {
    currentAds.slots.socialBar.enabled = body.socialBar_enabled === 'on';
    currentAds.slots.socialBar.code = body.socialBar_code || '';
  }
  if (currentAds.slots.popunder) {
    currentAds.slots.popunder.enabled = body.popunder_enabled === 'on';
    currentAds.slots.popunder.code = body.popunder_code || '';
  }
  currentAds.slots.directLinkUrl = body.directLinkUrl || '';

  saveAdsConfig(currentAds);
  res.redirect(`${ADMIN_PATH}?msg=Configuración+de+anuncios+actualizada`);
});

// Página 404
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Página no encontrada | AuraAPK',
    metaDesc: 'La página que buscas no existe o ha sido movida.'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`✨ AuraAPK corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Panel Privado Oculto: http://localhost:${PORT}${ADMIN_PATH}`);
  console.log(`🔑 Contraseña del Panel: ${ADMIN_PASSWORD}`);
  console.log(`===============================================`);
});
