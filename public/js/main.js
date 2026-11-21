document.addEventListener('DOMContentLoaded', () => {
  // ================= BÚSQUEDA EN VIVO =================
  const searchInput = document.getElementById('mainSearchInput');
  const searchResults = document.getElementById('searchResultsDropdown');
  let searchTimeout = null;

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length < 2) {
        searchResults.innerHTML = '';
        searchResults.classList.remove('active');
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`);
          const games = await res.json();

          if (games.length === 0) {
            searchResults.innerHTML = `
              <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                No se encontraron juegos para "${query}"
              </div>
            `;
          } else {
            searchResults.innerHTML = games.map(game => `
              <a href="/juego/${game.slug}" class="search-item">
                <img src="${game.icon}" alt="${game.title}" class="search-item-img" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=100&q=80'">
                <div class="search-item-info">
                  <div class="search-item-title">${game.title}</div>
                  <div class="search-item-meta">
                    <span style="color: var(--accent-green); font-weight: 700;">${game.badge || 'APK'}</span>
                    <span>•</span>
                    <span>${game.category}</span>
                    <span>•</span>
                    <span style="color: var(--accent-amber);">★ ${game.rating}</span>
                  </div>
                </div>
              </a>
            `).join('');
          }
          searchResults.classList.add('active');
        } catch (err) {
          console.error('Error buscando:', err);
        }
      }, 200);
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('active');
      }
    });
  }

  // ================= TEMPORIZADOR DE DESCARGA CON ANIMACIÓN =================
  const countdownElement = document.getElementById('countdownNumber');
  const progressBar = document.getElementById('downloadProgressBar');
  const downloadButtonWrapper = document.getElementById('downloadFinalBtnWrapper');

  if (countdownElement && downloadButtonWrapper) {
    let timeLeft = parseInt(countdownElement.dataset.seconds, 10) || 6;
    const totalTime = timeLeft;

    const timerInterval = setInterval(() => {
      timeLeft--;
      countdownElement.textContent = timeLeft;

      if (progressBar) {
        const percentage = ((totalTime - timeLeft) / totalTime) * 100;
        progressBar.style.width = `${percentage}%`;
      }

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        countdownElement.innerHTML = '✓';
        countdownElement.style.borderColor = 'var(--accent-green)';
        countdownElement.style.color = 'var(--accent-green)';
        countdownElement.style.boxShadow = '0 0 35px rgba(16, 185, 129, 0.7)';

        // Botón final con animación de entrada
        const finalUrl = downloadButtonWrapper.dataset.url;
        downloadButtonWrapper.innerHTML = `
          <a href="${finalUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-download-big" style="animation: downloadPulse 1.8s infinite;">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            DESCARGAR AHORA (${progressBar ? '100%' : 'Listo'})
          </a>
          <p style="font-size: 0.88rem; color: var(--accent-green); margin-top: 12px; font-weight: 600;">
            ✓ Enlace verificado. Se abrirá en una nueva pestaña segura.
          </p>
        `;

        // Direct Link Adsterra opcional
        const directLink = downloadButtonWrapper.dataset.directlink;
        if (directLink && directLink.startsWith('http')) {
          window.open(directLink, '_blank');
        }
      }
    }, 1000);
  }

  // ================= EFECTO 3D TILT SUAVE EN TARJETAS =================
  const cards = document.querySelectorAll('.game-card[data-tilt]');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ================= MOBILE MENU TOGGLE =================
  const mobileToggle = document.getElementById('mobileNavToggle');
  const mobileNav = document.getElementById('headerNavLinks');

  if (mobileToggle && mobileNav) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      mobileNav.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!mobileNav.contains(e.target) && !mobileToggle.contains(e.target)) {
        mobileNav.classList.remove('active');
      }
    });
  }
});

// ================= LIGHTBOX GLOBAL PARA SCREENSHOTS =================
function openLightbox(imageUrl) {
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxImage');
  if (modal && img) {
    img.src = imageUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeLightbox() {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
  }
});

// Copiar enlace al portapapeles con feedback visual
function copyGameLink(btn) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>✓ ¡Copiado!</span>';
    btn.style.borderColor = 'var(--accent-green)';
    btn.style.color = 'var(--accent-green)';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }).catch(() => {
    prompt('Copia este enlace para compartir:', window.location.href);
  });
}
