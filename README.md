# 🎮 APKVision Hub - Plataforma de Juegos Móviles y Monetización

Una plataforma web de alto rendimiento inspirada en el diseño moderno y oscuro de **APKVision**, desarrollada en **Node.js + Express + EJS** y optimizada para:
- 🚀 **Carga ultrarrápida y SEO móvil** (Meta tags dinámicos, Open Graph, Sitemap XML y Robots.txt).
- 💰 **Monetización con Adsterra** (Social Bar, Popunder, Native Banners, Banners 728x90 y 300x250, Smartlink).
- ⏱️ **Página de descarga con temporizador (Countdown 6s)** de alto CPM antes de redirigir al enlace externo (MediaFire, Mega, Drive, etc.).
- 🔒 **Panel de administración privado y oculto** para subir juegos o editar los anuncios desde la web.
- ☁️ **Listo para desplegar gratis en Render.com**.

---

## 🛠️ Instalación y Ejecución Local

1. Asegúrate de tener instalado **Node.js** (v18 o superior).
2. Clona o abre la carpeta del proyecto.
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Inicia el servidor de desarrollo:
   ```bash
   npm start
   ```
5. Abre en tu navegador:
   - Sitio público: `http://localhost:3000`
   - Panel de control oculto: `http://localhost:3000/gestion-privada-apk` (Contraseña por defecto: `admin12345`)

---

## ☁️ Cómo Alojar Gratis en Render.com

1. Sube este proyecto a tu repositorio de **GitHub** o **GitLab**.
2. Ingresa a [Render.com](https://render.com) y haz clic en **New +** -> **Web Service**.
3. Conecta tu repositorio.
4. Completa la configuración básica:
   - **Name**: `apkvision-hub` (o el nombre que prefieras)
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. En la sección **Environment Variables** (Variables de Entorno), añade:
   - `PORT`: `10000` (o déjalo automático)
   - `NODE_ENV`: `production`
   - `SESSION_SECRET`: Una clave aleatoria segura
   - `ADMIN_SECRET_PATH`: La ruta secreta que tú elijas para tu panel (ejemplo: `/panel-secreto-x99`)
   - `ADMIN_PASSWORD`: Tu contraseña secreta para administrar la web
   - `SITE_URL`: La URL pública que te asigne Render (ejemplo: `https://tu-app.onrender.com`)
6. Haz clic en **Create Web Service**. ¡En 2 minutos tu web estará activa en internet!

---

## 💰 Configuración de Adsterra

Adsterra es la red publicitaria líder para sitios de juegos y descargas. La web ya viene con todos los espacios estratégicos listos:

1. Inicia sesión en tu cuenta de [Adsterra](https://publishers.adsterra.com/).
2. Añade el dominio de tu web (la URL de Render).
3. Genera los siguientes bloques de anuncios según desees:
   - **Social Bar (In-Page Push)**: Anuncio flotante no invasivo pero con altísimo CTR móvil.
   - **Popunder (Onclick)**: Máximo CPM en el nicho gaming y descargas.
   - **Banner 728x90 / 320x50**: Para la cabecera superior.
   - **Banner 300x250**: Para la ficha del juego y la pantalla del temporizador de descarga.
   - **Native Banner**: Para intercalarse naturalmente entre las tarjetas de juegos.
   - **Direct Link (Smartlink)**: Si deseas enviar tráfico monetizado opcional antes o después de la descarga.
4. Entra a tu panel privado (`/gestion-privada-apk`), ve a la pestaña **💰 Configuración Adsterra & Monetización**, desmarca el **Modo Prueba** y pega los códigos HTML/JS que te dio Adsterra. Guarda cambios y se aplicarán al instante.

---

## 🎮 Gestión de Juegos y Enlaces Externos

Los juegos se pueden gestionar de dos maneras:
1. **Desde el Panel Web Oculto**:
   - Accede a `tuweb.com/gestion-privada-apk` con tu contraseña.
   - Haz clic en **+ Agregar Nuevo Juego** o **Editar**.
   - Coloca el título, la categoría, las características del MOD y el **enlace externo de descarga** (ej. enlace de MediaFire, Mega, Google Drive, etc.).
2. **Desde el archivo `data/games.json`**:
   - También puedes editar directamente el archivo JSON o respaldarlo en tu ordenador.

---

## ⚖️ Aviso Legal (DMCA)
El sitio incluye pie de página con cláusula de descargo de responsabilidad (DMCA) aclarando que la web funciona como un catálogo informativo y no almacena archivos protegidos por derechos de autor en sus propios servidores.
