/* =========================================================================
   DISCOVERY FEED COMPLETO (REELS STYLE) - VERSÃO INTEGRAL COM RANDOMIZAÇÃO
   ========================================================================= */

window.openDiscoveryFeed = function() {
    const feed = document.getElementById('discoveryFeed');
    const app = document.getElementById('app'); 
    const navBottom = document.getElementById('mainNavBottom');
    const container = document.getElementById('reelsContainer');
    
    if (!feed || !container) return;

    // Interface: Esconde o resto do app
    if (app) app.classList.add('hidden');
    if (navBottom) navBottom.classList.add('hidden');
    document.body.style.overflow = 'hidden';

    feed.classList.remove('hidden');
    feed.style.display = 'flex'; 

    if (!state.allProducts || state.allProducts.length === 0) {
        container.innerHTML = `<div class="text-white p-10 text-center">Nenhum produto disponível.</div>`;
        return;
    }

    // --- ADIÇÃO CIRÚRGICA: RANDOMIZAÇÃO ---
    const shuffledProducts = [...state.allProducts].sort(() => Math.random() - 0.5);

    // Renderização dos Itens (DESIGN ORIGINAL PRESERVADO)
    container.innerHTML = shuffledProducts.map((p) => {
        const imgUrl = (p.images && p.images.length > 0) ? p.images[0] : '';
        const precoBruto = p.value || p.priceCard || 0;
        const formattedPrice = `R$ ${Number(precoBruto).toFixed(2).replace('.', ',')}`;
        const isFavorite = state.favorites && state.favorites.includes(p.id);
        const views = p.views || 0;

        // --- ADIÇÃO CIRÚRGICA: ATRIBUTOS ---
        const tamanhos = p.sizes ? p.sizes.filter(Boolean).join(', ') : '';
        const cores = p.colors ? p.colors.filter(Boolean).join(', ') : '';
        const atributos = [tamanhos, cores].filter(Boolean).join(' • ');

        return `
        <div class="reel-item h-full w-full snap-start relative flex-shrink-0 bg-black overflow-hidden group" data-id="${p.id}">
            <img src="${imgUrl}" class="zoom-img absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl">
            
            <img src="${imgUrl}" class="absolute inset-0 w-full h-full object-contain z-10">

            <div class="absolute inset-x-0 bottom-0 p-6 pb-24 z-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                <h2 class="text-white text-xl font-bold drop-shadow-lg">${p.name}</h2>
                
                <p class="text-white/70 text-[10px] uppercase tracking-wider mt-0.5 font-medium">
                    ${atributos || 'Disponível'}
                </p>

                <div class="flex items-center gap-3 mt-2">
                    <span class="text-rose-400 text-lg font-black">${formattedPrice}</span>
                    <span class="bg-white/10 text-white/60 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i data-lucide="eye" class="w-3 h-3"></i> <span id="view-count-${p.id}">${views}</span>
                    </span>
                </div>
                
                <p class="text-white/60 text-sm mt-3 line-clamp-2 max-w-[80%] font-light">
                    ${p.description || ''}
                </p>
            </div>

            <div class="absolute right-4 bottom-32 z-30 flex flex-col gap-6 items-center">
                <button onclick="window.toggleFavoriteFromFeed('${p.id}', this)" class="flex flex-col items-center gap-1 group">
                    <div class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 active:scale-90 transition-all">
                        <i data-lucide="heart" class="w-6 h-6 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-white'}"></i>
                    </div>
                    <span class="text-white text-[10px] font-bold">Amei</span>
                </button>

                <button onclick="window.openProductModalFromFeed('${p.id}')" class="flex flex-col items-center gap-1">
                    <div class="w-12 h-12 rounded-full bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/20 active:scale-90 transition-all">
                        <i data-lucide="shopping-bag" class="w-6 h-6 text-white"></i>
                    </div>
                    <span class="text-white text-[10px] font-bold">Comprar</span>
                </button>

                <button onclick="window.shareProductFromFeed('${p.id}')" class="flex flex-col items-center gap-1">
                    <div class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                        <i data-lucide="share-2" class="w-6 h-6 text-white"></i>
                    </div>
                    <span class="text-white text-[10px] font-bold">Enviar</span>
                </button>
            </div>
        </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Pequeno atraso para garantir renderização antes de observar
    setTimeout(initReelObserver, 100);
};

// --- MANTÉM O OBSERVADOR ORIGINAL COMPLETO ---
function initReelObserver() {
    const container = document.getElementById('reelsContainer');
    if (!container) return;

    const observerOptions = {
        root: container,
        threshold: 0.6
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const productId = entry.target.dataset.id;
                const img = entry.target.querySelector('.zoom-img');

                if (img) {
                    img.style.animation = 'none';
                    void img.offsetWidth; 
                    img.style.animation = 'zoomEffect 10s ease-out forwards';
                }
                
                if (typeof window.trackView === 'function') {
                    window.trackView(productId);
                }
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reel-item').forEach(item => observer.observe(item));
}

// --- MANTÉM AS FUNÇÕES DE APOIO ORIGINAIS ---
window.shareProductFromFeed = async function(id) {
    const p = state.allProducts.find(x => x.id === id);
    if(!p) return;
    
    const shareData = {
        title: p.name,
        text: `Olha esse produto na Vitrine: ${p.name}`,
        url: `${window.location.origin}${window.location.pathname}?id=${state.STORE_ID}&prod=${id}`
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            navigator.clipboard.writeText(shareData.url);
            alert("Link copiado!");
        }
    } catch (err) { console.log("Erro ao compartilhar", err); }
};

window.trackView = function(productId) {
    const key = `viewed_${productId}`;
    if (sessionStorage.getItem(key)) return; 
    sessionStorage.setItem(key, "true");
    
    const viewSpan = document.getElementById(`view-count-${productId}`);
    if (viewSpan) {
        let currentViews = parseInt(viewSpan.innerText) || 0;
        viewSpan.innerText = currentViews + 1;
    }

    if (typeof window.reportarMetrica === 'function') {
        window.reportarMetrica(productId, 'view');
    }
};

window.closeDiscoveryFeed = function() {
    const feed = document.getElementById('discoveryFeed');
    const app = document.getElementById('app');
    const navBottom = document.getElementById('mainNavBottom');
    
    if (feed) {
        feed.classList.add('hidden');
        feed.style.display = 'none';
    }
    if (app) app.classList.remove('hidden');
    if (navBottom) navBottom.classList.remove('hidden');
    document.body.style.overflow = ''; 
};

window.openProductModalFromFeed = function(productId) {
    window.closeDiscoveryFeed();
    setTimeout(() => {
        if (typeof window.openProductModal === 'function') {
            window.openProductModal(productId);
        }
    }, 300);
};
