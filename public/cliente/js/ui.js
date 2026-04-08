import { state } from './state.js';
import { formatarTempo, showToast, doc, db, getDocFromServer } from './config.js';

// --- ELEMENTOS DO DOM (Cache para performance) ---
const els = {
    catalogContainer: () => document.getElementById('catalogContainer'),
    emptyState: () => document.getElementById('emptyState'),
    magicSections: () => document.getElementById('magicSections'),
    modalDetails: () => document.getElementById('modalDetails'),
    detailImg: () => document.getElementById('detailImg'),
    detailName: () => document.getElementById('detailName'),
    detailPrice: () => document.getElementById('detailPrice'),
    detailDesc: () => document.getElementById('detailDesc'),
    detailSku: () => document.getElementById('detailSku'),
    detailAddBtn: () => document.getElementById('detailAddBtn'),
    categoryContainer: () => document.getElementById('categoryContainer'),
    filterBadgeDesktop: () => document.getElementById('filterBadgeDesktop'),
    filterBadgeMobile: () => document.getElementById('filterBadgeMobile'),
    modalImageZoom: () => document.getElementById('modalImageZoom'),
    zoomedImg: () => document.getElementById('zoomedImg'),
    modalTimer: () => document.getElementById('modalTimer'),
    modalTimerText: () => document.getElementById('modalTimerText'),
    deliveryModal: () => document.getElementById('modalDelivery')
};

// --- RENDERIZAÇÃO DE CARDS (PRODUTO) ---
export function mkProductCard(p) {
    const agora = Date.now();
    const isPromoValid = p.promoValue && p.promoValue < p.value && (p.promoUntil ? p.promoUntil > agora : true);
    const hasPromo = !!isPromoValid;
    
    // Cálculos de Preço (Pix vs Cartão)
    const precoPixBase = p.priceCash || p.value;
    const precoCardBase = p.priceCard || p.value;
    const diferencaCartao = precoCardBase - precoPixBase;
    
    const bestPrice = hasPromo ? p.promoValue : precoPixBase;
    const cardPriceAdaptado = hasPromo ? (p.promoValue + diferencaCartao) : precoCardBase;

    const img = p.images?.[0] || 'https://placehold.co/600?text=Sem+Imagem';
    const isFav = state.favorites.includes(p.id);
    const outOfStock = (parseInt(p.stock) || 0) <= 0;
    
    // Badges de desconto e estoque
    const disc = hasPromo && !outOfStock ? `<span class="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg z-10">-${Math.round(((p.value - p.promoValue) / p.value) * 100)}%</span>` : '';
    const stockBadge = outOfStock ? `<span class="absolute inset-0 bg-white/60 flex items-center justify-center text-red-600 font-black text-xs uppercase z-20">Esgotado</span>` : '';

    return `
    <div onclick="${outOfStock ? '' : `window.openProductModal('${p.id}')`}" class="product-card cursor-pointer group flex flex-col h-full relative ${outOfStock ? 'opacity-70 grayscale' : ''}">
        <div class="aspect-square bg-white relative overflow-hidden border-b border-slate-50">
            ${stockBadge}
            <img src="${img}" class="w-full h-full object-cover transition-transform duration-500 ${outOfStock ? '' : 'group-hover:scale-105'}" loading="lazy">
            ${disc}
            <button onclick="event.stopPropagation(); window.toggleFavorite('${p.id}')" class="absolute top-2 left-2 p-1.5 rounded-full bg-white/80 backdrop-blur-sm z-20">
                <i data-lucide="heart" class="w-4 h-4 ${isFav ? 'heart-active' : 'text-slate-400'}"></i>
            </button>
        </div>
        <div class="p-3 md:p-4 flex flex-col flex-grow bg-white">
            <div class="product-timer hidden mb-2 py-1 px-2 rounded-lg flex items-center gap-1.5 timer-accent animate-pulse" data-pid="${p.id}">
                <i data-lucide="clock" class="w-3 h-3"></i>
                <span class="text-[9px] font-black uppercase tracking-tighter countdown-text">Carregando...</span>
            </div>
            <h4 class="text-sm font-semibold text-slate-700 leading-snug line-clamp-2 mb-2">${p.name}</h4>
            <div class="mt-auto pt-1">
                <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        ${hasPromo ? 'Oferta Especial' : 'À vista no Pix'}
                    </span>
                    <div class="flex items-center justify-between">
                        <span class="text-lg md:text-xl font-display font-black text-slate-900 tracking-tight">
                            R$ ${bestPrice.toFixed(2).replace('.',',')}
                        </span>
                        ${outOfStock ? '' : `
                        <button onclick="event.stopPropagation(); window.quickAdd('${p.id}')" class="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center transition-colors active-scale">
                            <i data-lucide="plus" class="w-5 h-5"></i>
                        </button>`}
                    </div>
                    <div class="flex flex-col mt-1 pt-1 border-t border-slate-50">
                        <span class="text-[9px] font-bold text-blue-600">Ou R$ ${cardPriceAdaptado.toFixed(2).replace('.',',')} no cartão</span>
                        ${(p.maxInstallments > 1) ? `
                            <span class="text-[9px] text-slate-400 font-medium">
                                Em até ${p.maxInstallments}x de R$ ${(cardPriceAdaptado / p.maxInstallments).toFixed(2).replace('.', ',')}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// --- RENDERIZAÇÃO DO CATÁLOGO PRINCIPAL ---
export async function renderCatalog() {
    await renderMagicCategories(state.allProducts, state.storeConfigGlobal);

    const container = els.catalogContainer();
    const empty = els.emptyState();
    if (!container) return; 
    
    empty.classList.add('hidden');
    container.innerHTML = '';

    // Lógica de Filtros
    let filtered = state.allProducts.filter(p => {
        if(state.isFavoritesView) return state.favorites.includes(p.id);
        
        if(state.filters.search) {
            const s = state.filters.search.toLowerCase();
            if (!p.name.toLowerCase().includes(s) && !(p.sku && p.sku.toLowerCase().includes(s))) return false;
        }

        if(state.filters.category === 'offers') { 
            if(!(p.promoValue && p.promoValue < p.value)) return false; 
        } else if(state.filters.category && p.category !== state.filters.category) return false;

        const price = (p.promoValue && p.promoValue < p.value) ? p.promoValue : p.value;
        if(state.filters.maxPrice && price > state.filters.maxPrice) return false;

        if(state.filters.sizes.length > 0 || state.filters.colors.length > 0) {
            const sL = state.filters.sizes.map(s => s.toLowerCase());
            const cL = state.filters.colors.map(c => c.toLowerCase());

            if (p.variations?.length) {
                return p.variations.some(v => v.active && 
                    (state.filters.sizes.length === 0 || sL.includes(v.size.toLowerCase())) &&
                    (state.filters.colors.length === 0 || cL.includes(v.color.toLowerCase()))
                );
            }
            const sMatch = state.filters.sizes.length === 0 || p.sizes?.some(s => sL.includes(s.toLowerCase()));
            const cMatch = state.filters.colors.length === 0 || p.colors?.some(c => cL.includes(c.toLowerCase()));
            return sMatch && cMatch;
        }
        return true;
    });

    if (filtered.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    // Agrupamento por Categoria ou Resultado Único
    const groups = {};
    const hasActiveFilters = state.isFavoritesView || state.filters.search || state.filters.category || state.filters.maxPrice || state.filters.sizes.length > 0 || state.filters.colors.length > 0;

    if(hasActiveFilters) {
        groups['Resultados Encontrados'] = filtered;
    } else {
        filtered.forEach(p => { 
            const k = p.category || 'Geral'; 
            if(!groups[k]) groups[k]=[]; 
            groups[k].push(p); 
        });
    }

    // Renderização final das seções
    Object.keys(groups).sort().forEach(key => {
        const section = document.createElement('section');
        section.className = "animate-fade-in mb-8";
        section.innerHTML = `<h3 class="font-bold text-slate-800 mb-4 px-1 text-lg flex items-center gap-2"><div class="w-1 h-5 bg-primary rounded-full"></div> ${key}</h3>`;
        const grid = document.createElement('div');
        grid.className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-5";
        groups[key].forEach(p => grid.innerHTML += mkProductCard(p));
        section.appendChild(grid); 
        container.appendChild(section);
    });
    
    if(window.lucide) window.lucide.createIcons();
    initGlobalCountdowns(); 
}
// --- MAGIC CATEGORIES (Novidades / Mais Vistos) ---
async function renderMagicCategories(products, config) {
    const magicContainer = els.magicSections();
    if (!magicContainer) return;
    
    // Esconde se houver filtros ativos para não poluir a busca
    const hasActiveFilters = state.filters.search.length > 0 || state.filters.category !== null || 
                             state.isFavoritesView || state.filters.maxPrice !== null || 
                             state.filters.sizes.length > 0 || state.filters.colors.length > 0;

    if (hasActiveFilters) {
        magicContainer.innerHTML = '';
        magicContainer.classList.add('hidden');
        return;
    }

    magicContainer.classList.remove('hidden');
    magicContainer.innerHTML = '';

    // Seção de Novidades
    if (config.magicCategories?.showNew) {
        const news = [...products]
            .filter(p => p.status === 'active')
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 15);

        if (news.length > 0) {
            magicContainer.innerHTML += generateMagicSectionHTML("Novidades ✨", news, "bg-purple-600");
        }
    }

    // Seção de Mais Vistos (via Analytics do Firebase)
    if (config.magicCategories?.showTop) {
        try {
            const snap = await getDocFromServer(doc(db, `stores/${state.STORE_ID}/analytics`, "product_views"));
            if (snap && snap.exists()) {
                const stats = snap.data().stats || {};
                const top = [...products]
                    .filter(p => stats[p.id] && stats[p.id].views > 0)
                    .sort((a, b) => (stats[b.id]?.views || 0) - (stats[a.id]?.views || 0))
                    .slice(0, 10);
                if (top.length > 0) {
                    magicContainer.innerHTML += generateMagicSectionHTML("Mais Vistos 🔥", top, "bg-orange-500");
                }
            }
        } catch (e) { console.warn("Analytics indisponível."); }
    }
}

function generateMagicSectionHTML(title, products, colorClass) {
    return `
        <section class="animate-fade-in mb-8 px-4">
            <h3 class="font-bold text-slate-800 mb-4 text-lg flex items-center gap-2">
                <div class="w-1.5 h-6 ${colorClass} rounded-full"></div> ${title}
            </h3>
            <div class="flex overflow-x-auto gap-4 pb-4 hide-scroll snap-x snap-mandatory -mx-4 px-4">
                ${products.map(p => `
                    <div class="min-w-[155px] md:min-w-[205px] snap-start">
                        ${mkProductCard(p)}
                    </div>
                `).join('')}
            </div>
        </section>`;
}

// --- HERO CAROUSEL (BANNERS) ---
export function renderHeroCarousel(banners) {
    const container = document.getElementById('heroGridContainer');
    const dotsContainer = document.getElementById('carouselDots');
    if (!container || !dotsContainer || !banners?.length) return;
    
    container.innerHTML = '';
    dotsContainer.innerHTML = '';

    banners.forEach((b, index) => {
        const div = document.createElement('div');
        div.className = `hero-card w-full flex-shrink-0 h-full rounded-3xl p-6 md:p-10 flex items-center relative overflow-hidden snap-center cursor-pointer text-white`;
        div.style.background = `linear-gradient(135deg, ${b.color1 || '#333'}, ${b.color2 || '#000'})`;
        div.onclick = () => {
            if (b.target === 'offers') { state.filters.category = 'offers'; } 
            else { state.filters.category = b.target || b.category; }
            state.isFavoritesView = false;
            renderCategoryTabs();
            renderCatalog();
            els.categoryContainer()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        div.innerHTML = `
            <div class="relative z-10 flex-1 flex flex-col justify-center items-start gap-1">
                <span class="px-2 py-0.5 rounded-full bg-black/20 text-[7px] font-black uppercase mb-1">${b.tag || 'Destaque'}</span>
                <h3 class="font-display font-bold text-2xl md:text-4xl uppercase tracking-tighter">${b.title}</h3>
                <p class="opacity-90 text-xs md:text-sm line-clamp-2">${b.subtitle || ''}</p>
                <div class="mt-4 px-6 py-2 bg-white/10 border border-white/30 rounded-full text-[9px] font-black uppercase">Ver Agora</div>
            </div>
            ${b.imageUrl ? `<div class="animate-floating w-32 h-32 md:w-52 md:h-52 shrink-0 ml-4"><img src="${b.imageUrl}" class="w-full h-full object-cover rounded-2xl shadow-2xl"></div>` : ''}
        `;
        container.appendChild(div);

        const dot = document.createElement('div');
        dot.className = `h-1.5 transition-all rounded-full ${index === 0 ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`;
        dotsContainer.appendChild(dot);
    });
}

// --- CATEGORIAS E FAVORITOS ---
export function renderCategoryTabs() {
    const c = els.categoryContainer(); 
    if(!c) return;
    c.innerHTML = '';
    
    const mkTab = (id, label, icon = '') => {
        const active = state.filters.category === id && !state.isFavoritesView;
        const btn = document.createElement('button');
        btn.className = `px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2 ${active ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200'}`;
        btn.innerHTML = `${icon} ${label}`;
        btn.onclick = () => { state.isFavoritesView = false; state.filters.category = id; renderCategoryTabs(); renderCatalog(); };
        return btn;
    };

    c.appendChild(mkTab('offers', 'Ofertas', '<i data-lucide="flame" class="w-3.5 h-3.5"></i>'));
    c.appendChild(mkTab(null, 'Tudo'));
    state.categories.forEach(cat => c.appendChild(mkTab(cat, cat)));
    if(window.lucide) window.lucide.createIcons();
}

export function updateFavoritesUI() {
    const count = state.favorites.length;
    const badge = document.getElementById('favBadgeDesktop');
    const heart = document.getElementById('headerHeartIcon');
    if (!badge || !heart) return;
    badge.textContent = count;
    badge.classList.toggle('scale-0', count === 0);
    heart.style.fill = count > 0 ? 'var(--color-primary)' : 'none';
    heart.style.color = count > 0 ? 'var(--color-primary)' : '#334155';
}
// --- MODAL DE DETALHES (LOGICA PRINCIPAL) ---
export async function openProductModal(id) {
    const p = state.allProducts.find(x => x.id === id);
    if (!p) return;

    state.currentProductId = id;
    state.currentDetailImages = p.images || ['https://placehold.co/600?text=Sem+Imagem'];
    state.currentDetailImageIndex = 0;
    state.selectedVariation = null;

    renderProductDetails(p);
    
    els.modalDetails().classList.remove('hidden');
    els.modalDetails().classList.add('flex');
    document.body.style.overflow = 'hidden';

    // Analytics: Registrar visualização
    try {
        const statsRef = doc(db, `stores/${state.STORE_ID}/analytics`, "product_views");
        const snap = await getDocFromServer(statsRef);
        let stats = snap.exists() ? snap.data().stats || {} : {};
        stats[id] = { name: p.name, views: (stats[id]?.views || 0) + 1 };
        // window.updateDoc(statsRef, { stats }); // Chamar via config se necessário
    } catch(e) {}
}

function renderProductDetails(p) {
    els.detailImg().src = state.currentDetailImages[0];
    els.detailName().innerText = p.name;
    els.detailDesc().innerText = p.description || 'Sem descrição disponível.';
    els.detailSku().innerText = p.sku ? `SKU: ${p.sku}` : '';
    
    // Render de Variações (Tamanhos/Cores)
    const varCont = document.getElementById('variationContainer');
    if(varCont) {
        varCont.innerHTML = '';
        if(p.variations?.length) {
            const activeVars = p.variations.filter(v => v.active);
            activeVars.forEach(v => {
                const btn = document.createElement('button');
                btn.className = "px-3 py-2 border rounded-xl text-[10px] font-bold transition-all";
                btn.innerText = `${v.size}${v.color ? ' - ' + v.color : ''}`;
                btn.onclick = () => {
                    document.querySelectorAll('#variationContainer button').forEach(b => b.classList.remove('border-primary', 'bg-primary/5', 'text-primary'));
                    btn.classList.add('border-primary', 'bg-primary/5', 'text-primary');
                    state.selectedVariation = v;
                    updateModalPrice(p, v);
                };
                varCont.appendChild(btn);
            });
        }
    }

    updateModalPrice(p);
    updateDots();
    setupSwipes();
}

function updateModalPrice(p, variation = null) {
    const agora = Date.now();
    const hasPromo = p.promoValue && p.promoValue < p.value && (p.promoUntil ? p.promoUntil > agora : true);
    
    const basePrice = variation ? variation.price : (hasPromo ? p.promoValue : (p.priceCash || p.value));
    const cardPrice = variation ? (variation.priceCard || variation.price) : (p.priceCard || p.value);
    
    els.detailPrice().innerHTML = `
        <div class="flex flex-col">
            <span class="text-2xl font-black text-slate-900">R$ ${basePrice.toFixed(2).replace('.', ',')}</span>
            <span class="text-[11px] font-bold text-blue-600">Ou R$ ${cardPrice.toFixed(2).replace('.', ',')} no cartão</span>
        </div>
    `;
}

// --- ZOOM E NAVEGAÇÃO DE IMAGENS ---
export function openImageZoom() {
    const img = state.currentDetailImages[state.currentDetailImageIndex];
    els.zoomedImg().src = img;
    els.modalImageZoom().classList.remove('hidden');
    els.modalImageZoom().classList.add('flex');
}

export function closeImageZoom() {
    els.modalImageZoom().classList.add('hidden');
}

function updateDots() {
    const dots = document.getElementById('modalImageDots');
    if(!dots) return;
    dots.innerHTML = state.currentDetailImages.map((_, i) => 
        `<div class="h-1.5 rounded-full transition-all ${i === state.currentDetailImageIndex ? 'w-6 bg-primary' : 'w-1.5 bg-slate-300'}"></div>`
    ).join('');
}

// --- CRONÔMETROS E GESTOS ---
export function initGlobalCountdowns() {
    setInterval(() => {
        const agora = Date.now();
        // Timers nos cards
        document.querySelectorAll('.product-timer').forEach(el => {
            const p = state.allProducts.find(x => x.id === el.dataset.pid);
            if (p && p.promoUntil && p.promoUntil > agora) {
                el.classList.remove('hidden');
                el.querySelector('.countdown-text').innerText = formatarTempo(p.promoUntil - agora);
            } else {
                el.classList.add('hidden');
            }
        });

        // Timer no modal
        if (!els.modalDetails().classList.contains('hidden')) {
            const p = state.allProducts.find(x => x.id === state.currentProductId);
            if (p && p.promoUntil && p.promoUntil > agora) {
                els.modalTimer().classList.remove('hidden');
                els.modalTimerText().innerText = formatarTempo(p.promoUntil - agora);
            } else {
                els.modalTimer().classList.add('hidden');
            }
        }
    }, 1000);
}

export function setupSwipes() {
    const el = document.getElementById('mainImageContainer');
    if(!el) return;
    let startX = 0, startTime = 0;

    el.ontouchstart = (e) => { startX = e.touches[0].clientX; startTime = Date.now(); };
    el.ontouchend = (e) => {
        const diffX = startX - e.changedTouches[0].clientX;
        if (Math.abs(diffX) < 10 && (Date.now() - startTime < 250)) { openImageZoom(); return; }
        if (Math.abs(diffX) > 50) {
            state.currentDetailImageIndex = diffX > 0 
                ? (state.currentDetailImageIndex + 1) % state.currentDetailImages.length
                : (state.currentDetailImageIndex - 1 + state.currentDetailImages.length) % state.currentDetailImages.length;
            els.detailImg().src = state.currentDetailImages[state.currentDetailImageIndex];
            updateDots();
        }
    };
}
// --- LÓGICA DE FUNCIONAMENTO (ABERTO/FECHADO) ---

export function checkStoreStatus(config) {
    const statusBanner = document.getElementById('storeStatusBanner');
    const checkoutBtns = document.querySelectorAll('.btn-checkout'); // Botões de finalizar
    
    if (!statusBanner || !config) return;

    const agora = new Date();
    const diaSemana = agora.getDay(); // 0 (Dom) a 6 (Sab)
    const horaAtual = agora.getHours() * 100 + agora.getMinutes(); // Ex: 14:30 -> 1430

    // 1. Verificação de Fechamento Manual (Forçado)
    if (config.manualClosed) {
        updateStoreUI(false, "Loja fechada temporariamente", statusBanner, checkoutBtns);
        return false;
    }

    // 2. Verificação por Horário (config.openingHours deve ser um objeto/array)
    // Exemplo de estrutura: { 1: { open: 0800, close: 1800 }, ... }
    const hoje = config.openingHours?.[diaSemana];

    if (!hoje || !hoje.active) {
        updateStoreUI(false, "Fechado hoje", statusBanner, checkoutBtns);
        return false;
    }

    if (horaAtual >= hoje.open && horaAtual < hoje.close) {
        updateStoreUI(true, "Estamos abertos!", statusBanner, checkoutBtns);
        return true;
    } else {
        updateStoreUI(false, `Abriremos às ${formatarHora(hoje.open)}`, statusBanner, checkoutBtns);
        return false;
    }
}

function updateStoreUI(isOpen, message, banner, buttons) {
    banner.innerText = message;
    
    if (isOpen) {
        banner.className = "bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse";
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'grayscale');
        });
    } else {
        banner.className = "bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-bold";
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'grayscale');
        });
    }
}

function formatarHora(hhmm) {
    const h = Math.floor(hhmm / 100);
    const m = hhmm % 100;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
