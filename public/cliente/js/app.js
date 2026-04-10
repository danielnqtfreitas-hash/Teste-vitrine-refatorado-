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


// =========================================================================
//     DISCOVERY FEED - MOTOR COMPLETO (v1.6 - Fix Visibility)
// =========================================================================

// =========================================================================
//     DISCOVERY FEED - MODO ÁREA DEDICADA (v3.0)
// =========================================================================

window.openDiscoveryFeed = function() {
    console.log("🚀 Migrando para Área Discovery...");
    
    const mainContent = document.getElementById('app'); 
    const discoveryArea = document.getElementById('discoveryArea');
    const navBottom = document.getElementById('mainNavBottom');
    const container = document.getElementById('reelsContainer');

    if (!state.allProducts || state.allProducts.length === 0) {
        if(window.showToast) showToast("Carregando produtos...");
        return;
    }

    // 1. TROCA DE ESTADOS (Esconde catálogo, mostra feed)
    if (mainContent) mainContent.classList.add('hidden');
    if (navBottom) navBottom.classList.add('hidden');
    
    discoveryArea.classList.remove('hidden');
    discoveryArea.classList.add('block');

    // 2. RENDERIZAÇÃO DOS ITENS
    container.innerHTML = state.allProducts.map((p, index) => {
        const formattedPrice = `R$ ${p.price.toFixed(2).replace('.',',')}`;
        const isFavorite = state.favorites.includes(p.id);

        return `
            <div class="reel-item relative h-screen w-full snap-start bg-black overflow-hidden flex flex-col">
                <div class="absolute inset-0 w-full h-full flex items-center justify-center bg-zinc-900">
                    <img src="${p.image}" loading="${index === 0 ? 'eager' : 'lazy'}" class="w-full h-full object-cover opacity-70">
                </div>

                <div class="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90 pointer-events-none"></div>
                
                <div class="absolute right-4 bottom-32 z-[510] flex flex-col gap-6 items-center">
                    <button onclick="window.toggleFavoriteFromFeed('${p.id}')" 
                            class="p-4 bg-white/10 backdrop-blur-xl rounded-full ${isFavorite ? 'text-red-500' : 'text-white'} active:scale-125 transition-all">
                        <i data-lucide="heart" class="w-8 h-8 ${isFavorite ? 'fill-current' : ''}"></i>
                    </button>

                    <button onclick="window.shareProductDirect('${p.id}', '${p.name.replace(/'/g, "\\'")}')" 
                            class="p-4 bg-white/10 backdrop-blur-xl rounded-full text-white active:scale-110 transition-all">
                        <i data-lucide="share" class="w-8 h-8"></i>
                    </button>
                </div>

                <div class="absolute bottom-0 left-0 w-full p-5 pb-10 z-[510]">
                    <div class="mb-4 text-white ml-1">
                        <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-1">${state.storeConfigGlobal.storeName || 'Destaque'}</p>
                        <h2 class="text-xl font-bold line-clamp-2 leading-tight">${p.name}</h2>
                    </div>

                    <div class="bg-white/10 backdrop-blur-2xl border border-white/20 p-4 rounded-3xl flex items-center gap-4 active:scale-[0.98] transition-transform" 
                         onclick="window.goToProductFromFeed('${p.id}')">
                        <img src="${p.image}" class="w-14 h-14 object-cover rounded-xl shadow-2xl">
                        <div class="flex-1">
                            <p class="text-white text-xs font-medium opacity-80 truncate w-40">${p.name}</p>
                            <p class="text-white font-black text-lg">${formattedPrice}</p>
                        </div>
                        <div class="bg-primary p-3 rounded-2xl text-white shadow-lg">
                            <i data-lucide="shopping-bag" class="w-6 h-6"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 3. FINALIZAÇÃO
    container.scrollTop = 0;
    document.body.style.overflow = 'hidden'; 
    
    setTimeout(() => {
        if (window.lucide) lucide.createIcons();
    }, 100);
};

// --- FUNÇÕES DE NAVEGAÇÃO DA ÁREA ---

window.backToCatalog = function() {
    const mainContent = document.getElementById('app');
    const discoveryArea = document.getElementById('discoveryArea');
    const navBottom = document.getElementById('mainNavBottom');

    discoveryArea.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
    if (navBottom) navBottom.classList.remove('hidden');
    
    document.body.style.overflow = '';
};

window.goToProductFromFeed = function(productId) {
    // Fecha o feed e abre o modal de compra no catálogo
    window.backToCatalog();
    setTimeout(() => {
        if (window.openProductModal) window.openProductModal(productId);
    }, 300);
};

window.toggleFavoriteFromFeed = function(id) {
    if (window.toggleFavorite) {
        window.toggleFavorite(id);
        // Atualização visual simples sem remontar o feed
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        const isFav = state.favorites.includes(id);
        
        btn.classList.toggle('text-red-500', isFav);
        btn.classList.toggle('text-white', !isFav);
        if (icon) icon.classList.toggle('fill-current', isFav);
    }
};

window.shareProductDirect = function(id, name) {
    const url = `${window.location.origin}${window.location.pathname}?id=${state.STORE_ID}&p=${id}`;
    if (navigator.share) {
        navigator.share({ title: name, url: url });
    } else {
        navigator.clipboard.writeText(url);
        if(window.showToast) showToast("Link copiado!");
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



