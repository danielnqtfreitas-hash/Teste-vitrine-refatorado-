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

import { RestauranteTheme } from './theme-restaurante.js';

import { 
    renderCatalog, renderHeroCarousel, renderCategoryTabs, populateFilterOptions, updateFavoritesUI, 
    openProductModal, closeModalDetails, updateFilterBadge, resetAllFilters, handleSearchInput, 
    openFilterDrawer, closeFilterDrawer, openImageZoom, closeImageZoom, setupSwipes, adjustDetailQty, 
    shareProduct, openDeliveryModal, toggleFavoritesView, setDetailImage, mkProductCard , checkStoreStatus
} from './ui.js';

import { addToCart, checkoutWhatsApp, updateCartUI, updateCartTotals, goToStep1, goToStep2, toggleAddressFields, modQty, alertaEstoquePreso } from './cart.js';

// --- 1. INICIALIZAÇÃO E BLINDAGEM DE ROTA ---

// --- 1. INICIALIZAÇÃO E BLINDAGEM DE ROTA (CORRIGIDO) ---
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathSegments = window.location.pathname.split('/');
    
    // PRIORIDADE: 1º Path amigável (/nome-da-loja), 2º Query String (?id=), 3º LocalStorage
    let storeId = (pathSegments[1] && !["index.html", "cliente", "undefined", ""].includes(pathSegments[1]) ? pathSegments[1] : null) || 
                  urlParams.get('id') || 
                  localStorage.getItem('last_store_id');
    
    // Se não encontrar nada, define um padrão
    if (!storeId || storeId === "null" || storeId === "undefined") {
        storeId = "admin"; 
    }

    // Salva para futuras visitas
    localStorage.setItem('last_store_id', storeId);

    if (!urlParams.get('id')) {
        const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${storeId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

   // --- BLOCO DE SINCRONIZAÇÃO DE SESSÃO CORRIGIDO ---
    const activeSession = localStorage.getItem('active_store_session');
    
    if (activeSession && activeSession !== storeId) {
        // Se mudou de loja, limpamos o carrinho que está na MEMÓRIA 
        // para não vazar itens da loja anterior enquanto a nova carrega
        state.cart = []; 
        state.favorites = [];
        
        // Opcional: Se você quiser deletar permanentemente o carrinho da loja anterior 
        // do celular do cliente quando ele muda de loja, descomente a linha abaixo:
        // localStorage.removeItem(`cart_${activeSession}`);
    }
    
    // Atualiza a sessão ativa para a nova loja
    localStorage.setItem('active_store_session', storeId);

    // Agora sim, carregamos os dados específicos da loja atual
    setStoreId(storeId);
    loadCart();      // Isso vai buscar no localStorage a chave cart_IDDALOJA
    loadFavorites(); // Isso vai buscar no localStorage a chave favs_IDDALOJA

    // Atualiza os badges da barra inferior imediatamente após carregar
    if (window.updateNavigationBadges) {
        window.updateNavigationBadges();
    }

    // Localiza o botão de início (ajusta o ID se necessário conforme o teu HTML)
const btnInicio = document.getElementById('navInicio') || document.querySelector('a[href="#inicio"]');

if (btnInicio) {
    btnInicio.addEventListener('click', (e) => {
        e.preventDefault();
        
        // 1. Fecha qualquer modal ou drawer que esteja aberto
        closeFilterDrawer();
        closeModalDetails();

        // 2. Reseta todos os filtros e estados de favoritos
        resetAllFilters(); 

        // 3. Garante que as secções de Carrinho ou Perfil fiquem escondidas
        document.getElementById('catalogSection')?.classList.remove('hidden');
        document.getElementById('cartSection')?.classList.add('hidden');
        document.getElementById('profileSection')?.classList.add('hidden');
        
        // 4. Feedback visual: volta ao topo suavemente
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        console.log("🏠 Vitrine reiniciada com sucesso!");
    });
}

window.addEventListener('popstate', (event) => {
    // 1. Verifica o Provador
    const provador = document.getElementById('provadorFullscreen');
    if (provador && provador.style.display !== 'none' && !provador.classList.contains('hidden')) {
        if (window.closeProvador) window.closeProvador();
        return;
    }

    // 2. Verifica o Discovery (Feed)
    const feed = document.getElementById('discoveryFeed');
    if (feed && !feed.classList.contains('hidden')) {
        if (window.closeDiscoveryFeed) window.closeDiscoveryFeed();
        return;
    }

    // 3. Verifica Modal de Detalhes
    const modalD = document.getElementById('modalDetails');
    if (modalD && !modalD.classList.contains('hidden')) {
        modalD.classList.add('hidden');
        return;
    }

    // 4. Verifica Carrinho
    const modalC = document.getElementById('modalCart');
    if (modalC && !modalC.classList.contains('hidden')) {
        if (window.closeCartModal) window.closeCartModal();
        return;
    }

    // Se chegar aqui e não tiver nada aberto, o navegador volta a página normalmente
});
    
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

        // --- 1. BLOCO DE SINCRONIZAÇÃO DE VERSÃO (CORRIGIDO) ---
        const configRef = doc(db, "stores", state.STORE_ID, "config", "store");
        
        // Buscamos o dado real do servidor para garantir que o lastUpdate seja o mais recente
        const serverSnap = await getDocFromServer(configRef);
        const serverData = serverSnap.exists() ? serverSnap.data() : {};
        
        // Converte o int64 do Firestore para Number do JS para comparação segura
        const serverLastUpdate = Number(serverData.lastUpdate) || 0;
        const localLastUpdate = Number(localStorage.getItem(`lastUpdate_${state.STORE_ID}`)) || 0;
        const cachedProducts = localStorage.getItem(`cache_produtos_${state.STORE_ID}`);

        console.log(`[Cache Debug] Servidor: ${serverLastUpdate} | Local: ${localLastUpdate}`);

        let data;

        // LÓGICA: Só usa cache se o timestamp local for IGUAL ao do servidor e maior que zero
        if (cachedProducts && localLastUpdate > 0 && localLastUpdate === serverLastUpdate) {
            console.log("🚀 Cache validado. Carregando dados locais...");
            data = JSON.parse(cachedProducts);
        } else {
            console.log("📡 Versão nova ou divergente. Baixando via API...");
            
            // Adicionamos o timestamp na URL para evitar que o navegador sirva um cache antigo da própria API[cite: 1]
            const response = await fetch(`/api/produtos/${state.STORE_ID}?v=${serverLastUpdate}&t=${Date.now()}`);
            if (!response.ok) throw new Error("Loja não encontrada na API");
            
            data = await response.json(); 

            // Atualiza o localStorage com os novos dados e o novo timestamp para a próxima conferência[cite: 1]
            localStorage.setItem(`cache_produtos_${state.STORE_ID}`, JSON.stringify(data));
            localStorage.setItem(`lastUpdate_${state.STORE_ID}`, serverLastUpdate.toString());
        }

        updatePremiumLoader(40); 
        state.storeConfigGlobal = data.config;

        // --- 2. BLOCO DE SINCRONIZAÇÃO DE VISUALIZAÇÕES (ANALYTICS) ---
        try {
            const analyticsRef = doc(db, "stores", state.STORE_ID, "analytics", "product_views");
            const analyticsSnap = await getDocFromServer(analyticsRef).catch(() => null); 
            
            const viewsData = (analyticsSnap && analyticsSnap.exists()) ? analyticsSnap.data() : {};
            const statsMap = viewsData.stats || {};

            // Mescla os produtos com as visualizações vindas do servidor
            state.allProducts = data.produtos.map(p => {
                const productStats = statsMap[p.id]; 
                const vCount = (productStats && typeof productStats.views === 'number') ? productStats.views : 0;
                return { ...p, views: vCount };
            });

            // Lógica de interface (Provador vs Bairros)
            const temProdutosProvador = state.allProducts.some(p => 
                p.posicaoProvador === 'superior' || p.posicaoProvador === 'inferior'
            );

            const btnProvador = document.getElementById('btnOpenProvador');
            const btnBairros = document.getElementById('btnOpenBairros');

            if (btnProvador && btnBairros) {
                if (temProdutosProvador) {
                    btnProvador.classList.remove('hidden');
                    btnBairros.classList.add('hidden');
                } else {
                    btnProvador.classList.add('hidden');
                    btnBairros.classList.remove('hidden');
                }
            }

            if (typeof setupBotoesAlternados === 'function') {
                setupBotoesAlternados();
            } 
            
            if (state.storeConfigGlobal && state.storeConfigGlobal.tipoNegocio === 'restaurante') {
                RestauranteTheme.setup(); 
            }
           
            if (typeof updateCartUI === 'function') {
                updateCartUI(); 
            }

        } catch (e) {
            console.warn("⚠️ Erro ao processar analytics:", e);
            state.allProducts = data.produtos.map(p => ({ ...p, views: 0 })); 
            if (typeof updateCartUI === 'function') updateCartUI();
        }
        
        updatePremiumLoader(60);

        // --- 3. CONFIGURAÇÃO DO RODAPÉ E PROVADOR ---
        try {
            state.tops = state.allProducts.filter(p => p.disponivelProvador && p.posicaoProvador === 'superior');
            state.bottoms = state.allProducts.filter(p => p.disponivelProvador && p.posicaoProvador === 'inferior');

            const isFashionStore = state.tops.length > 0 && state.bottoms.length > 0;
            setupFooterButton(isFashionStore);
        } catch (e) {
            console.error("Erro no setup do provador:", e);
        }

        // --- 4. PROCESSAMENTO FINAL E RENDERIZAÇÃO ---
        checkStoreStatus(state.storeConfigGlobal);
        state.banners = data.banners || [];
        state.categories = Array.from(new Set(data.produtos.map(p => p.category).filter(Boolean))).sort();

        applyStoreConfig(data.config);
        renderHeroCarousel(state.banners);
        renderCategoryTabs();
        
        await renderCatalog(); // O catálogo agora limpa o container antes de desenhar
        
        updatePremiumLoader(100);
        if (window.updateNavigationBadges) {
            window.updateNavigationBadges();
        }
        registerVisit(); 
        checkDeepLink();

    } catch (error) {
        console.error("❌ Erro fatal no initFlow:", error);
        localStorage.removeItem(`lastUpdate_${state.STORE_ID}`);
        const loader = document.getElementById('initialLoader');
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
    // CORREÇÃO: Usando 'item.q' em vez de 'item.qty' para bater com seu cart.js
    const cartCount = state.cart.reduce((sum, item) => sum + (item.q || 0), 0);
    const favCount = state.favorites ? state.favorites.length : 0;

    const cBadge = document.getElementById('cartBadgeBottom');
    const fBadge = document.getElementById('favBadgeBottom');

    const applyStyle = (el, count) => {
        if (!el) return;

        const primaryColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-primary').trim() || '#EA1D2C';

        el.innerText = count;
        
        Object.assign(el.style, {
            position: 'absolute',
            top: '-5px',
            right: '-8px',
            backgroundColor: primaryColor,
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            minWidth: '18px',
            height: '18px',
            borderRadius: '50%',
            border: '2px solid white',
            display: count > 0 ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '100'
        });
    };

    applyStyle(cBadge, cartCount);
    applyStyle(fBadge, favCount);
}


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

// EXPOSIÇÃO DE FUNÇÕES PARA O DISCOVERY/REELS (Escopo Global)
window.addToCart = addToCart;
window.showToast = showToast;
window.toggleFavorite = toggleFavorite;
window.openProductModal = openProductModal;

