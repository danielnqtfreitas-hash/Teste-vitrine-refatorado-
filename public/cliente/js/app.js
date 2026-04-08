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
    
    // Tenta identificar o ID da loja (URL Param -> Path -> LocalStorage)
    let storeId = urlParams.get('id') || 
                  (pathSegments[1] && pathSegments[1] !== "index.html" ? pathSegments[1] : null) || 
                  localStorage.getItem('last_store_id');
    
    // Fallback de segurança para não quebrar o carregamento
    if (!storeId || ["index.html", "undefined", "null", ""].includes(storeId)) {
        storeId = "admin"; // ID padrão ou redirecionamento
    }

    // Persiste para visitas futuras
    localStorage.setItem('last_store_id', storeId);

    // Mágica de URL: Mantém o ?id= sempre visível para evitar erros de refresh
    if (!urlParams.get('id')) {
        const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${storeId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    // Limpa o carrinho se o usuário trocar de loja (Segurança Multitenant)
    const activeSession = localStorage.getItem('active_store_session');
    if (activeSession && activeSession !== storeId) {
        localStorage.removeItem('cart');
        state.cart = [];
    }
    localStorage.setItem('active_store_session', storeId);

    // Configura o estado inicial
    setStoreId(storeId);
    loadFavorites();
    loadCart();
    
    // Autenticação anônima obrigatória para persistência Firebase
    await signInAnonymously(auth);
    onAuthStateChanged(auth, (user) => { 
        if(user) initFlow(); 
    });

    setupSwipes();
});

// --- 2. FLUXO DE DADOS (API NODE.JS) ---

async function initFlow() {
    try {
        // Busca o "pacote" completo da loja via seu Backend no Render
        const response = await fetch(`/api/produtos/${state.STORE_ID}`);
        if (!response.ok) throw new Error("Loja não encontrada no servidor");
        
        const data = await response.json(); 

        // Verificação de Assinatura/Status
        if (data.config.subscriptionStatus === 'suspended') { 
            document.body.innerHTML = `
                <div class="flex flex-col h-screen items-center justify-center p-6 text-center">
                    <div class="bg-red-50 p-4 rounded-full mb-4"><i data-lucide="shield-off" class="text-red-500 w-8 h-8"></i></div>
                    <h1 class="text-slate-800 font-bold text-xl">Loja Suspensa</h1>
                    <p class="text-slate-500 mt-2">Esta vitrine está temporariamente offline.</p>
                </div>
            `;
            lucide.createIcons();
            return; 
        }

        // Alimentação do Estado Global (Usado pelo UI.js e Cart.js)
        state.storeConfigGlobal = data.config;
        state.allProducts = data.produtos;
        checkStoreStatus(state.storeConfigGlobal);
        state.banners = data.banners || [];
        state.categories = Array.from(new Set(data.produtos.map(p => p.category).filter(Boolean))).sort();

        // Aplicar Identidade e Componentes
        applyStoreConfig(data.config);
        renderHeroCarousel(state.banners);
        renderCategoryTabs();
        await renderCatalog();
        
        // Inicializar Utilitários de UI
        populateFilterOptions();
        updateFavoritesUI();
        updateCartUI();
        
        // Verificações finais
        checkDeepLink(); // Abre produto via URL se houver ID
        registerVisit(); // Analytics de Visita
        hideLoader();

        console.log(`🚀 Vitrine [${state.STORE_ID}] carregada com sucesso via Backend.`);

    } catch (error) {
        console.error("Erro crítico no carregamento:", error);
        hideLoader();
    }
}

// --- 3. CONFIGURAÇÕES VISUAIS DINÂMICAS ---

function applyStoreConfig(d) {
    state.lojaZapDestino = (d.whatsappNumber || "").replace(/\D/g, "");
    
    // Injeção de Variáveis CSS (Ajusta seu CSS novo automaticamente)
    const primary = d.primaryColor || '#EA1D2C';
    document.documentElement.style.setProperty('--color-primary', primary);
    document.documentElement.style.setProperty('--color-primary-dark', primary);
    
    const metaTheme = document.getElementById('theme-color-meta');
    if(metaTheme) metaTheme.setAttribute('content', primary);

    // Textos e Logos
    document.title = d.storeName || "Vitrine Online";
    const storeNameEl = document.getElementById('storeNameDisplay');
    if (storeNameEl) storeNameEl.textContent = d.storeName;
    
    document.getElementById('footerStoreName').textContent = d.storeName;
    document.getElementById('footerDescription').textContent = d.footerText || "Qualidade e confiança.";
    
    if (d.logoUrl) { 
        const logoImg = document.getElementById('storeLogoImg');
        logoImg.src = d.logoUrl; 
        document.getElementById('logoContainer').classList.remove('hidden'); 
    }

    // Configuração de Entrega no Carrinho
    state.deliveryAreas = d.deliveryAreas || [];
    const deliverySelect = document.getElementById('cartDeliverySelect');
    if (deliverySelect) {
        deliverySelect.innerHTML = '<option value="0">Retirar na Loja</option>' + 
            state.deliveryAreas.map(a => `<option value="${a.fee}">${a.name} (R$ ${parseFloat(a.fee).toFixed(2).replace('.',',')})</option>`).join('');
    }
}

// --- 4. FUNÇÕES GLOBAIS (PONTE PARA O HTML) ---

// Gestão de Favoritos
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
};

// Gestão de Compra
window.addToCart = (product, qty, options) => {
    addToCart(product, qty, options);
    if (product && product.id) window.reportarMetrica(product.id, 'cart');
};

window.quickAdd = (id) => { 
    const p = state.allProducts.find(x => x.id === id); 
    if(!p) return;
    // Se tiver variações, obriga a abrir o modal, se não, add direto
    if((p.sizes && p.sizes.length > 0) || (p.colors && p.colors.length > 0)) {
        openProductModal(id); 
    } else {
        window.addToCart(p, 1, {}); 
        showToast("Adicionado ao carrinho!");
    }
};

// --- 5. ANALYTICS (MÉTRICAS) ---

window.reportarMetrica = async function(produtoId, tipoAcao) {
    try {
        if (!state.STORE_ID || !produtoId) return;
        
        // Envia para a rota de métricas do seu Node.js
        fetch('/api/produtos/metricas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lojaId: state.STORE_ID, 
                produtoId: produtoId,
                acao: tipoAcao
            })
        });
    } catch (err) {
        console.warn("Métrica não enviada.");
    }
};

async function registerVisit() {
    if (!state.STORE_ID || ['admin', 'index'].includes(state.STORE_ID)) return;
    const sessionKey = `vst_${state.STORE_ID}`;
    if (sessionStorage.getItem(sessionKey)) return;

    try {
        const response = await fetch(`/api/produtos/${state.STORE_ID}/visit`, { method: 'POST' });
        if (response.ok) sessionStorage.setItem(sessionKey, "1");
    } catch (err) { 
        console.warn("Log de visita offline."); 
    }
}

// --- 6. HANDLERS DE UI ---

window.renderCatalog = renderCatalog;
window.handleSearchInput = handleSearchInput;
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

// Carrinho e Checkout
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

// Lógica de DeepLink (Abre produto por ID na URL)
function checkDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const prodId = urlParams.get('p'); // Use ?p=ID para produtos
    if (prodId && state.allProducts.some(x => x.id === prodId)) {
        setTimeout(() => openProductModal(prodId), 500);
    }
}

// Listener de Pagamento (Dinheiro/Cartão/Troco)
document.addEventListener('change', (e) => {
    if(e.target.id === 'checkPayment') {
        const method = e.target.value;
        const changeField = document.getElementById('changeField');
        const installmentsField = document.getElementById('cardInstallmentsField');
        
        if(changeField) method === 'Dinheiro' ? changeField.classList.remove('hidden') : changeField.classList.add('hidden');
        if(installmentsField) method === 'Cartão' ? installmentsField.classList.remove('hidden') : installmentsField.classList.add('hidden');
        
        updateCartTotals();
    }
});
