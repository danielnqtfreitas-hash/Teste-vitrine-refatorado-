/* =========================================================================
   DISCOVERY FEED COMPLETO (REELS STYLE) - VERSÃO CORRIGIDA
   ========================================================================= */

window.openDiscoveryFeed = function() {
    console.log("Produtos carregados:", state.allProducts);
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

    // Renderização dos Itens
    container.innerHTML = state.allProducts.map((p) => {
        const imgUrl = (p.images && p.images.length > 0) ? p.images[0] : '';
        const precoBruto = p.value || p.priceCard || 0;
        const formattedPrice = `R$ ${Number(precoBruto).toFixed(2).replace('.', ',')}`;
        const isFavorite = state.favorites && state.favorites.includes(p.id);
        const views = p.views || 0;

        return `
            <div class="reel-item" data-id="${p.id}" style="height: 100dvh; scroll-snap-align: start; position: relative; background: #000; overflow: hidden;">
                <div style="position: absolute; inset: 0; z-index: 1; background: #111;">
                    <img src="${imgUrl}" class="zoom-img">
                </div>

                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%); z-index: 2; pointer-events: none;"></div>
                
                <div style="position: absolute; right: 16px; bottom: 180px; z-index: 10; display: flex; flex-direction: column; gap: 20px; align-items: center;">
                    
                    <div class="flex flex-col items-center">
                        <i data-lucide="eye" class="text-white w-6 h-6 opacity-80"></i>
                        <span id="view-count-${p.id}" class="text-white text-[10px] font-bold mt-1">${views}</span>
                    </div>

                    <div class="flex flex-col items-center">
                        <button onclick="window.toggleFavorite('${p.id}')" 
                                class="w-[50px] h-[50px] rounded-full flex items-center justify-center border border-white/20 active:scale-90 transition-transform"
                                style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);">
                            <i data-lucide="heart" class="w-7 h-7 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white'}"></i>
                        </button>
                        <span class="text-white text-[10px] font-bold mt-1">Gostar</span>
                    </div>

                    <div class="flex flex-col items-center">
                        <button onclick="window.shareProduct('${p.id}', '${p.name}', '${imgUrl}')" 
                                class="w-[50px] h-[50px] rounded-full flex items-center justify-center border border-white/20 active:scale-90 transition-transform"
                                style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);">
                            <i data-lucide="share" class="w-7 h-7 text-white"></i>
                        </button>
                        <span class="text-white text-[10px] font-bold mt-1">Enviar</span>
                    </div>
                </div>

                <div style="position: absolute; left: 16px; bottom: 125px; z-index: 10; max-width: 80%;">
                    <h2 class="text-xl font-bold text-white mb-1">${p.name}</h2>
                    ${views > 30 ? '<span class="bg-red-600 text-[10px] text-white px-2 py-0.5 rounded-full font-black animate-pulse">🔥 EM ALTA</span>' : ''}
                </div>

                <div onclick="window.openProductModalFromFeed('${p.id}')" 
                     style="position: absolute; bottom: 30px; left: 16px; right: 16px; background: white; border-radius: 20px; padding: 12px; display: flex; align-items: center; gap: 12px; z-index: 10; box-shadow: 0 15px 35px rgba(0,0,0,0.4);">
                    <img src="${imgUrl}" style="width: 50px; height: 50px; border-radius: 12px; object-fit: cover;">
                    <div style="flex: 1; min-width: 0;">
                        <span class="block text-slate-900 font-bold text-sm truncate">${p.name}</span>
                        <span class="block text-red-600 font-black text-lg">${formattedPrice}</span>
                    </div>
                    <div class="bg-red-600 p-3 rounded-2xl text-white">
                        <i data-lucide="shopping-cart" class="w-6 h-6"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    
    // Pequeno atraso para garantir que o DOM renderizou antes de observar
    setTimeout(initReelObserver, 100);
};


function initReelObserver() {
    const container = document.getElementById('reelsContainer');
    if (!container) return;

    const observerOptions = {
        root: container, // O container que tem o scroll
        threshold: 0.6   // 60% do item precisa estar visível para contar
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const productId = entry.target.dataset.id;
                const img = entry.target.querySelector('.zoom-img');

                // 1. Dispara o efeito visual de zoom
                if (img) {
                    img.style.animation = 'none';
                    void img.offsetWidth; 
                    img.style.animation = 'zoomEffect 10s ease-out forwards';
                }
                
                // 2. REGISTRA A VIEW (Local e Backend)
                // Usamos o window para garantir que acesse a função global
                if (typeof window.trackView === 'function') {
                    window.trackView(productId);
                }
            }
        });
    }, observerOptions);

    // Seleciona todos os itens que acabaram de ser renderizados
    document.querySelectorAll('.reel-item').forEach(item => observer.observe(item));
}

// Funções de apoio permanecem as mesmas (shareProduct, closeDiscoveryFeed, etc)
// --- COMPARTILHAMENTO ---
window.shareProduct = async function(id, name, img) {
    const shareData = {
        title: name,
        text: `Olha esse produto na Vitrine: ${name}`,
        url: `${window.location.origin}${window.location.pathname}?prod=${id}`
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

// --- MÉTRICAS (FIREBASE) ---
window.trackView = function(productId) {
    // Evita contar 2x na mesma sessão
    const key = `viewed_${productId}`;
    if (sessionStorage.getItem(key)) return; 
    sessionStorage.setItem(key, "true");
    
    // Atualiza o contador na tela (visual)
    const viewSpan = document.getElementById(`view-count-${productId}`);
    if (viewSpan) {
        let currentViews = parseInt(viewSpan.innerText) || 0;
        viewSpan.innerText = currentViews + 1;
    }

    // CHAMA A MÉTRICA PARA SALVAR NO BANCO:
    if (typeof window.reportarMetrica === 'function') {
        window.reportarMetrica(productId, 'view');
    }
};

// --- NAVEGAÇÃO ---
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
