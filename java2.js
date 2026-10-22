// Variables globales
let isPlaying = false;
let player = null;
let playerReady = false;
const totalSlides = 4;
let enableMusic = false;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    initializeIntro();
    initializeCountdown();
    initializeCarousel();
    initializeParallax();
    initializeScrollReveal();
    initializeGuestGreeting();
    // (YouTube desactivado: la música es musica.mp3)
    // loadYouTubeAPI(); // Se precarga desde el inicio (no en el click) para que
                       // playVideo() pueda ejecutarse de forma síncrona dentro
                       // del gesto del usuario. Esto es lo que exige iOS Safari.
});

// Intro con el video de la puerta.
// El video se muestra en pausa. Al tocar cualquier parte, en ese mismo toque
// se arranca la música de fondo y el video. Como todo ocurre dentro del gesto
// del invitado, iOS y Android permiten que la música suene.
// El video no tiene audio propio, así no compite con la música.
function initializeIntro() {
    const intro = document.getElementById('introVideo');
    const video = document.getElementById('doorVideo');
    if (!intro || !video) { revealHero(); return; }

    let started = false;
    let finished = false;

    const finish = () => {
        if (finished) return;
        finished = true;
        intro.classList.add('is-leaving');
        document.documentElement.classList.remove('intro-lock');
        window.scrollTo(0, 0);
        revealHero();   // entrada mágica de la portada
        setTimeout(() => intro.remove(), 900);
        if (window.__entrarMusica) window.__entrarMusica();
        resumeMusicAfterIntro();
    };

    const start = () => {
        if (started) return;
        started = true;
        enableMusic = true;
        intro.classList.add('is-playing');
        document.getElementById('musicPlayer').style.display = 'block';

        // 1) Música de fondo (musica.mp3). Se arranca en este mismo toque (primera
        //    interacción del invitado) pero en silencio, para que el teléfono la
        //    habilite. Se escucha a partir del segundo 8 del video.
        const MUSICA_ENTRA_SEG = 8;
        const audio = document.getElementById('bgMusic');
        let musicaEntro = false;
        const entrarMusica = () => {
            if (musicaEntro || !audio) return;
            musicaEntro = true;
            silenciarPuerta(video);   // la puerta deja de escucharse
            try { audio.currentTime = 0; } catch (e) {}
            audio.muted = false;
            if (audio.paused) audio.play().catch(() => {});
        };
        window.__entrarMusica = entrarMusica;
        if (audio) {
            usingMp3 = true;
            audio.volume = 1;
            audio.muted = true;
            const pa = audio.play();
            if (pa && pa.catch) pa.catch(() => {});
        }

        // 2) Video de la puerta CON su sonido solo hasta el segundo 8; ahí se apaga y entra la música.
        if (video.error) { entrarMusica(); finish(); return; }
        video.muted = false;
        video.volume = 1;
        const onVideoTime = () => {
            if (video.currentTime >= MUSICA_ENTRA_SEG) {
                video.removeEventListener('timeupdate', onVideoTime);
                entrarMusica();
            }
        };
        video.addEventListener('timeupdate', onVideoTime);
        setTimeout(entrarMusica, (MUSICA_ENTRA_SEG + 1.5) * 1000); // respaldo
        const pv = video.play();
        if (pv && pv.catch) {
            pv.catch(() => {
                // Si el navegador no deja el video con sonido, va sin sonido
                video.muted = true;
                video.play().catch(() => { entrarMusica(); finish(); });
            });
        }

        // Red de seguridad por si el evento "ended" nunca llega
        const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 19;
        setTimeout(finish, (dur + 3) * 1000);
    };

    intro.addEventListener('click', start);
    intro.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
    });
    video.addEventListener('ended', finish);
}

// Al terminar la puerta: si el teléfono pausó la música mientras sonaba el
// video (algunos iPhone lo hacen), se reanuda. El <audio> ya quedó habilitado
// por el toque, así que play() funciona sin otro toque. Luego sube el volumen.
let userPausedMusic = false;
// Apaga el sonido del video de la puerta con un desvanecido corto.
// (En iPhone el volumen no se puede cambiar por código, ahí se silencia directo.)
function silenciarPuerta(video) {
    if (!video || video.muted) return;
    let v = video.volume;
    const fade = setInterval(() => {
        v = Math.max(0, v - 0.1);
        try { video.volume = v; } catch (e) {}
        if (v <= 0) { clearInterval(fade); video.muted = true; }
    }, 40);
}

function resumeMusicAfterIntro() {
    if (userPausedMusic) return;
    const audio = document.getElementById('bgMusic');

    if (usingMp3 && audio) {
        if (audio.paused) audio.play().catch(() => {});
        let v = audio.volume;
        const fade = setInterval(() => {
            v = Math.min(1, v + 0.05);
            audio.volume = v;
            if (v >= 1) clearInterval(fade);
        }, 80);
        return;
    }

    // YouTube: el sonido de la puerta le quita el audio en el celular y lo pausa.
    // Aquí se reanuda. Como ya arrancó con el toque, el teléfono lo deja seguir.
    if (player && playerReady) {
        try {
            player.unMute();
            player.setVolume(100);
            if (player.getPlayerState() !== YT.PlayerState.PLAYING) player.playVideo();
        } catch (e) {}
    }

    // Último recurso: si aun así no suena, el siguiente toque en cualquier
    // parte de la invitación la arranca.
    const retry = () => {
        if (isPlaying || userPausedMusic) {
            ['click', 'touchend'].forEach(ev => document.removeEventListener(ev, retry, true));
            return;
        }
        if (usingMp3 && audio) audio.play().catch(() => {});
        else playYouTubeNow();
    };
    setTimeout(() => {
        if (!isPlaying) ['click', 'touchend'].forEach(ev => document.addEventListener(ev, retry, true));
    }, 1500);
}

// Arranca la música de fondo (se llama dentro del primer toque del invitado).
// El reproductor de YouTube ya se precargó al abrir la página, así que
// playVideo() se ejecuta en el mismo instante del toque, que es lo que exige iOS.
// Estado del MP3 local
let mp3Available = true;          // pasa a false si "musica.mp3" no existe
let usingMp3 = false;

document.addEventListener('DOMContentLoaded', () => {
    const musicToggle = document.getElementById('musicToggle');
    if (musicToggle) musicToggle.addEventListener('click', toggleMusic);
    const audio = document.getElementById('bgMusic');
    if (!audio) { mp3Available = false; return; }
    audio.addEventListener('error', () => { mp3Available = false; });
    audio.addEventListener('playing', () => { isPlaying = true; musicActuallyPlaying = true; updateMusicIcon(); });
    audio.addEventListener('pause', () => { isPlaying = false; updateMusicIcon(); });
    // Si ya falló antes de registrar el evento
    if (audio.error) mp3Available = false;
});

function startBackgroundMusic() {
    enableMusic = true;

    // 1) MP3 propio: audio.play() dentro del toque funciona en todos los navegadores
    const audio = document.getElementById('bgMusic');
    if (audio && mp3Available && !audio.error) {
        usingMp3 = true;
        audio.volume = 1;
        const pr = audio.play();
        if (pr && pr.catch) {
            pr.catch(() => {
                // Si el MP3 no se pudo reproducir, pasamos a YouTube
                usingMp3 = false;
                playYouTubeNow();
            });
        }
    } else {
        // 2) Respaldo: YouTube
        playYouTubeNow();
    }
    // Si YouTube todavía no terminó de cargar (internet lento),
    // onPlayerReady la reproduce apenas esté listo.

    // Red de seguridad: si el navegador no la dejó arrancar con el toque del
    // sobre, el siguiente toque en cualquier parte de la invitación la arranca.
    const retry = () => {
        if (musicActuallyPlaying) {
            ['click', 'touchend', 'pointerup'].forEach(ev => document.removeEventListener(ev, retry, true));
            return;
        }
        if (usingMp3) { const a = document.getElementById('bgMusic'); if (a && a.paused) a.play().catch(() => {}); }
        else playYouTubeNow();
    };
    ['click', 'touchend', 'pointerup'].forEach(ev => document.addEventListener(ev, retry, true));
}

let musicActuallyPlaying = false;

function playYouTubeNow() {
    return; // YouTube desactivado
    // Igual que el antiguo botón "Ingresar con música": el contenedor del
    // reproductor tiene que estar visible ANTES de llamar a playVideo().
    document.getElementById('musicPlayer').style.display = 'block';
    if (!playerReady || !player) return;
    try {
        player.unMute();
        player.setVolume(100);
        player.playVideo();
        isPlaying = true;
        updateMusicIcon();
    } catch (e) {
        console.log('No se pudo iniciar la música', e);
    }
}

// Efecto mágico de entrada de la portada
function revealHero() {
    const root = document.documentElement;
    if (root.classList.contains('hero-reveal')) return;
    root.classList.remove('hero-pending');
    root.classList.add('hero-reveal');
    spawnMagicSparkles();
    setTimeout(startButterflies, 1200);   // las mariposas entran después de la portada
}

function spawnMagicSparkles() {
    const layer = document.getElementById('magicLayer');
    if (!layer) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rand = (min, max) => Math.random() * (max - min) + min;

    // Ráfaga inicial de destellos que suben y se desvanecen
    for (let i = 0; i < 46; i++) {
        const s = document.createElement('span');
        s.className = 'magic-spark' + (Math.random() < 0.35 ? ' is-star' : '');
        if (s.classList.contains('is-star')) s.textContent = '✦';
        const size = rand(3, 9);
        s.style.left = rand(3, 97) + '%';
        s.style.top = rand(8, 92) + '%';
        s.style.setProperty('--size', size + 'px');
        s.style.setProperty('--rise', -rand(30, 90) + 'px');
        s.style.setProperty('--drift', rand(-25, 25) + 'px');
        s.style.animationDelay = rand(0.1, 2.4) + 's';
        s.style.animationDuration = rand(1.6, 2.8) + 's';
        layer.appendChild(s);
        setTimeout(() => s.remove(), 6000);
    }

    // Unos cuantos destellos suaves que se quedan titilando en la portada
    for (let i = 0; i < 14; i++) {
        const t = document.createElement('span');
        t.className = 'magic-twinkle';
        t.style.left = rand(5, 95) + '%';
        t.style.top = rand(10, 90) + '%';
        t.style.setProperty('--size', rand(2, 5) + 'px');
        t.style.animationDelay = rand(2.5, 6) + 's';
        t.style.animationDuration = rand(2.2, 4) + 's';
        layer.appendChild(t);
    }
}

// Sección de saludo personalizado por invitado/familia, leída desde la URL.
// Formatos soportados:
//   ?invitados=Juan Arias,Yerianny Arias,Valery Arias
//   ?familia=Arias
// Muestra un badge con el total, título "Invitados", el número de
// acompañantes (si aplica) y cada nombre como fila con colores intercalados
// de la paleta del sitio (marrón / dorado), ciclando si hay más de 4 nombres.
function initializeGuestGreeting() {
    const params = new URLSearchParams(window.location.search);
    const invitadosParam = params.get('invitados');
    const familiaParam = params.get('familia');

    const section = document.getElementById('guestSection');
    const badge = document.getElementById('guestBadge');
    const subtitle = document.getElementById('guestSubtitle');
    const greeting = document.getElementById('guestGreeting');
    if (!section || !badge || !subtitle || !greeting) return;

    let names = [];

    if (invitadosParam) {
        names = invitadosParam.split(',').map(n => decodeURIComponent(n.trim())).filter(Boolean);
    } else if (familiaParam) {
        names = [`Familia ${familiaParam.trim()}`];
    }

    if (names.length === 0) return;

    // Badge con el total de invitados
    badge.textContent = names.length;

    // Subtítulo de acompañantes: solo tiene sentido cuando hay más de un
    // nombre individual (no aplica al formato "Familia X")
    const companions = invitadosParam ? names.length - 1 : 0;
    if (companions > 0) {
        subtitle.textContent = `(${companions} acompañante${companions > 1 ? 's' : ''})`;
        subtitle.style.display = 'block';
    } else {
        subtitle.style.display = 'none';
    }

    // Limpiar contenido previo
    greeting.innerHTML = '';

    names.forEach((name, index) => {
        const nameSpan = document.createElement('span');
        const colorIndex = (index % 4) + 1;
        nameSpan.className = `guest-name color-${colorIndex}`;
        nameSpan.textContent = name;
        greeting.appendChild(nameSpan);
    });

    section.style.display = 'block';
}

// Cargar la API de YouTube
function loadYouTubeAPI() {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(script);
    window.onYouTubeIframeAPIReady = initializeYouTubePlayer;
}

// Función llamada por la API de YouTube
function initializeYouTubePlayer() {
    player = new YT.Player('youtube-player', {
        height: '1',
        width: '1',
        videoId: 'vwp1yxtcD7I',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            loop: 1,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            playlist: 'vwp1yxtcD7I'
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    playerReady = true;

    // Caso borde: el usuario ya hizo click en "con música" antes de que el
    // player terminara de inicializar (ej. conexión lenta). Lo reproducimos
    // apenas esté listo.
    if (enableMusic && !musicActuallyPlaying && !usingMp3) {
        playYouTubeNow();
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        musicActuallyPlaying = true;
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        const introAbierto = !!document.getElementById('introVideo');
        if (enableMusic && !userPausedMusic && !introAbierto && !usingMp3) {
            setTimeout(() => { try { if (!userPausedMusic) player.playVideo(); } catch (e) {} }, 300);
        }
    }
    updateMusicIcon();
}

function onPlayerError(event) {
    console.log('Error al cargar el video de YouTube');
    const musicPlayer = document.getElementById('musicPlayer');
    musicPlayer.style.display = 'block';
    isPlaying = false;
    updateMusicIcon();
}

function toggleMusic() {
    const audio = document.getElementById('bgMusic');
    if (usingMp3 && audio) {
        if (audio.paused) { userPausedMusic = false; audio.play(); }
        else { userPausedMusic = true; audio.pause(); }
        return;
    }
    if (player) {
        if (isPlaying) {
            userPausedMusic = true;
            player.pauseVideo();
            isPlaying = false;
        } else {
            userPausedMusic = false;
            player.unMute();
            player.playVideo();
            isPlaying = true;
        }
        updateMusicIcon();
    }
}

function updateMusicIcon() {
    const volumeIcon = document.getElementById('volumeIcon');
    
    if (isPlaying) {
        volumeIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"></path>
        `;
    } else {
        volumeIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
        `;
    }
}

// Countdown
function initializeCountdown() {
    const targetDate = new Date('2026-12-31T19:00:00').getTime();
    
    function updateCountdown() {
        const now = new Date().getTime();
        const difference = targetDate - now;
        
        if (difference > 0) {
            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days.toString().padStart(2, '0');
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        } else {
            document.getElementById('days').textContent = '00';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Carrusel (loop infinito real con clones: al llegar a la última foto avanza
// hacia una copia de la primera y luego "teletransporta" sin transición de
// vuelta al inicio real, así siempre se ve avanzando de derecha a izquierda,
// nunca retrocediendo)
let carouselIndex = 1; // arranca en la 1ª foto real (índice 0 es el clon de la última)
let carouselTransitioning = false;

function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const totalSlidesElement = document.getElementById('totalSlides');

    totalSlidesElement.textContent = totalSlides;

    // Posición inicial sin animación
    track.style.transition = 'none';
    track.style.transform = `translateX(${-carouselIndex * 100}%)`;
    updateSlideCounter();

    track.addEventListener('transitionend', () => {
        if (carouselIndex === totalSlides + 1) {
            // Llegó al clon de la primera foto: salta sin animar a la real
            carouselIndex = 1;
            track.style.transition = 'none';
            track.style.transform = `translateX(${-carouselIndex * 100}%)`;
            void track.offsetWidth; // fuerza reflow antes de reactivar la transición
        } else if (carouselIndex === 0) {
            // Llegó al clon de la última foto (retroceso manual): salta a la real
            carouselIndex = totalSlides;
            track.style.transition = 'none';
            track.style.transform = `translateX(${-carouselIndex * 100}%)`;
            void track.offsetWidth;
        }
        carouselTransitioning = false;
    });

    prevBtn.addEventListener('click', () => {
        if (carouselTransitioning) return;
        carouselTransitioning = true;
        carouselIndex--;
        goToCarouselSlide();
    });

    nextBtn.addEventListener('click', () => {
        if (carouselTransitioning) return;
        carouselTransitioning = true;
        carouselIndex++;
        goToCarouselSlide();
    });

    // Auto-play del carrusel: siempre avanza (derecha a izquierda)
    setInterval(() => {
        if (carouselTransitioning) return;
        carouselTransitioning = true;
        carouselIndex++;
        goToCarouselSlide();
    }, 2500);
}

function goToCarouselSlide() {
    const track = document.getElementById('carouselTrack');
    track.style.transition = 'transform 0.5s ease-in-out';
    track.style.transform = `translateX(${-carouselIndex * 100}%)`;
    updateSlideCounter();
}

function updateSlideCounter() {
    const currentSlideElement = document.getElementById('currentSlide');
    let display = carouselIndex;
    if (display === 0) display = totalSlides;
    else if (display === totalSlides + 1) display = 1;
    currentSlideElement.textContent = display;
}

// Parallax en la portada izquierda (layer transform to emulate fixed background)
// Portada fija: la portada se queda quieta (position: sticky en CSS) y el resto
// de la invitación sube por encima. Mientras se tapa, la foto hace un zoom
// suave y el texto se desvanece hacia arriba.
function initializeParallax() {
    const heroLeft = document.querySelector('.hero-left');
    const heroLayer = document.querySelector('.hero-left .hero-left-bg');
    const heroContent = document.querySelector('.hero-left .hero-content');
    if (!heroLeft || !heroLayer) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let ticking = false;

    const render = () => {
        ticking = false;
        if (reduce.matches) {
            heroLayer.style.transform = '';
            if (heroContent) { heroContent.style.opacity = ''; heroContent.style.transform = ''; }
            return;
        }
        const h = heroLeft.offsetHeight || window.innerHeight;
        const y = window.scrollY || window.pageYOffset;
        const p = Math.max(0, Math.min(1, y / h));
        heroLayer.style.transform = `scale(${(1 + p * 0.08).toFixed(4)})`;
        if (heroContent) {
            heroContent.style.opacity = (1 - p * 1.4).toFixed(3);
            heroContent.style.transform = `translate3d(0, ${Math.round(-p * 50)}px, 0)`;
        }
    };

    const onScroll = () => {
        if (!ticking) { ticking = true; window.requestAnimationFrame(render); }
    };

    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', render);
}

// Aparición elegante al deslizar: cada bloque de información entra con un
// desvanecido suave, subiendo un poco y saliendo de un ligero desenfoque.
// Los elementos de un mismo bloque aparecen uno tras otro.
function initializeScrollReveal() {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const content = document.querySelector('.content');
    if (!content) return;

    // Bloques que suben + desvanecido
    const moveSel = [
        '.section-title', '.section-subtitle', '.countdown-container',
        '.event-title', '.event-details', '.carousel-container', '.carousel-counter',
        '.party-card', '.guest-title', '.guest-greeting', '.guest-closing',
        '.content .btn-wedding', '.footer-content > *'
    ].join(',');
    // Íconos (ya tienen su propia animación): solo desvanecido
    const fadeSel = '.event-icon, .camera-icon, .gift-icon, .whatsapp-icon, .guest-badge';

    const items = [];
    const add = (el, cls) => {
        if (el.closest('.notes-modal')) return;          // nada dentro de ventanas
        if (el.closest('.party-card') && el.closest('.party-card') !== el) return; // la tarjeta entra completa
        if (el.classList.contains('rv') || el.classList.contains('rv-fade')) return;
        el.classList.add(cls);
        items.push(el);
    };
    document.querySelectorAll('.content ' + fadeSel.split(',').join(', .content ')).forEach(el => add(el, 'rv-fade'));
    content.querySelectorAll(moveSel).forEach(el => add(el, 'rv'));
    document.querySelectorAll('.footer-content > *').forEach(el => add(el, 'rv'));

    // Escalonado: dentro de la misma sección, cada elemento un poco después
    const groups = new Map();
    items.forEach(el => {
        const g = el.closest('section, footer, .party-card') || document.body;
        const n = groups.get(g) || 0;
        groups.set(g, n + 1);
        el.style.setProperty('--rv-delay', Math.min(n * 0.12, 0.6) + 's');
    });

    root.classList.add('js-reveal');

    const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            en.target.classList.add('is-visible');
            io.unobserve(en.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    items.forEach(el => io.observe(el));
}

// Funciones de los botones

function showDressCode() {
    showToast("Código de Vestimenta", "El código de vestimenta es todo de blanco 🤍");
}


function sharePhotos() {
    window.open('https://photos.app.goo.gl/719u5sBdyWCSHy4w8', '_blank');
}

// Ventana de regalos con las cuentas de banco
let giftLastFocus = null;
function openGiftLink() {
    const m = document.getElementById('giftModal');
    if (!m) return;
    giftLastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('is-open'));
    m.querySelector('.notes-card').focus();
}
function closeGift() {
    const m = document.getElementById('giftModal');
    if (!m) return;
    m.classList.remove('is-open');
    setTimeout(() => { m.hidden = true; }, 250);
    if (giftLastFocus) giftLastFocus.focus();
}
document.addEventListener('keydown', (e) => {
    const m = document.getElementById('giftModal');
    if (e.key === 'Escape' && m && !m.hidden) closeGift();
});
function copyAccount(text, btn) {
    const done = () => {
        if (btn) {
            const t = btn.textContent;
            btn.textContent = '¡Copiado!';
            setTimeout(() => { btn.textContent = t; }, 2000);
        }
        showToast('¡Copiado!', 'Número de cuenta: ' + text);
    };
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
        fallback();
    }
}

function confirmAttendance() {
    // WhatsApp de confirmación: (809) 918-0520 con código de país 1
    const telefono = '18094869344';
    const mensaje = '¡Hola! Confirmo mi asistencia a los XV de Yerianny 🤍';
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// Sistema de Toast
function showToast(title, message) {
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toastContent');
    
    toastContent.innerHTML = `
        <h4 style="font-weight: 600; color: hsl(var(--brown)); margin-bottom: 0.5rem;">${title}</h4>
        <p style="color: hsl(var(--foreground) / 0.7);">${message}</p>
    `;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}


// ===== Mariposas =====
// Cada sección tiene sus propias mariposas. Cada una vive en su lugar
// y da vueltas en un círculo suave alrededor de ese punto, sin salir de su sección.
// Aparecen cuando el invitado llega a esa sección al deslizar.
// El aleteo viene de "mariposa-sprite.webp" (9 x 7 cuadros).
const BUTTERFLY_SECTIONS = [
    { sel: '.hero-left',          count: 2 },
    { sel: '.countdown-section',  count: 1 },
    { sel: '.ceremony-section',   count: 2 },
    { sel: '.gallery-section',    count: 3 },
    { sel: '.party-section',      count: 3 },
    { sel: '.gifts-section',      count: 2 },
    { sel: '.rsvp-section:not(.photos-section)', count: 1 },
    { sel: '.photos-section',     count: 1 }
];
// Lugares dentro de la sección (en %), a los lados para no tapar los textos
const BUTTERFLY_SPOTS = {
    1: [[86, 22]],
    2: [[14, 22], [86, 70]],
    3: [[13, 18], [87, 48], [15, 82]]
};

let butterfliesStarted = false;
function startButterflies() {
    if (butterfliesStarted) return;
    butterfliesStarted = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const mobile = window.innerWidth < 640;
    const rand = (a, b) => Math.random() * (b - a) + a;
    const groups = [];

    BUTTERFLY_SECTIONS.forEach(({ sel, count }) => {
        const section = document.querySelector(sel);
        if (!section) return;
        if (getComputedStyle(section).position === 'static') section.style.position = 'relative';

        const layer = document.createElement('div');
        layer.className = 'butterfly-layer';
        layer.setAttribute('aria-hidden', 'true');
        section.appendChild(layer);

        const flies = BUTTERFLY_SPOTS[count].map(([px0, py], k) => {
            // en celular, más pegadas a los bordes para no tapar textos
            const px = mobile ? (px0 < 50 ? 6 : 94) : px0;
            const el = document.createElement('div');
            el.className = 'butterfly';
            const sprite = document.createElement('div');
            sprite.className = 'butterfly-sprite';
            el.appendChild(sprite);

            const size = mobile ? rand(40, 58) : rand(52, 78);
            const flap = rand(1.6, 2.4);
            el.style.setProperty('--w', size.toFixed(0) + 'px');
            el.style.transitionDelay = (k * 0.35) + 's';     // van apareciendo una tras otra
            sprite.style.setProperty('--dur', flap.toFixed(2) + 's');
            sprite.style.animationDelay = (-rand(0, flap)).toFixed(2) + 's';
            layer.appendChild(el);

            return {
                el, size, px, py,
                rx: mobile ? rand(22, 34) : rand(30, 48),   // tamaño del círculo
                ry: mobile ? rand(12, 20) : rand(16, 26),
                period: rand(7, 11),                        // segundos por vuelta
                spin: Math.random() < 0.5 ? 1 : -1,         // sentido de giro
                phase: rand(0, 6.28),
                bob: rand(2.5, 4),
                dir: 1, lastX: null
            };
        });
        groups.push({ section, layer, flies, visible: false });
    });

    // Aparecer al llegar a la sección y animar solo lo que está en pantalla
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            const g = groups.find(x => x.section === e.target);
            if (!g) return;
            g.visible = e.isIntersecting;
            if (e.isIntersecting) g.layer.classList.add('is-on');
        });
    }, { threshold: 0.15 });
    groups.forEach(g => io.observe(g.section));

    const t0 = performance.now();
    function frame(now) {
        const t = (now - t0) / 1000;
        for (const g of groups) {
            if (!g.visible) continue;
            const W = g.layer.clientWidth, H = g.layer.clientHeight;
            for (const f of g.flies) {
                // centro del círculo, ajustado para que la vuelta quede dentro de la sección
                const cx = Math.min(Math.max(W * f.px / 100, f.rx + f.size / 2), W - f.rx - f.size / 2);
                const cy = Math.min(Math.max(H * f.py / 100, f.ry + f.size / 2), H - f.ry - f.size / 2);
                const a = f.spin * (t / f.period) * 6.28 + f.phase;
                const x = cx + f.rx * Math.cos(a) + f.rx * 0.18 * Math.cos(2 * a) - f.size / 2;
                const y = cy + f.ry * Math.sin(a) + Math.sin(t * f.bob * 6.28) * 2.5 - f.size / 2;
                const vx = f.lastX === null ? 0 : x - f.lastX;
                f.lastX = x;
                const target = vx < -0.02 ? -1 : (vx > 0.02 ? 1 : (f.dir >= 0 ? 1 : -1));
                f.dir += (target - f.dir) * 0.08;            // gira de lado al cambiar de dirección
                const tilt = Math.max(-14, Math.min(14, vx * 12));
                f.el.style.transform =
                    `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scaleX(${f.dir.toFixed(3)})`;
            }
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
