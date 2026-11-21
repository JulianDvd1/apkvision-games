const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');
const slugify = require('slugify');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = process.env.ADMIN_SECRET_PATH || '/gestion-privada-apk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'apk-hub-secret-session',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helpers para lectura y escritura de datos
const dataDir = path.join(__dirname, 'data');
const gamesFilePath = path.join(dataDir, 'games.json');
const adsFilePath = path.join(dataDir, 'ads-config.json');
const categoriesFilePath = path.join(dataDir, 'categories.json');

function getGames() {
  try {
    const raw = fs.readFileSync(gamesFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer games.json:', err);
    return [];
  }
}

function saveGames(games) {
  fs.writeFileSync(gamesFilePath, JSON.stringify(games, null, 2), 'utf8');
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
  fs.writeFileSync(adsFilePath, JSON.stringify(config, null, 2), 'utf8');
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
  res.locals.siteUrl = process.env.SITE_URL || `http://${req.headers.host}`;
  next();
});

// Middleware de autenticación para panel privado
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
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

  res.render('index', {
    title: 'Descargar Juegos Mod APK Gratis para Android | APKVision Hub',
    metaDesc: 'Descarga los mejores juegos y aplicaciones móviles para Android en formato APK y MOD gratis, actualizados y 100% seguros.',
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
    title: `Juegos de ${category ? category.name : 'Todos'} para Android APK | APKVision Hub`,
    metaDesc: `Descarga los mejores juegos móviles de la categoría ${category ? category.name : 'Todos'}. Versiones completas y actualizadas.`,
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
      title: 'Juego no encontrado | APKVision Hub',
      metaDesc: 'El juego que buscas no existe o ha sido removido.'
    });
  }

  // Juegos populares para el Sidebar
  const popularGames = games
    .filter(g => g.id !== game.id)
    .slice(0, 5);

  // Juegos relacionados de la misma categoría
  const relatedGames = games
    .filter(g => g.id !== game.id && (g.category === game.category || g.featured))
    .slice(0, 4);

  res.render('game', {
    title: `${game.title} ${game.version} (${game.badge}) Descargar Gratis APK Android`,
    metaDesc: game.shortDescription || `Descarga ${game.title} para Android. ${game.description.substring(0, 140)}...`,
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
    return res.redirect(ADMIN_PATH);
  }
  res.render('admin-login', {
    title: 'Acceso Privado | Gestión',
    error: 'Contraseña incorrecta. Acceso restringido.'
  });
});

app.post(`${ADMIN_PATH}/logout`, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Dashboard del panel privado
app.get(ADMIN_PATH, requireAdminAuth, (req, res) => {
  const games = getGames();
  const ads = getAdsConfig();
  res.render('admin-dashboard', {
    title: 'Panel de Control Oculto | Catálogo & Adsterra',
    games,
    ads,
    message: req.query.msg || null
  });
});

// Guardar / Editar juego
app.post(`${ADMIN_PATH}/juego/guardar`, requireAdminAuth, (req, res) => {
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
    icon: icon || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80',
    banner: banner || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
    screenshots: [
      icon || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80'
    ],
    modFeatures: featuresArray,
    downloadUrl: downloadUrl || '#',
    featured: featured === 'on' || featured === true || featured === 'true'
  };

  const existingIndex = games.findIndex(g => g.id === (id || slug));
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
    title: '404 - Página no encontrada | APKVision Hub',
    metaDesc: 'La página que buscas no existe o ha sido movida.'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 APK Gaming Hub corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Panel Privado Oculto: http://localhost:${PORT}${ADMIN_PATH}`);
  console.log(`🔑 Contraseña del Panel: ${ADMIN_PASSWORD}`);
  console.log(`===============================================`);
});
