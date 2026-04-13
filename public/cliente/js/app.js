/* * =========================================================================
 * VITRINE ONLINE - MOTOR PRINCIPAL (v3.0 Backend-Driven)
 * Centraliza: Inicialização, Sincronização de Estado, UI e Analytics
 * =========================================================================
 */

import { 
    auth, signInAnonymously, onAuthStateChanged, db, doc, getDocFromServer, getDocs, getDocsFromServer, collection, 
    writeBatch, increment, serverTimestamp, setDoc, hideLoader, showToast, sanitizeTerm, isBotLikely 
} from './config.js';

import { state, setStoreId, loadFavorites, loadCart } from './state.js';

import { 
    renderCatalog, renderHeroCarousel, renderCategoryTabs, populateFilterOptions, updateFavoritesUI, 
    openProductModal, closeModalDetails, updateFilterBadge, resetAllFilters, handleSearchInput, 
    openFilterDrawer, closeFilterDrawer, openImageZoom, closeImageZoom, setupSwipes, adjustDetailQty, 
    shareProduct, openDeliveryModal, toggleFavoritesView, setDetailImage, mkProductCard , checkStoreStatus
} from './ui.js';

import { addToCart, checkoutWhatsApp, updateCartUI, updateCartTotals, goToStep1, goToStep2, toggleAddressFields, modQty, alertaEstoquePreso } from './cart.js';

// --- 1. INICIALIZAÇÃO E BLINDAGEM DE ROTA ---

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathSegments = window.location.pathname.split('/');
    
    let storeId = urlParams.get('id') || 
                  (pathSegments[1] && pathSegments[1] !== "index.html" ? pathSegments[1] : null) || 
                  localStorage.getItem('last_store_id');
    
    if (!storeId || ["index.html", "undefined", "null", ""].includes(storeId)) {
        storeId = "admin"; 
    }

    localStorage.setItem('last_store_id', storeId);

    if (!urlParams.get('id')) {
        const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${storeId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    const activeSession = localStorage.getItem('active_store_session');
    if (activeSession && activeSession !== storeId) {
        localStorage.removeItem('cart');
        state.cart = [];
    }
    localStorage.setItem('active_store_session', storeId);

    setStoreId(storeId);
    loadFavorites();
    loadCart();
    
    await signInAnonymously(auth);
    onAuthStateChanged(auth, (user) => { 
        if(user) initFlow(); 
    });

    setupSwipes();
    
    if (window.lucide) lucide.createIcons(); 
});

async function initFlow() {
    try {
        updatePremiumLoader(10); 

        // 1. Busca produtos na sua API
        const response = await fetch(`/api/produtos/${state.STORE_ID}`);
        if (!response.ok) throw new Error("Loja não encontrada");
        const data = await response.json(); 
        updatePremiumLoader(40); 

        state.storeConfigGlobal = data.config;

// --- BLOCO DE SINCRONIZAÇÃO DE VISUALIZAÇÕES (BLINDADO) ---
try {
    const analyticsRef = doc(db, "stores", state.STORE_ID, "analytics", "product_views");
    const analyticsSnap = await getDocFromServer(analyticsRef).catch(() => null); 
    
    // Se o documento não existir, usamos um objeto vazio
    const viewsData = (analyticsSnap && analyticsSnap.exists()) ? analyticsSnap.data() : {};
    const statsMap = viewsData.stats || {};

    state.allProducts = data.produtos.map(p => {
        const productStats = statsMap[p.id]; 
        // Garantimos que views seja sempre um número, mesmo que o produto não esteja no analytics
        const vCount = (productStats && typeof productStats.views === 'number') ? productStats.views : 0;
        
        return {
            ...p,
            views: vCount
        };
    });
    
    console.log("✅ Visualizações sincronizadas");
} catch (e) {
    console.warn("⚠️ Usando produtos sem views devido a erro:", e);
    state.allProducts = data.produtos.map(p => ({ ...p, views: 0 })); 
}
        
        updatePremiumLoader(60);

        // --- LOGICA DE DETECÇÃO DO PROVADOR ---
try {
    // Filtramos os produtos que o lojista marcou no painel
    state.tops = state.allProducts.filter(p => p.disponivelProvador && p.posicaoProvador === 'superior');
    state.bottoms = state.allProducts.filter(p => p.disponivelProvador && p.posicaoProvador === 'inferior');

    // Se a loja tiver pelo menos 1 de cada, ativamos o modo Provador
    const isFashionStore = state.tops.length > 0 && state.bottoms.length > 0;
    setupFooterButton(isFashionStore);

} catch (e) {
    console.error("Erro ao configurar provador:", e);
}

        // 2. Processamento Restante
        checkStoreStatus(state.storeConfigGlobal);
        state.banners = data.banners || [];
        state.categories = Array.from(new Set(data.produtos.map(p => p.category).filter(Boolean))).sort();

        // 3. Renderização
        applyStoreConfig(data.config);
        renderHeroCarousel(state.banners);
        renderCategoryTabs();
        
        // Renderiza com as views injetadas
        await renderCatalog();
        
        updatePremiumLoader(100);
        window.updateNavigationBadges();
        registerVisit(); 
        checkDeepLink();

    } catch (error) {
        console.error("❌ Erro fatal no initFlow:", error);
        const loader = document.getElementById('premium-loader');
        if(loader) loader.style.display = 'none';
    }
}
// --- 3. CONFIGURAÇÕES VISUAIS DINÂMICAS ---

function applyStoreConfig(d) {
    state.lojaZapDestino = (d.whatsappNumber || "").replace(/\D/g, "");
    
    const primary = d.primaryColor || '#EA1D2C';
    document.documentElement.style.setProperty('--color-primary', primary);
    document.documentElement.style.setProperty('--color-primary-dark', primary);
    
    const metaTheme = document.getElementById('theme-color-meta');
    if(metaTheme) metaTheme.setAttribute('content', primary);

    document.title = d.storeName || "Vitrine Online";
    const storeNameEl = document.getElementById('storeNameDisplay');
    if (storeNameEl) storeNameEl.textContent = d.storeName;
    
    document.getElementById('footerStoreName').textContent = d.storeName;
    document.getElementById('footerDescription').textContent = d.footerText || "Qualidade e confiança.";
    
    if (d.logoUrl) { 
        const logoImg = document.getElementById('storeLogoImg');
        if(logoImg) logoImg.src = d.logoUrl; 
        
        const logoCont = document.getElementById('logoContainer');
        if(logoCont) logoCont.classList.remove('hidden'); 
        
        // Alimenta o Loader com a logo da loja
        updatePremiumLoader(30, d.logoUrl); 
    }

    state.deliveryAreas = d.deliveryAreas || [];
    const deliverySelect = document.getElementById('cartDeliverySelect');
    if (deliverySelect) {
        deliverySelect.innerHTML = '<option value="0">Retirar na Loja</option>' + 
            state.deliveryAreas.map(a => `<option value="${a.fee}">${a.name} (R$ ${parseFloat(a.fee).toFixed(2).replace('.',',')})</option>`).join('');
    }
}

// --- 4. FUNÇÕES GLOBAIS ---

window.toggleFavorite = (id) => { 
    const idx = state.favorites.indexOf(id); 
    let isAdded = false;

    if(idx > -1) {
        state.favorites.splice(idx, 1); 
    } else {
        state.favorites.push(id);
        isAdded = true;
        window.reportarMetrica(id, 'fav'); 
    }

    localStorage.setItem(state.FAV_KEY, JSON.stringify(state.favorites));

    // 1. Atualiza o Catálogo principal (se estiver visível ao fundo)
    renderCatalog(); 
    updateFavoritesUI(); 
    window.updateNavigationBadges();

    // 2. ATUALIZAÇÃO PARA O DISCOVERY FEED (REELS)
    // Procura o botão de coração específico desse produto dentro do feed
    const reelItem = document.querySelector(`.reel-item[data-id="${id}"]`);
    if (reelItem) {
        const heartIcon = reelItem.querySelector('[data-lucide="heart"]');
        if (heartIcon) {
            if (isAdded) {
                heartIcon.classList.add('fill-red-500', 'text-red-500');
                heartIcon.classList.remove('text-white');
            } else {
                heartIcon.classList.remove('fill-red-500', 'text-red-500');
                heartIcon.classList.add('text-white');
            }
            // Força o Lucide a renderizar se necessário, mas as classes acima já resolvem
        }
    }
};

window.addToCart = (product, qty, options) => {
    addToCart(product, qty, options);
    if (product && product.id) window.reportarMetrica(product.id, 'cart');
    window.updateNavigationBadges();
};

window.quickAdd = (id) => { 
    const p = state.allProducts.find(x => x.id === id); 
    if(!p) return;
    if((p.sizes && p.sizes.length > 0) || (p.colors && p.colors.length > 0)) {
        openProductModal(id); 
    } else {
        window.addToCart(p, 1, {}); 
        showToast("Adicionado ao carrinho!");
    }
    window.updateNavigationBadges();
};
// FUNÇÃO PARA CONFIGURAR O BOTÃO DO RODAPÉ
function setupFooterButton(useProvador) {
    const btnEntrega = document.getElementById('btnOpenDelivery'); 
    if (!btnEntrega) return;

    if (useProvador) {
        btnEntrega.innerHTML = `
            <div class="flex flex-col items-center gap-0.5 text-primary-600">
                <div class="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center shadow-sm border border-primary-200">
                    <i data-lucide="shirt" class="w-5 h-5"></i>
                </div>
                <span class="text-[9px] font-black uppercase tracking-tighter">Provador</span>
            </div>
        `;
        btnEntrega.onclick = (e) => {
            e.preventDefault();
            window.openProvador();
        };
    } else {
        // Se não for loja de roupa, o botão continua o padrão de entregas
        btnEntrega.innerHTML = `
            <div class="flex flex-col items-center gap-0.5 text-slate-500">
                <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <i data-lucide="truck" class="w-5 h-5"></i>
                </div>
                <span class="text-[9px] font-black uppercase tracking-tighter">Entrega</span>
            </div>
        `;
        btnEntrega.onclick = () => window.openDeliveryModal();
    }
    if (window.lucide) lucide.createIcons();
}
// --- 5. ANALYTICS ---


window.reportarMetrica = async function(produtoId, tipoAcao) {
    try {
        if (!state.STORE_ID || !produtoId) return;

        // Chamada para o SEU backend (ajuste a URL se necessário)
        await fetch('/api/produtos/metricas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                lojaId: state.STORE_ID, 
                produtoId: produtoId, 
                acao: tipoAcao 
            })
        });
        console.log(`📊 Métrica enviada: ${tipoAcao} no produto ${produtoId}`);
    } catch (err) { 
        console.warn("Métrica não enviada:", err); 
    }
};

async function registerVisit() {
    // 1. Só registra se houver um ID de loja válido e não for admin
    if (!state.STORE_ID || ['admin', 'index', 'undefined', ''].includes(state.STORE_ID)) return;

    // 2. Evita duplicar visita na mesma aba/sessão
    const sessionKey = `vst_${state.STORE_ID}`;
    if (sessionStorage.getItem(sessionKey)) return;

    try {
        // Chamada para o seu backend
        const response = await fetch(`/api/produtos/${state.STORE_ID}/visit`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            sessionStorage.setItem(sessionKey, "1");
            console.log("🚀 Visita registrada com sucesso!");
        }
    } catch (err) { 
        console.warn("⚠️ Não foi possível registrar a visita (offline ou erro de rede)."); 
    }
}


// --- 6. HANDLERS DE UI ---

window.renderCatalog = renderCatalog;
window.handleSearchInput = handleSearchInput;
// --- LOGICA DA BARRA DE PESQUISA EXPANSÍVEL ---
window.toggleSearchBar = function() {
    const searchBar = document.getElementById('expandableSearch');
    const searchInput = document.getElementById('mobileSearch');
    
    if (!searchBar || !searchInput) return;

    if (searchBar.classList.contains('hidden')) {
        // 1. Mostra a barra
        searchBar.classList.remove('hidden');
        // 2. Foca no input automaticamente para abrir o teclado no mobile
        setTimeout(() => searchInput.focus(), 150);
    } else {
        // 1. Esconde a barra
        searchBar.classList.add('hidden');
        // 2. Limpa o texto da busca ao fechar
        searchInput.value = '';
        // 3. Reseta o catálogo para mostrar todos os produtos novamente
        if(window.handleSearchInput) window.handleSearchInput('');
    }
};

// --- ATUALIZAÇÃO DOS BADGES (CONTADORES) ---
window.updateNavigationBadges = function() {
    const cartCount = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const favCount = state.favorites.length;

    const cBadge = document.getElementById('cartBadgeBottom');
    const fBadge = document.getElementById('favBadgeBottom');

    if (cBadge) {
        cBadge.innerText = cartCount;
        // Só mostra a bolinha se tiver itens
        if (cartCount > 0) cBadge.classList.add('badge-visible');
        else cBadge.classList.remove('badge-visible');
    }

    if (fBadge) {
        fBadge.innerText = favCount;
        // Só mostra a bolinha se tiver favoritos
        if (favCount > 0) fBadge.classList.add('badge-visible');
        else fBadge.classList.remove('badge-visible');
    }
};

window.resetAllFilters = resetAllFilters;
window.openFilterDrawer = openFilterDrawer;
window.closeFilterDrawer = closeFilterDrawer;
window.openProductModal = openProductModal;
window.closeModalDetails = closeModalDetails;
window.openDeliveryModal = openDeliveryModal;
window.openImageZoom = openImageZoom;
window.closeImageZoom = closeImageZoom;
window.setDetailImage = setDetailImage;
window.shareProduct = shareProduct;
window.adjustDetailQty = adjustDetailQty;
window.toggleFavoritesView = toggleFavoritesView;
window.modQty = modQty;
window.checkoutWhatsApp = checkoutWhatsApp;
window.goToStep1 = goToStep1;
window.goToStep2 = goToStep2;
window.toggleAddressFields = toggleAddressFields;

window.openCartModal = () => { 
    goToStep1(); 
    document.getElementById('modalCart').classList.remove('hidden'); 
    setTimeout(() => document.getElementById('cartDrawer').classList.remove('translate-x-full'), 10); 
};

window.closeCartModal = () => { 
    document.getElementById('cartDrawer').classList.add('translate-x-full'); 
    setTimeout(() => document.getElementById('modalCart').classList.add('hidden'), 300); 
};

function checkDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const prodId = urlParams.get('p');
    if (prodId && state.allProducts.some(x => x.id === prodId)) {
        setTimeout(() => openProductModal(prodId), 500);
    }
}

// --- CORREÇÃO DO CAMPO DE PARCELAS ---
document.addEventListener('change', (e) => {
    if(e.target.id === 'checkPayment') {
        // Convertemos para minúsculo para aceitar "Cartão", "cartão" ou "cartao"
        const method = e.target.value.toLowerCase(); 
        const changeField = document.getElementById('changeField');
        const installmentsField = document.getElementById('cardInstallmentsField');
        
        // Lógica para Dinheiro (Exibe campo de troco)
        if(changeField) {
            method.includes('dinheiro') 
                ? changeField.classList.remove('hidden') 
                : changeField.classList.add('hidden');
        }
        
        // Lógica para Cartão (Exibe campo de parcelas)
        if(installmentsField) {
            // Verifica se a palavra contém "cart" (pega cartão, cartao, crédito, etc)
            (method.includes('cart') || method.includes('crédito')) 
                ? installmentsField.classList.remove('hidden') 
                : installmentsField.classList.add('hidden');
        }
        
        updateCartTotals(); // Atualiza os totais do carrinho
    }
});

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
    
// --- 7. UTILS DE LOADER PREMIUM ---

function updatePremiumLoader(progress, logoUrl = null) {
    const bar = document.getElementById('loaderProgressBar');
    const loaderImg = document.getElementById('loaderStoreLogo');
    const loader = document.getElementById('initialLoader');

    if (bar) bar.style.width = `${progress}%`;
    
    if (logoUrl && loaderImg) {
        loaderImg.src = logoUrl;
        loaderImg.classList.remove('hidden');
    }

    if (progress >= 100 && loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            const app = document.getElementById('app');
            if(app) {
                app.classList.remove('hidden');
                app.style.opacity = '1';
            }
            setTimeout(() => loader.classList.add('hidden'), 500);
        }, 500);
    }
}

window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    const provadorProducts = state.allProducts.filter(p => p.posicaoProvador === 'superior' || p.posicaoProvador === 'inferior');
    const sizesOnlyProvador = [...new Set(provadorProducts.flatMap(p => p.sizes || []))].sort();
    
    let sizeT = 'Todos';
    let sizeB = 'Todos';

    container.innerHTML = `
        <style>
            .p-card { position: relative; }
            /* Badge de Preço e Tamanho no Card */
            .p-info-badge {
                position: absolute; top: 10px; right: 10px;
                background: rgba(255,255,255,0.9); padding: 4px 8px;
                border-radius: 8px; font-size: 10px; font-weight: 800;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 5;
            }
            /* Seletor de Cores Lateral */
            .color-variants {
                position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 8px; z-index: 10;
            }
            .color-dot {
                width: 35px; height: 35px; border-radius: 8px;
                border: 2px solid white; object-fit: cover;
                box-shadow: 0 4px 8px rgba(0,0,0,0.15); transition: 0.2s;
            }
            .color-dot:active { transform: scale(0.9); }
            .active-piece .color-variants { opacity: 1; }
            .p-card:not(.active-piece) .color-variants { opacity: 0; pointer-events: none; }
        </style>

        <div class="peças-container">
            <div id="deckTop" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full"></div>
            <div id="deckBot" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full"></div>
        </div>

        <div id="provHeader">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-black italic tracking-tighter uppercase">Mix & Match</h2>
                <button id="btnCloseProvador" class="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center shadow-lg">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <select id="selTop" class="bg-white border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-bold shadow-sm">
                    <option value="Todos">TOP: TODOS</option>
                    ${sizesOnlyProvador.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
                <select id="selBot" class="bg-white border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-bold shadow-sm">
                    <option value="Todos">BOTTOM: TODOS</option>
                    ${sizesOnlyProvador.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
        </div>

        <div id="provFooter">
            <div class="flex justify-between items-end mb-4">
                <div>
                    <p id="pTotal" class="text-3xl font-black text-slate-900 leading-none">R$ 0,00</p>
                    <span class="text-[10px] font-bold text-red-600 uppercase tracking-widest">Look Selecionado</span>
                </div>
                <div id="miniPrev" class="flex -space-x-2"></div>
            </div>
            <button id="btnFinalizarLook" class="w-full h-16 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-3 active:scale-95 transition-transform">
                <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                Adicionar ao Carrinho
            </button>
        </div>
    `;

    // --- FUNÇÃO PARA TROCAR FOTO DA VARIAÇÃO ---
    window.changeProvadorThumb = (btn, newImg) => {
        const card = btn.closest('.p-card');
        const mainImg = card.querySelector('.main-img');
        mainImg.src = newImg;
        card.dataset.img = newImg; // Atualiza para o carrinho pegar a foto certa
        updateUI();
    };

    const fecharTotal = () => {
        container.classList.add('hidden');
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    container.onclick = function(e) {
        if (e.target.closest('#btnCloseProvador')) fecharTotal();

        if (e.target.closest('#btnFinalizarLook')) {
            const t = document.querySelector('#deckTop .active-piece');
            const b = document.querySelector('#deckBot .active-piece');
            if(!t && !b) return alert("Selecione uma peça!");

            if(t) {
                const p = state.allProducts.find(x => x.id == t.dataset.id);
                window.addToCart(p, 1, { selectedSize: sizeT !== 'Todos' ? sizeT : (p.sizes?.[0] || 'UN'), image: t.dataset.img });
            }
            if(b) {
                const p = state.allProducts.find(x => x.id == b.dataset.id);
                window.addToCart(p, 1, { selectedSize: sizeB !== 'Todos' ? sizeB : (p.sizes?.[0] || 'UN'), image: b.dataset.img });
            }
            if(window.showToast) showToast("Look adicionado!");
            fecharTotal();
        }
    };

    container.querySelector('#selTop').onchange = (e) => { sizeT = e.target.value; render(); };
    container.querySelector('#selBot').onchange = (e) => { sizeB = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.classList.remove('hidden');
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const render = () => {
        const tops = state.allProducts.filter(p => p.posicaoProvador === 'superior' && (sizeT === 'Todos' || p.sizes?.includes(sizeT)));
        const bots = state.allProducts.filter(p => p.posicaoProvador === 'inferior' && (sizeB === 'Todos' || p.sizes?.includes(sizeB)));

        const makeHtml = (list) => list.map(p => {
            // Gerar miniaturas se o produto tiver mais de uma imagem
            const variantsHtml = p.images.length > 1 ? `
                <div class="color-variants">
                    ${p.images.slice(0, 4).map(img => `
                        <img src="${img}" class="color-dot" onclick="window.changeProvadorThumb(this, '${img}')">
                    `).join('')}
                </div>
            ` : '';

            return `
                <div class="p-card snap-center" data-id="${p.id}" data-price="${p.value}" data-img="${p.images[0]}">
                    <div class="p-info-badge">
                        R$ ${p.value.toFixed(2)} | ${p.sizes ? p.sizes.join('/') : 'UN'}
                    </div>
                    ${variantsHtml}
                    <img src="${p.images[0]}" class="main-img">
                </div>`;
        }).join('');

        document.getElementById('deckTop').innerHTML = makeHtml(tops) || '<div class="w-full text-center py-10 opacity-40">Vazio</div>';
        document.getElementById('deckBot').innerHTML = makeHtml(bots) || '<div class="w-full text-center py-10 opacity-40">Vazio</div>';
        
        setupScroll('deckTop');
        setupScroll('deckBot');
    };

    const setupScroll = (id) => {
        const el = document.getElementById(id);
        el.onscroll = () => {
            const center = el.scrollLeft + el.offsetWidth / 2;
            el.querySelectorAll('.p-card').forEach(card => {
                const c = card.offsetLeft + card.offsetWidth / 2;
                card.classList.toggle('active-piece', Math.abs(center - c) < 60);
            });
            clearTimeout(el.timer);
            el.timer = setTimeout(() => updateUI(), 100);
        };
        setTimeout(() => el.dispatchEvent(new Event('scroll')), 200);
    };

    const updateUI = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        const total = (Number(t?.dataset.price || 0) + Number(b?.dataset.price || 0));
        document.getElementById('pTotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
        document.getElementById('miniPrev').innerHTML = `
            ${t ? `<img src="${t.dataset.img}" class="w-10 h-10 rounded-full border-2 border-white object-cover bg-white shadow-sm">` : ''}
            ${b ? `<img src="${b.dataset.img}" class="w-10 h-10 rounded-full border-2 border-white object-cover bg-white shadow-sm">` : ''}
        `;
    };

    render();
};
