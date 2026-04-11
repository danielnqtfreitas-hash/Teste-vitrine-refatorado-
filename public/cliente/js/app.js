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

// Importante: Garante que o Firebase está carregado para usar o increment
// Se não usar módulos, certifique-se de ter o Firebase Firestore disponível

window.openDiscoveryFeed = function() {
    const feed = document.getElementById('discoveryFeed');
    const app = document.getElementById('app'); 
    const navBottom = document.getElementById('mainNavBottom');
    const container = document.getElementById('reelsContainer');
    
    if (!feed || !container) return;

    if (app) app.classList.add('hidden');
    if (navBottom) navBottom.classList.add('hidden');
    document.body.style.overflow = 'hidden';

    feed.classList.remove('hidden');
    feed.style.display = 'flex'; 

    if (!state.allProducts || state.allProducts.length === 0) {
        container.innerHTML = `<div class="text-white p-10">Nenhum produto disponível.</div>`;
        return;
    }

    container.innerHTML = state.allProducts.map((p) => {
        const imgUrl = (p.images && p.images.length > 0) ? p.images[0] : '';
        const precoBruto = p.value || p.priceCard || 0;
        const formattedPrice = `R$ ${Number(precoBruto).toFixed(2).replace('.', ',')}`;
        const isFavorite = state.favorites && state.favorites.includes(p.id);
        
        // Quantidade de visualizações (se não existir no banco, mostra 0)
        const views = p.views || 0;

        // Chamada para incrementar visualização ao carregar
        window.trackView(p.id);

        return `
            <div class="reel-item" style="height: 100dvh; scroll-snap-align: start; position: relative; background: #000; overflow: hidden;">
                <div class="reel-media-cont" style="position: absolute; inset: 0; z-index: 1; background: #111;">
                    <img src="${imgUrl}" class="zoom-animation"
                         style="width: 100%; height: 100%; object-fit: cover;">
                </div>

                <div class="reel-overlay" style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%); z-index: 2; pointer-events: none;"></div>
                
                <div class="reel-actions-sidebar" style="position: absolute; right: 16px; bottom: 180px; z-index: 10; display: flex; flex-direction: column; gap: 20px; align-items: center;">
                    
                    <div class="flex flex-col items-center">
                        <i data-lucide="eye" class="text-white w-6 h-6 opacity-80"></i>
                        <span class="text-white text-[10px] font-bold mt-1">${views}</span>
                    </div>

                    <div class="flex flex-col items-center">
                        <button onclick="window.toggleFavorite('${p.id}')" 
                                class="w-[50px] h-[50px] rounded-full flex items-center justify-center border border-white/20"
                                style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);">
                            <i data-lucide="heart" class="w-7 h-7 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white'}"></i>
                        </button>
                        <span class="text-white text-[10px] font-bold mt-1">Gostar</span>
                    </div>

                    <div class="flex flex-col items-center">
                        <button onclick="window.shareProduct('${p.id}', '${p.name}', '${imgUrl}')" 
                                class="w-[50px] h-[50px] rounded-full flex items-center justify-center border border-white/20"
                                style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);">
                            <i data-lucide="share" class="w-7 h-7 text-white"></i>
                        </button>
                        <span class="text-white text-[10px] font-bold mt-1">Enviar</span>
                    </div>
                </div>

                <div class="reel-text-info" style="position: absolute; left: 16px; bottom: 125px; z-index: 10; max-width: 80%;">
                    <h2 class="text-xl font-bold text-white shadow-sm">${p.name}</h2>
                </div>

                <div class="reel-product-card" onclick="window.openProductModalFromFeed('${p.id}')" 
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
};

// --- FUNÇÃO DE COMPARTILHAR (USA API NATIVA DO CELULAR) ---
window.shareProduct = async function(id, name, img) {
    const shareData = {
        title: name,
        text: `Olha esse produto na Vitrine: ${name}`,
        url: window.location.href + (window.location.href.includes('?') ? '&' : '?') + `prod=${id}`
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback caso não suporte (Copia link)
            navigator.clipboard.writeText(shareData.url);
            alert("Link copiado para a área de transferência!");
        }
    } catch (err) {
        console.log("Erro ao compartilhar", err);
    }
};

// --- FUNÇÃO DE VISUALIZAÇÃO (FIREBASE) ---
window.trackView = function(productId) {
    // Aqui você deve usar a referência do seu Firestore
    // Exemplo: const docRef = doc(db, "products", productId);
    // updateDoc(docRef, { views: increment(1) });
    console.log("👁️ Visualização registrada para:", productId);
};
// 2. Função para Fechar o Feed
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

// 3. Função para Abrir o Modal do Produto vindo do Feed
window.openProductModalFromFeed = function(productId) {
    console.log("🎯 Abrindo produto:", productId);
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



