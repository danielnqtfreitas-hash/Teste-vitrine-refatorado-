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
});

// --- 2. FLUXO DE DADOS (API NODE.JS) ---

async function initFlow() {
    try {
        // 1. Início imediato
        updatePremiumLoader(10); 

        const response = await fetch(`/api/produtos/${state.STORE_ID}`);
        if (!response.ok) throw new Error("Loja não encontrada no servidor");
        
        const data = await response.json(); 
        
        // 2. Dados recebidos (Meio do caminho)
        updatePremiumLoader(50); 

        if (data.config.subscriptionStatus === 'suspended') { 
            hideLoader(); 
            document.body.innerHTML = `
                <div class="flex flex-col h-screen items-center justify-center p-6 text-center bg-white">
                    <div class="bg-red-50 p-4 rounded-full mb-4"><i data-lucide="shield-off" class="text-red-500 w-8 h-8"></i></div>
                    <h1 class="text-slate-800 font-bold text-xl">Loja Suspensa</h1>
                    <p class="text-slate-500 mt-2">Esta vitrine está temporariamente offline.</p>
                </div>
            `;
            lucide.createIcons();
            return; 
        }

        state.storeConfigGlobal = data.config;
        state.allProducts = data.produtos;
        checkStoreStatus(state.storeConfigGlobal);
        state.banners = data.banners || [];
        state.categories = Array.from(new Set(data.produtos.map(p => p.category).filter(Boolean))).sort();

        // Aplica cores e o logo no Loader
        applyStoreConfig(data.config);
        
        renderHeroCarousel(state.banners);
        renderCategoryTabs();
        
        // Renderiza o catálogo (ainda oculto pelo loader)
        await renderCatalog();
        
        // 3. Tudo pronto nos bastidores
        updatePremiumLoader(80); 
        
        populateFilterOptions();
        updateFavoritesUI();
        updateCartUI();
        checkDeepLink(); 
        registerVisit(); 
        window.updateNavigationBadges();

        // 4. FINALIZAÇÃO COM DELAY (3 segundos para branding)
        setTimeout(() => {
            updatePremiumLoader(100);
            console.log(`🚀 Vitrine [${state.STORE_ID}] carregada com sucesso.`);
        }, 3000);

    } catch (error) {
        console.error("Erro crítico no carregamento:", error);
        hideLoader(); 
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
    if(idx > -1) {
        state.favorites.splice(idx, 1); 
    } else {
        state.favorites.push(id);
        window.reportarMetrica(id, 'fav'); 
    }
    localStorage.setItem(state.FAV_KEY, JSON.stringify(state.favorites));
    renderCatalog(); 
    updateFavoritesUI(); 
    window.updateNavigationBadges();
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

// --- 5. ANALYTICS ---

window.reportarMetrica = async function(produtoId, tipoAcao) {
    try {
        if (!state.STORE_ID || !produtoId) return;
        fetch('/api/produtos/metricas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lojaId: state.STORE_ID, produtoId: produtoId, acao: tipoAcao })
        });
    } catch (err) { console.warn("Métrica não enviada."); }
};

async function registerVisit() {
    if (!state.STORE_ID || ['admin', 'index'].includes(state.STORE_ID)) return;
    const sessionKey = `vst_${state.STORE_ID}`;
    if (sessionStorage.getItem(sessionKey)) return;
    try {
        const response = await fetch(`/api/produtos/${state.STORE_ID}/visit`, { method: 'POST' });
        if (response.ok) sessionStorage.setItem(sessionKey, "1");
    } catch (err) { console.warn("Log de visita offline."); }
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

// --- =========================================================================
//     DISCOVERY FEED - MOTOR DE ENGAJAMENTO (v1.0 Shopee Like)
//     Replica a UX da Shopee/Mercado Livre usando dados do Firebase/Node
// =========================================================================

// Função para abrir o Feed (Gera o conteúdo e trava a vitrine)
window.openDiscoveryFeed = function() {
    const container = document.getElementById('reelsContainer');
    const feed = document.getElementById('discoveryFeed');
    const navBottom = document.getElementById('mainNavBottom');
    
    // Blindagem de segurança
    if (!container || !feed || !state.allProducts || state.allProducts.length === 0) {
        showToast("Nenhum produto disponível para o feed.");
        return;
    }

    // 1. Gera o HTML imersivo baseado no estado real da loja
    container.innerHTML = state.allProducts.map((p, index) => {
        
        // Formata os dados
        const formattedPrice = `R$ ${p.price.toFixed(2).replace('.',',')}`;
        const hasDiscount = p.oldPrice && p.oldPrice > p.price;
        const formattedOldPrice = hasDiscount ? `R$ ${p.oldPrice.toFixed(2).replace('.',',')}` : '';
        
        // Verifica se é favorito (para pintar o coração)
        const isFavorite = state.favorites.includes(p.id);
        
        // Pega as visualizações reais (vindo do backend/state)
        // Se o campo não existir, coloca um número base ou zero
        const viewsCount = p.views ? p.views.toLocaleString('pt-BR') : '1.050'; 

        return `
            <div class="reel-item" data-id="${p.id}">
                
                <div class="reel-media-cont">
                    <img src="${p.image}" loading="${index === 0 ? 'eager' : 'lazy'}" class="reel-main-media">
                </div>

                <div class="reel-overlay"></div>
                
                <div class="reel-actions-sidebar">
                    
                    <div class="action-btn-cont">
                        <button onclick="window.toggleFavorite('${p.id}'); setTimeout(window.openDiscoveryFeed, 100);" class="${isFavorite ? 'is-fav' : ''}">
                            <i data-lucide="heart" class="w-6 h-6"></i>
                        </button>
                        <span>Incluir em favoritos</span>
                    </div>

                    <div class="action-btn-cont">
                        <button onclick="window.shareProductDirect('${p.id}', '${p.name}')">
                            <i data-lucide="share" class="w-6 h-6"></i>
                        </button>
                        <span>Compartilhar</span>
                    </div>

                    <div class="action-btn-cont mt-2 opacity-80">
                        <i data-lucide="eye" class="w-5 h-5 text-white/70"></i>
                        <span class="text-[9px] font-mono text-white/70 mt-1">${viewsCount} visualizações</span>
                    </div>
                </div>

                <div class="reel-text-info">
                    <p class="text-[11px] font-extrabold uppercase tracking-widest text-white/70 mb-1">${state.storeConfigGlobal.storeName || 'DANDAN'}</p>
                    <h2 class="text-base font-bold text-white leading-snug line-clamp-2">${p.name}</h2>
                </div>

                <div class="reel-product-card active-scale" onclick="window.openProductModalFromFeed('${p.id}')">
                    <img src="${p.image}" class="reel-prod-img" alt="Produto">
                    <div class="reel-prod-details">
                        <p class="reel-prod-name">${p.name}</p>
                        <div class="reel-prod-price-row">
                            <span class="reel-prod-price">${formattedPrice}</span>
                            ${hasDiscount ? `<span class="reel-prod-old-price">${formattedOldPrice}</span>` : ''}
                        </div>
                    </div>
                    <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300 ml-auto"></i>
                </div>

            </div>
        `;
    }).join('');

    // 2. Abre o feed e gerencia a UI
    feed.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Trava o scroll do fundo
    if (navBottom) navBottom.classList.add('hidden'); // Oculta a barra inferior

    // 3. Inicializa os ícones Lucide nos novos elementos
    setTimeout(() => {
        lucide.createIcons();
        window.updateNavigationBadges(); // Atualiza contadores caso algo mude
    }, 50);
};

// Função para fechar o Feed
window.closeDiscoveryFeed = function() {
    const feed = document.getElementById('discoveryFeed');
    const navBottom = document.getElementById('mainNavBottom');
    
    if (!feed) return;
    feed.classList.add('hidden');
    document.body.style.overflow = ''; // Libera o scroll
    if (navBottom) navBottom.classList.remove('hidden'); // Devolve a barra inferior
};

// Handler para abrir o modal de compra de dentro do Feed
window.openProductModalFromFeed = function(productId) {
    // 1. Fecha o feed para não poluir
    window.closeDiscoveryFeed();
    // 2. Chama a função original que abre o modal de compra com atraso suave
    setTimeout(() => window.openProductModal(productId), 150);
};

// Handler para compartilhamento direto no feed
window.shareProductDirect = function(id, name) {
    if (navigator.share) {
        navigator.share({
            title: name,
            text: `Confira este produto na ${state.storeConfigGlobal.storeName || 'Dandan'}!`,
            url: `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${state.STORE_ID}&p=${id}`
        }).catch(() => showToast("Erro ao compartilhar."));
    } else {
        showToast("Seu navegador não suporta compartilhamento.");
    }
};


// --- 7. UTILS DE LOADER PREMIUM ---

function updatePremiumLoader(progress, logoUrl = null) {
    const bar = document.getElementById('loaderProgressBar');
    const loaderImg = document.getElementById('loaderStoreLogo');
    const loaderIcon = document.getElementById('loaderDefaultIcon');
    const loader = document.getElementById('initialLoader');

    if (bar) bar.style.width = `${progress}%`;
    
    if (logoUrl && loaderImg) {
        loaderImg.src = logoUrl;
        loaderImg.classList.remove('hidden');
        if(loaderIcon) loaderIcon.classList.add('hidden');
    }

    if (progress >= 100 && loader) {
        // Inicia animação de saída (Slide up + Fade out)
        loader.style.transform = 'translateY(-100%)';
        loader.style.opacity = '0';
        
        setTimeout(() => {
            loader.classList.add('hidden');
            const app = document.getElementById('app');
            if(app) {
                app.classList.remove('hidden');
                app.classList.add('animate-reveal-up'); // Revelação suave do conteúdo
                app.style.opacity = '1';
            }
        }, 800);
    }
}

