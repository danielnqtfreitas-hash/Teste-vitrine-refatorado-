import { 
    auth, signInAnonymously, onAuthStateChanged, db, doc, getDocFromServer, getDocs, getDocsFromServer, collection, 
    writeBatch, increment, serverTimestamp, setDoc, hideLoader, showToast, sanitizeTerm, isBotLikely 
} from './config.js';

import { state, setStoreId, loadFavorites, loadCart } from './state.js';

import { 
    renderCatalog, renderHeroCarousel, renderCategoryTabs, populateFilterOptions, updateFavoritesUI, 
    openProductModal, closeModalDetails, updateFilterBadge, resetAllFilters, handleSearchInput, 
    openFilterDrawer, closeFilterDrawer, openImageZoom, closeImageZoom, setupSwipes, adjustDetailQty, 
    shareProduct, openDeliveryModal, toggleFavoritesView, setDetailImage, mkProductCard 
} from './ui.js';

import { addToCart, checkoutWhatsApp, updateCartUI, updateCartTotals, goToStep1, goToStep2, toggleAddressFields, modQty, alertaEstoquePreso } from './cart.js';

// --- DATA SERVICE (Busca de Dados) ---

const DataService = {
    async getStoreConfig() {
        const configRef = doc(db, `stores/${state.STORE_ID}/config/store`);
        const snap = await getDocFromServer(configRef); 
        return snap.data();
    },

    async getProducts(forceServer = false) {
        const colRef = collection(db, `stores/${state.STORE_ID}/products`);
        try {
            const snap = forceServer ? await getDocsFromServer(colRef) : await getDocs(colRef);
            return snap.docs.map(d => ({id: d.id, ...d.data()})).filter(p => p.status === 'active');
        } catch (e) {
            console.error("Erro produtos:", e);
            return [];
        }
    },

    async getBanners(forceServer = false) {
        const colRef = collection(db, `stores/${state.STORE_ID}/hero_cards`); 
        try {
            const snap = forceServer ? await getDocsFromServer(colRef) : await getDocs(colRef);
            return snap.docs.map(d => ({id: d.id, ...d.data()}));
        } catch (e) {
            return [];
        }
    }
};

// --- INICIALIZAÇÃO BLINDADA ---

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathSegments = window.location.pathname.split('/');
    
    // 1. Tenta identificar o ID em todos os lugares possíveis
    let storeId = urlParams.get('id') || 
                  (pathSegments[1] && pathSegments[1] !== "index.html" ? pathSegments[1] : null) || 
                  localStorage.getItem('last_store_id');
    
    // 2. Filtro de segurança rigoroso
    if (!storeId || storeId === "index.html" || storeId === "undefined" || storeId === "null") {
        storeId = "admin"; // Ou o ID da sua loja principal
    }

    // 3. PERSISTÊNCIA: Salva imediatamente para não esquecer
    localStorage.setItem('last_store_id', storeId);

    // 4. CORREÇÃO DE URL (A Mágica): 
    // Se a URL estiver "limpa", a gente coloca o ?id= de volta silenciosamente
    if (!urlParams.get('id')) {
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?id=' + storeId;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    // 5. Verificação de troca de loja para limpar o carrinho
    const activeSession = localStorage.getItem('active_store_session');
    if (activeSession && activeSession !== storeId) {
        localStorage.removeItem('cart');
        console.log("Loja trocada, limpando carrinho...");
    }
    localStorage.setItem('active_store_session', storeId);

    // Inicialização do fluxo
    setStoreId(storeId);
    loadFavorites();
    loadCart();
    
    await signInAnonymously(auth);
    onAuthStateChanged(auth, (user) => { if(user) initFlow(); });
    setupSwipes();
});

async function initFlow() {
    try {
        // 1. BUSCA O PACOTE COMPLETO DO SEU BACKEND (Node.js)
        const response = await fetch(`/api/produtos/${state.STORE_ID}`);
        if (!response.ok) throw new Error("Loja não encontrada no servidor");
        
        const data = await response.json(); // Aqui vem: data.config, data.produtos, data.banners

        // 2. VERIFICAÇÃO DE STATUS (ASSINATURA)
        if (data.config.subscriptionStatus === 'suspended') { 
            alert("Loja suspensa."); 
            return; 
        }

        // 3. ALIMENTA O ESTADO GLOBAL
        state.storeConfigGlobal = data.config;
        state.allProducts = data.produtos;
        state.categories = Array.from(new Set(data.produtos.map(p => p.category).filter(Boolean))).sort();

        // 4. APLICA CONFIGURAÇÕES VISUAIS
        applyStoreConfig(data.config);
        renderHeroCarousel(data.banners || []);

        // 5. DISPARA A RENDERIZAÇÃO DO CATÁLOGO
        renderCategoryTabs();
        await renderCatalog();
        
        // 6. FINALIZA A INTERFACE E ANALYTICS
        populateFilterOptions();
        updateFavoritesUI();
        updateCartUI();
        
        checkDeepLink();
        registerVisit();
        hideLoader();

        console.log(`🚀 Loja ${state.STORE_ID} carregada via Backend com sucesso.`);

    } catch (error) {
        console.error("Erro crítico na inicialização via backend:", error);
        hideLoader();
    }
}

function applyStoreConfig(d) {
    state.lojaZapDestino = (d.whatsappNumber || "").replace(/\D/g, "");
    
    // WhatsApp Footer
    const footerLink = document.getElementById('footerWaLink');
    if (footerLink && state.lojaZapDestino) footerLink.href = `https://wa.me/${state.lojaZapDestino}`;

    // Cores e Tema
    if(d.primaryColor) { 
        document.documentElement.style.setProperty('--color-primary', d.primaryColor); 
        document.documentElement.style.setProperty('--color-primary-dark', d.primaryColor); 
        const metaTheme = document.getElementById('theme-color-meta');
        if(metaTheme) metaTheme.setAttribute('content', d.primaryColor);
        document.body.style.backgroundImage = 'none';
    }
    
    // Textos e Logo
    const storeNameEl = document.getElementById('storeNameDisplay');
    if (storeNameEl) {
        storeNameEl.textContent = d.storeName;
        storeNameEl.classList.replace('max-w-[140px]', 'max-w-[220px]');
    }
    document.getElementById('footerStoreName').textContent = d.storeName;
    document.getElementById('footerDescription').textContent = d.footerText || "Qualidade e confiança.";
    if (d.logoUrl) { 
        document.getElementById('storeLogoImg').src = d.logoUrl; 
        document.getElementById('logoContainer').classList.remove('hidden'); 
    }
    
    // Taxas
    state.deliveryAreas = d.deliveryAreas || [];
    const deliveryList = document.getElementById('deliveryList');
    if (deliveryList) {
        deliveryList.innerHTML = state.deliveryAreas.map(a => `
            <div class="flex justify-between p-3 bg-slate-50 rounded-lg text-sm">
                <span class="font-medium">${a.name}</span>
                <span class="font-bold">R$ ${parseFloat(a.fee).toFixed(2).replace('.',',')}</span>
            </div>`).join('');
    }
    
    const deliverySelect = document.getElementById('cartDeliverySelect');
    if (deliverySelect) {
        deliverySelect.innerHTML = '<option value="0">Retirar na Loja</option>' + 
            state.deliveryAreas.map(a => `<option value="${a.fee}">${a.name} (R$ ${parseFloat(a.fee).toFixed(2).replace('.',',')})</option>`).join('');
    }
}

// --- FUNÇÕES GLOBAIS (EXPOSTAS AO HTML) ---

window.renderCatalog = renderCatalog;
window.handleSearchInput = handleSearchInput;
window.resetAllFilters = resetAllFilters;

// Correção Filtro de Preço
window.handleMaxPrice = (val) => {
    state.filters.maxPrice = val ? parseFloat(val) : null;
    renderCatalog();
    updateFilterBadge();
};

window.updateFilterBadge = updateFilterBadge;

// --- FAVORITOS COM MÉTRICA ---
window.toggleFavorite = (id) => { 
    const idx = state.favorites.indexOf(id); 
    if(idx > -1) {
        state.favorites.splice(idx, 1); 
    } else {
        state.favorites.push(id);
        // Reporta a métrica apenas quando ADICIONA aos favoritos
        window.reportarMetrica(id, 'fav'); 
    }
    localStorage.setItem(state.FAV_KEY, JSON.stringify(state.favorites));
    renderCatalog(); 
    updateFavoritesUI(); 
};
window.toggleFavoritesView = toggleFavoritesView;

// Modais UI
window.openFilterDrawer = openFilterDrawer;
window.closeFilterDrawer = closeFilterDrawer;
window.closeFilterModal = closeFilterDrawer; // Alias
window.openDeliveryModal = openDeliveryModal;
window.openImageZoom = openImageZoom;
window.closeImageZoom = closeImageZoom;
window.setDetailImage = setDetailImage;

// Detalhes Produto
window.openProductModal = openProductModal;
window.closeModalDetails = closeModalDetails;
window.adjustDetailQty = adjustDetailQty;
window.shareProduct = shareProduct;
window.toggleFavoriteCurrentDetail = () => { if (state.currentDetailId) window.toggleFavorite(state.currentDetailId); };
window.quickAdd = (id) => { 
    const p = state.allProducts.find(x => x.id === id); 
    // Se tiver variação, abre o modal, se não, adiciona direto (e reporta)
    if(p.sizes?.length || p.colors?.length) openProductModal(id); 
    else window.addToCart(p, 1, {}); 
};

// Carrinho
window.addToCart = (product, qty, options) => {
    // 1. Chama a função original que você importou do cart.js
    addToCart(product, qty, options);

    // 2. Dispara a métrica
    if (product && product.id) {
        window.reportarMetrica(product.id, 'cart');
    }
};

// Mantenha as outras linhas do carrinho como estão:
window.modQty = modQty;
window.checkoutWhatsApp = checkoutWhatsApp;
window.goToStep1 = goToStep1;
window.goToStep2 = goToStep2;
window.toggleAddressFields = toggleAddressFields;
window.toggleChangeField = (val) => {
    document.getElementById('checkPayment').value = val;
    const event = new Event('change', { bubbles: true });
    document.getElementById('checkPayment').dispatchEvent(event);
};

window.openCartModal = () => { 
    goToStep1(); 
    document.getElementById('modalCart').classList.remove('hidden'); 
    setTimeout(() => document.getElementById('cartDrawer').classList.remove('translate-x-full'), 10); 
};
window.closeCartModal = () => { 
    document.getElementById('cartDrawer').classList.add('translate-x-full'); 
    setTimeout(() => document.getElementById('modalCart').classList.add('hidden'), 300); 
};
window.closeConfirmFinal = () => { document.getElementById('modalConfirmFinal').classList.add('hidden'); };

// --- ANALYTICS & EVENTOS ---

function checkDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    if (productId && state.allProducts.length > 0) {
        const product = state.allProducts.find(p => p.id === productId);
        if (product) setTimeout(() => window.openProductModal(product.id), 300);
    }
}

async function registerVisit() {
    // 1. Bloqueios básicos
    if (!state.STORE_ID || ['admin', 'index', 'undefined'].includes(state.STORE_ID)) return;
    
    const sessionKey = `vst_${state.STORE_ID}`;
    if (sessionStorage.getItem(sessionKey)) return;

    try {
        // 2. Chama o seu Backend em vez de chamar o Firebase direto
        const response = await fetch(`/api/produtos/${state.STORE_ID}/visit`, { 
            method: 'POST' 
        });

        if (response.ok) {
            sessionStorage.setItem(sessionKey, "1");
            console.log("📊 Visita registrada com sucesso.");
        }
    } catch (err) { 
        console.warn("Analytics inacessível no momento."); 
    }
}

// Listener para detectar mudança no pagamento (Troco/Parcelas)
document.addEventListener('change', (e) => {
    if(e.target.id === 'checkPayment') {
        const method = e.target.value;
        const changeField = document.getElementById('changeField');
        const installmentsField = document.getElementById('cardInstallmentsField');
        const installmentsSelect = document.getElementById('checkInstallments');
        
        // Exibe/Oculta Troco
        if(changeField) {
            if(method === 'Dinheiro') changeField.classList.remove('hidden');
            else { changeField.classList.add('hidden'); document.getElementById('checkChange').value = ''; }
        }

        // Exibe/Oculta Parcelas
        if(installmentsField && installmentsSelect) {
            if(method === 'Cartão') {
                installmentsField.classList.remove('hidden');
                const maxAllowed = state.cart.reduce((max, item) => {
                    const pOrig = state.allProducts.find(x => x.id === item.id);
                    return Math.max(max, (pOrig?.maxInstallments || 1));
                }, 1);
                let options = '';
                for(let i = 1; i <= maxAllowed; i++) options += `<option value="${i}">${i}x no Cartão</option>`;
                installmentsSelect.innerHTML = options;
            } else {
                installmentsField.classList.add('hidden');
            }
        }
        updateCartTotals();
    }
});

// FUNÇÃO GLOBAL DE MÉTRICAS - COLOQUE NA ÚLTIMA LINHA DO APP.JS
window.reportarMetrica = async function(produtoId, tipoAcao) {
    try {
        if (!state.STORE_ID || !produtoId) return;

        console.log(`📊 Enviando métrica: ${tipoAcao} no produto ${produtoId}`);
        
        await fetch('/api/produtos/metricas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lojaId: state.STORE_ID, 
                produtoId: produtoId,
                acao: tipoAcao
            })
        });
    } catch (err) {
        console.warn("Métrica não pôde ser enviada:", err);
    }
};
