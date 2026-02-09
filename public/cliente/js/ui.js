import { state } from './state.js';
import { formatarTempo, showToast, doc, db, getDocFromServer } from './config.js';

// --- ELEMENTOS DO DOM (Cache simples) ---
// Centraliza as referências para evitar document.getElementById repetido
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
    
    // Cálculos de Preço
    const precoPixBase = p.priceCash || p.value;
    const precoCardBase = p.priceCard || p.value;
    const diferencaCartao = precoCardBase - precoPixBase;
    
    // Lógica de exibição
    const bestPrice = hasPromo ? p.promoValue : precoPixBase;
    const cardPriceAdaptado = hasPromo ? (p.promoValue + diferencaCartao) : precoCardBase;

    const img = p.images?.[0] || 'https://placehold.co/600?text=Sem+Imagem';
    const isFav = state.favorites.includes(p.id);
    const outOfStock = (parseInt(p.stock) || 0) <= 0;
    
    // Badges
    const disc = hasPromo && !outOfStock ? `<span class="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg z-10">-${Math.round(((p.value - p.promoValue) / p.value) * 100)}%</span>` : '';
    const stockBadge = outOfStock ? `<span class="absolute inset-0 bg-white/60 flex items-center justify-center text-red-600 font-black text-xs uppercase z-20">Esgotado</span>` : '';

    // Nota: window.openProductModal, toggleFavorite e quickAdd são globais (definidas no app.js)
    return `<div onclick="${outOfStock ? '' : `window.openProductModal('${p.id}')`}" class="product-card cursor-pointer group flex flex-col h-full relative ${outOfStock ? 'opacity-70 grayscale' : ''}">
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
                        <span class="text-[9px] font-bold text-blue-600">
                            Ou R$ ${cardPriceAdaptado.toFixed(2).replace('.',',')} no cartão
                        </span>
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
    // 1. Renderiza seções especiais (Novidades/Vistos)
    await renderMagicCategories(state.allProducts, state.storeConfigGlobal);

    const container = els.catalogContainer();
    const empty = els.emptyState();
    
    if (!container) return; 
    
    empty.classList.add('hidden');
    container.innerHTML = '';

    // 2. Filtra produtos
    let filtered = state.allProducts.filter(p => {
        if(state.isFavoritesView) return state.favorites.includes(p.id);
        
        // Filtro de Busca
        if(state.filters.search) {
            const searchLower = state.filters.search.toLowerCase();
            const nameMatch = p.name.toLowerCase().includes(searchLower);
            const skuMatch = p.sku && p.sku.toLowerCase().includes(searchLower);
            if (!nameMatch && !skuMatch) return false;
        }

        // Filtro de Categoria
        if(state.filters.category === 'offers') { 
            if(!(p.promoValue && p.promoValue < p.value)) return false; 
        } else if(state.filters.category && p.category !== state.filters.category) return false;

        // Filtro de Preço
        const price = (p.promoValue && p.promoValue < p.value) ? p.promoValue : p.value;
        if(state.filters.maxPrice && price > state.filters.maxPrice) return false;

        // Filtros de Tamanhos e Cores
        if(state.filters.sizes.length > 0 || state.filters.colors.length > 0) {
            const selectedSizesLower = state.filters.sizes.map(s => s.toLowerCase());
            const selectedColorsLower = state.filters.colors.map(c => c.toLowerCase());

            if (p.variations && p.variations.length > 0) {
                const hasMatch = p.variations.some(v => {
                    if (!v.active) return false;
                    const sizeMatch = state.filters.sizes.length === 0 || selectedSizesLower.includes(v.size.toLowerCase());
                    const colorMatch = state.filters.colors.length === 0 || selectedColorsLower.includes(v.color.toLowerCase());
                    return sizeMatch && colorMatch;
                });
                if (!hasMatch) return false;
            } else {
                const sizeMatchBase = state.filters.sizes.length === 0 || p.sizes?.some(s => selectedSizesLower.includes(s.toLowerCase()));
                const colorMatchBase = state.filters.colors.length === 0 || p.colors?.some(c => selectedColorsLower.includes(c.toLowerCase()));
                if (!sizeMatchBase || !colorMatchBase) return false;
            }
        }
        return true;
    });

    // 3. Exibe mensagem de vazio se necessário
    if (filtered.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    // 4. Agrupa por Categoria
    const groups = {};
    if(state.isFavoritesView || state.filters.search || (state.filters.category && state.filters.category !== 'offers') || state.filters.maxPrice || state.filters.sizes.length > 0 || state.filters.colors.length > 0) {
        groups['Resultados Encontrados'] = filtered;
    } else {
        filtered.forEach(p => { 
            const k = p.category || 'Geral'; 
            if(!groups[k]) groups[k]=[]; 
            groups[k].push(p); 
        });
    }

    // 5. Renderiza os Grupos
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
    
    // Esconde se houver filtros ativos
    const hasActiveFilters = 
        state.filters.search.length > 0 || 
        state.filters.category !== null || 
        state.isFavoritesView || 
        state.filters.maxPrice !== null || 
        state.filters.sizes.length > 0 || 
        state.filters.colors.length > 0;

    if (hasActiveFilters) {
        magicContainer.innerHTML = '';
        magicContainer.classList.add('hidden');
        return;
    }

    magicContainer.classList.remove('hidden');
    magicContainer.innerHTML = '';

    // Novidades
    if (config.magicCategories?.showNew) {
        const news = [...products]
            .filter(p => p.status === 'active')
            .sort((a, b) => {
                const getTime = (p) => {
                    if (typeof p.createdAt === 'number') return p.createdAt;
                    if (p.createdAt?.toMillis) return p.createdAt.toMillis();
                    if (p.createdAt?.seconds) return p.createdAt.seconds * 1000;
                    if (p.createdAt instanceof Date) return p.createdAt.getTime();
                    return p.lastUpdate || 0;
                };
                return getTime(b) - getTime(a);
            })
            .slice(0, 15);

        if (news.length > 0) {
            magicContainer.innerHTML += generateMagicSectionHTML("Novidades ✨", news, "bg-purple-600");
        }
    }

    // Mais Vistos
    if (config.magicCategories?.showTop) {
        try {
            const analyticsRef = doc(db, `stores/${state.STORE_ID}/analytics`, "product_views");
            const snap = await getDocFromServer(analyticsRef).catch(() => null);
            
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
        } catch (e) { 
            console.warn("Analytics indisponível."); 
        }
    }
}

function generateMagicSectionHTML(title, products, colorClass) {
    if (products.length === 0) return '';
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
        </section>
    `;
}

// --- MODAL DE DETALHES DO PRODUTO ---

export function openProductModal(id) {
    els.modalTimer()?.classList.add('hidden');
    const p = state.allProducts.find(x => x.id === id); 
    if(!p) return; 

    // Atualiza URL (Deep Link)
    const newURL = window.location.pathname + `?id=${p.id}`;
    window.history.pushState({ path: newURL }, '', newURL);
    document.title = `${p.name} | ${state.storeConfigGlobal.storeName || 'Vitrine'}`;

    state.currentDetailId = id; 
    state.currentDetailQty = 1; 
    state.currentDetailSelection = { 
        size: null, 
        color: null, 
        image: p.images?.[0] || 'https://placehold.co/600?text=Sem+Imagem' 
    }; 

    // Imagens
    const mainImages = (p.images?.length) ? p.images : ['https://placehold.co/600?text=Sem+Imagem'];
    const variationImages = (p.variations || []).map(v => v.image).filter(img => img && !mainImages.includes(img));
    state.currentDetailImages = [...mainImages, ...variationImages];
    state.currentDetailImageIndex = 0;
    
    // UI Básica
    renderThumbnails();
    updateDetailImageDisplay();
    
    document.getElementById('detailCat').textContent = p.category || "Geral"; 
    document.getElementById('detailName').textContent = p.name; 
    document.getElementById('detailSku').textContent = p.sku || 'N/A';
    document.getElementById('detailDesc').textContent = p.description || ''; 
    document.getElementById('detailQtyDisplay').textContent = "1";

    // Variações e Preços
    renderVariationUI(p);
    updateModalHeartBtn();
    renderRelatedProducts(p);

    // Botão Adicionar (window.addToCart vem do app.js)
    const btn = els.detailAddBtn();
    btn.onclick = () => { window.addToCart(p, state.currentDetailQty, state.currentDetailSelection); }; 

    els.modalDetails().classList.remove('hidden'); 
    if(window.lucide) window.lucide.createIcons();
}

function renderVariationUI(p) {
    const matrix = p.variations || [];
    const hasS = p.sizes?.length > 0, hasC = p.colors?.length > 0;
  
    const updatePrices = () => {
        const agora = Date.now();
        const isPromoAtiva = p.promoValue && p.promoValue < p.value && (!p.promoUntil || p.promoUntil > agora);
        const fatorDesconto = isPromoAtiva ? (p.promoValue / p.value) : 1;
        
        let basePrice = p.value; 
        let skuDinamico = p.sku || 'N/A'; 
        let isComplete = (!hasS || state.currentDetailSelection.size) && (!hasC || state.currentDetailSelection.color);
        let outOfStockVariation = false;

        if(isComplete && matrix.length) {
            const comb = matrix.find(v => 
                (!hasS || v.size.trim().toLowerCase() === (state.currentDetailSelection.size||"").trim().toLowerCase()) && 
                (!hasC || v.color.trim().toLowerCase() === (state.currentDetailSelection.color||"").trim().toLowerCase())
            );
            if(comb && comb.active) { 
                const vStock = parseInt(comb.stock) || 0;
                if(vStock <= 0) { outOfStockVariation = true; isComplete = false; }
                basePrice = comb.price; 
                skuDinamico = comb.sku || skuDinamico;
            } else if(hasS || hasC) { isComplete = false; }
        }

        const precoPixBase = p.priceCash || basePrice;
        const precoCardBase = p.priceCard || basePrice;
        const diferencaCartao = precoCardBase - precoPixBase;

        const finalPricePix = isPromoAtiva ? (basePrice * fatorDesconto) : precoPixBase;
        const finalPriceCard = isPromoAtiva ? (finalPricePix + diferencaCartao) : precoCardBase;
        const oldP = isPromoAtiva ? basePrice : null;

        els.detailPrice().innerHTML = `
        <div class="flex flex-col leading-tight">
            ${oldP ? `<div class="flex items-center gap-1.5 mb-0.5"><span class="text-[10px] text-slate-400 line-through">R$ ${oldP.toFixed(2).replace('.',',')}</span><span class="text-[9px] font-black text-red-500 uppercase tracking-tighter">Oferta</span></div>` : ''}
            <div class="flex items-center gap-1.5">
                <span class="text-2xl font-black text-slate-900 tracking-tighter">R$ ${finalPricePix.toFixed(2).replace('.',',')}</span>
                <span class="text-[9px] font-bold text-slate-400 uppercase">Pix</span>
            </div>
            <div class="flex items-center gap-1 mt-0.5">
                <span class="text-[10px] font-bold text-slate-600">Cartão: R$ ${finalPriceCard.toFixed(2).replace('.',',')}</span>
                ${(p.maxInstallments > 1) ? `<span class="text-[10px] text-slate-400">| ${p.maxInstallments}x de R$ ${(finalPriceCard / p.maxInstallments).toFixed(2).replace('.', ',')}</span>` : ''}
            </div>
        </div>`;

        document.getElementById('detailOldPrice').textContent = ''; 
        document.getElementById('detailSku').textContent = skuDinamico; 
        
        const btnAdd = els.detailAddBtn();
        if (outOfStockVariation) {
            btnAdd.textContent = "Esgotado";
            btnAdd.disabled = true;
            btnAdd.className = "bg-slate-400 text-white font-bold px-6 h-11 rounded-xl opacity-50 text-sm";
        } else {
            btnAdd.textContent = "Adicionar";
            btnAdd.disabled = !isComplete;
            btnAdd.className = `bg-primary hover:bg-primaryDark text-white font-bold px-6 h-11 rounded-xl active-scale shadow-lg transition-all text-sm ${!isComplete ? 'opacity-40' : ''}`;
        }
    };

    const renderChips = (list, type, container, wrapper) => {
        container.innerHTML = '';
        if(!list?.length) { wrapper.classList.add('hidden'); return; }
        wrapper.classList.remove('hidden');
        const otherType = type === 'size' ? 'color' : 'size';
        const otherVal = state.currentDetailSelection[otherType];

        list.forEach(val => {
            const chip = document.createElement('div');
            const normVal = val.trim().toLowerCase();
            const isSelected = state.currentDetailSelection[type] && state.currentDetailSelection[type].trim().toLowerCase() === normVal;
            
            let isPossible = true;
            if(matrix.length) {
                isPossible = matrix.some(v => 
                    v.active && 
                    (parseInt(v.stock) > 0) && 
                    v[type].trim().toLowerCase() === normVal && 
                    (!otherVal || v[otherType].trim().toLowerCase() === otherVal.trim().toLowerCase())
                );
            }

            const CHIP_S = "border-primary bg-primary text-white font-bold ring-2 ring-primary/20 shadow-md";
            const CHIP_D = "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100";
            
            chip.className = `px-4 py-2 border rounded-lg text-xs chip-common ${isSelected ? CHIP_S : (isPossible ? CHIP_D : 'chip-disabled')}`;
            chip.textContent = val;
            chip.onclick = () => { 
                if(!isPossible) return; 
                state.currentDetailSelection[type] = isSelected ? null : val; 
                renderVariationUI(p); 
            };
            container.appendChild(chip);
        });
    };

    renderChips(p.sizes, 'size', document.getElementById('detailSizesContainer'), document.getElementById('sizesWrapper'));
    renderChips(p.colors, 'color', document.getElementById('detailColorsContainer'), document.getElementById('colorsWrapper'));
    updatePrices();
}

export function closeModalDetails() {
    els.modalDetails().classList.add('hidden');
    window.history.pushState({}, '', window.location.pathname);
}

// --- RENDERIZAÇÃO DE INTERFACE (FILTROS, TABS, CARROSSEL) ---

export function renderHeroCarousel(banners) {
    const container = document.getElementById('heroGridContainer');
    const dotsContainer = document.getElementById('carouselDots');
    if (!container || !dotsContainer) return;
    
    container.innerHTML = '';
    dotsContainer.innerHTML = '';
    if (!banners?.length) return;

    banners.forEach((b, index) => {
        const div = document.createElement('div');
        div.className = `hero-card w-full flex-shrink-0 h-full rounded-3xl p-6 md:p-10 flex items-center relative overflow-hidden snap-center cursor-pointer text-white transition-all duration-500`;
        div.onclick = () => {
            const bannerRef = b.target || b.category; 
            if (bannerRef) {
                if (bannerRef === 'offers') {
                    state.filters.category = 'offers';
                } else {
                    const categoriaEncontrada = state.categories.find(c => c.toLowerCase().trim() === bannerRef.toLowerCase().trim());
                    state.filters.category = categoriaEncontrada || bannerRef;
                }
                state.isFavoritesView = false;
                renderCategoryTabs();
                renderCatalog();
                const catContainer = els.categoryContainer();
                if(catContainer) catContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        div.style.background = `linear-gradient(135deg, ${b.color1 || '#333'}, ${b.color2 || '#000'})`;
        div.innerHTML = `
            <div class="relative z-10 flex-1 flex flex-col justify-center items-start gap-1 h-full min-w-0">
                <span class="px-2 py-0.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-[7px] font-black uppercase tracking-widest mb-1">${b.tag || 'Destaque'}</span>
                <h3 class="font-display font-bold text-2xl md:text-4xl leading-tight uppercase tracking-tighter w-full break-words">${b.title}</h3>
                ${b.subtitle ? `<p class="opacity-90 text-xs md:text-sm font-medium leading-tight max-w-[90%] break-words line-clamp-2">${b.subtitle}</p>` : ''}
                <div class="mt-4 px-6 py-2 bg-white/10 border border-white/30 rounded-full text-[9px] font-black uppercase tracking-widest">Ver Agora</div>
            </div>
            ${b.imageUrl ? `<div class="animate-floating w-32 h-32 md:w-52 md:h-52 rounded-2xl overflow-hidden border-2 border-white/10 shrink-0 ml-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)]"><img src="${b.imageUrl}" class="w-full h-full object-cover scale-110"></div>` : ''}
        `;
        container.appendChild(div);

        const dot = document.createElement('div');
        dot.className = `h-1.5 transition-all duration-300 rounded-full ${index === 0 ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`;
        dotsContainer.appendChild(dot);
    });
}

export function renderCategoryTabs() {
    const c = els.categoryContainer(); c.innerHTML = '';
    const mk = (id, l, icon) => {
        const active = state.filters.category === id && !state.isFavoritesView;
        const b = document.createElement('button');
        b.className = `px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2 ${active ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-primary'}`;
        b.innerHTML = icon ? `${icon} ${l}` : l;
        b.onclick = () => { 
            state.isFavoritesView = false; 
            state.filters.category = id; 
            renderCategoryTabs(); 
            renderCatalog(); 
        };
        return b;
    };
    c.appendChild(mk('offers', 'Ofertas', '<i data-lucide="flame" class="w-3.5 h-3.5"></i>'));
    c.appendChild(mk(null, 'Tudo'));
    state.categories.forEach(cat => c.appendChild(mk(cat, cat)));
    if(window.lucide) window.lucide.createIcons();
}

export function populateFilterOptions() {
    const sizeCounts = {}, colorCounts = {};
    const ss = new Set(), cc = new Set();

    state.allProducts.forEach(p => {
        if (p.sizes) p.sizes.forEach(s => { const val = s.trim(); if (val) { ss.add(val); sizeCounts[val] = (sizeCounts[val] || 0) + 1; }});
        if (p.colors) p.colors.forEach(c => { const val = c.trim(); if (val) { cc.add(val); colorCounts[val] = (colorCounts[val] || 0) + 1; }});
    });

    const renderChips = (set, container, type, counts) => {
        if (!container) return;
        container.innerHTML = '';
        Array.from(set).sort().forEach(val => {
            const isSelected = state.filters[type].includes(val);
            const count = counts[val] || 0;
            const d = document.createElement('div');
            const label = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();

            d.className = `px-3 py-2 border rounded-lg text-[11px] chip-common flex items-center justify-between gap-3 transition-all ${isSelected ? 'border-primary bg-primary text-white font-bold shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-primary'}`;
            d.innerHTML = `<span>${label}</span><span class="${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'} px-1.5 py-0.5 rounded text-[9px]">${count}</span>`;
            
            d.onclick = () => {
                if(isSelected) state.filters[type] = state.filters[type].filter(x => x !== val);
                else state.filters[type].push(val);
                populateFilterOptions(); 
                renderCatalog();
                updateFilterBadge();
            };
            container.appendChild(d);
        });
    };
    renderChips(ss, document.getElementById('filterSizesContainer'), 'sizes', sizeCounts);
    renderChips(cc, document.getElementById('filterColorsContainer'), 'colors', colorCounts);
}

export function updateFavoritesUI() {
    const count = state.favorites.length;
    const badge = document.getElementById('favBadgeDesktop');
    const heartIcon = document.getElementById('headerHeartIcon');
    const favBtn = document.getElementById('headerFavBtn');

    if (!badge || !heartIcon || !favBtn) return;
    badge.textContent = count;
    badge.classList.toggle('scale-0', count === 0);

    if (count > 0) {
        heartIcon.style.fill = 'var(--color-primary)';
        heartIcon.style.color = 'var(--color-primary)';
        favBtn.style.borderColor = 'var(--color-primary)';
    } else {
        heartIcon.style.fill = 'none';
        heartIcon.style.color = '#334155';
        favBtn.style.borderColor = '#e2e8f0';
    }
}

export function toggleFavoritesView() {
    state.isFavoritesView = !state.isFavoritesView;
    renderCategoryTabs();
    renderCatalog();
    window.scrollTo({top:0, behavior:'smooth'});
}

export function updateFilterBadge() {
    let count = 0;
    if (state.filters.maxPrice) count++;
    count += state.filters.sizes.length;
    count += state.filters.colors.length;

    [els.filterBadgeDesktop(), els.filterBadgeMobile()].forEach(badge => {
        if (badge) {
            badge.textContent = count;
            badge.classList.toggle('scale-100', count > 0);
            badge.classList.toggle('scale-0', count === 0);
        }
    });
}

export function resetAllFilters() {
    // Importante: resetFilters é importado do state.js (precisa garantir que foi importado no topo)
    // Se não estiver, use a lógica inline ou adicione nos imports.
    // Como resetFilters está no state.js, e importamos `state` e `resetFilters` no topo da Parte 1, deve funcionar.
    // Mas para garantir caso tenha esquecido no import da Parte 1, vou usar o state direto.
    state.filters = { search: "", category: null, maxPrice: null, sizes: [], colors: [] };
    state.isFavoritesView = false;

    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => { i.value = ''; i.checked = false; });
    renderCategoryTabs();
    renderCatalog();
    updateFilterBadge();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function handleSearchInput(v) { state.filters.search = v; renderCatalog(); }

export function openFilterDrawer() {
    const modal = document.getElementById('filterModal');
    const drawer = document.getElementById('filterDrawer');
    if (modal && drawer) {
        modal.classList.remove('hidden');
        setTimeout(() => drawer.classList.remove('translate-x-full'), 10);
    }
}

export function closeFilterDrawer() {
    const modal = document.getElementById('filterModal');
    const drawer = document.getElementById('filterDrawer');
    if (drawer) drawer.classList.add('translate-x-full');
    if (modal) setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- VISUALIZADOR DE IMAGENS E ZOOM ---

export function renderThumbnails() {
    const thumbContainer = document.getElementById('detailThumbnails');
    if (!thumbContainer) return;
    thumbContainer.innerHTML = '';
    state.currentDetailImages.forEach((url, idx) => {
        const img = document.createElement('img');
        img.src = url;
        img.className = "min-w-[44px] w-11 h-11 rounded-lg border-2 object-cover cursor-pointer transition-all snap-center thumb-inactive shrink-0";
        img.onclick = () => setDetailImage(idx);
        thumbContainer.appendChild(img);
    });
}

export function setDetailImage(idx) { 
    state.currentDetailImageIndex = idx; 
    updateDetailImageDisplay(); 
}

export function updateDetailImageDisplay() {
    const img = els.detailImg();
    const counter = document.getElementById('imageCounter');
    const thumbContainer = document.getElementById('detailThumbnails');
    
    if (!img || !thumbContainer) return;
    img.src = state.currentDetailImages[state.currentDetailImageIndex];
    if (counter) counter.textContent = `${state.currentDetailImageIndex + 1} / ${state.currentDetailImages.length}`;
    
    Array.from(thumbContainer.children).forEach((t, i) => { 
        const isActive = i === state.currentDetailImageIndex;
        t.classList.toggle('thumb-active', isActive); 
        t.classList.toggle('thumb-inactive', !isActive); 
        if(isActive) t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
}

export function openImageZoom() {
    const currentImg = state.currentDetailImages[state.currentDetailImageIndex];
    if(!currentImg || currentImg.includes('placehold')) return;
    
    const m = els.modalImageZoom();
    const zoomedImg = els.zoomedImg();
    
    zoomedImg.src = currentImg;
    m.classList.remove('hidden');
    zoomedImg.style.transform = "scale(1)";
    zoomedImg.style.opacity = '1';
    
    setTimeout(() => { m.classList.remove('opacity-0'); }, 10);

    let startX = 0;
    m.ontouchstart = (e) => { if (e.touches.length === 1) startX = e.touches[0].screenX; };
    m.ontouchend = (e) => {
        if (e.touches.length > 0) return; 
        let endX = e.changedTouches[0].screenX;
        let diff = startX - endX;
        if (Math.abs(diff) > 70) { 
            const dir = diff > 0 ? 1 : -1;
            if (state.currentDetailImages.length > 1) {
                zoomedImg.style.opacity = '0.3';
                setTimeout(() => {
                    state.currentDetailImageIndex = (state.currentDetailImageIndex + dir + state.currentDetailImages.length) % state.currentDetailImages.length;
                    zoomedImg.src = state.currentDetailImages[state.currentDetailImageIndex];
                    zoomedImg.style.opacity = '1';
                    updateDetailImageDisplay();
                }, 150);
            }
        }
    };
    m.onclick = (e) => { if (e.target.id !== 'zoomedImg') closeImageZoom(); };
}

export function closeImageZoom() {
    const m = els.modalImageZoom();
    m.classList.add('opacity-0');
    els.zoomedImg().classList.replace('scale-100','scale-95');
    m.ontouchstart = null; m.ontouchend = null;
    setTimeout(() => m.classList.add('hidden'), 300);
}

// --- FUNÇÕES EXTRAS ---

function updateModalHeartBtn() { 
    const btn = document.querySelector('#modalHeartBtn i');
    if(btn) btn.classList.toggle('heart-active', state.favorites.includes(state.currentDetailId));
}

function renderRelatedProducts(curr) {
    const s = document.getElementById('relatedProductsSection'), g = document.getElementById('relatedGrid'); g.innerHTML = ''; 
    const rel = state.allProducts.filter(p => p.category === curr.category && p.id !== curr.id).slice(0, 10); 
    if (!rel.length) { s.classList.add('hidden'); return; } 
    s.classList.remove('hidden');
    rel.forEach(p => {
        const pr = (p.promoValue && p.promoValue < p.value) ? p.promoValue : p.value;
        // Nota: onclick="openProductModal" será global
        g.innerHTML += `<div onclick="window.openProductModal('${p.id}')" class="min-w-[110px] w-28 bg-white border border-slate-100 rounded-lg overflow-hidden cursor-pointer shrink-0"><img src="${p.images?.[0] || 'https://placehold.co/200'}" class="w-full h-20 object-cover" loading="lazy"><div class="p-2"><h5 class="text-[10px] font-medium truncate">${p.name}</h5><span class="text-xs font-bold block mt-0.5">R$ ${pr.toFixed(2).replace('.', ',')}</span></div></div>`;
    });
}

export function adjustDetailQty(d) {
    const p = state.allProducts.find(x => x.id === state.currentDetailId);
    if(!p) return;

    const maxStock = parseInt(p.stock) || 0;
    const novaQuantidade = state.currentDetailQty + d;

    if (novaQuantidade > maxStock) {
        showToast(`⚠️ Desculpe, temos apenas ${maxStock} unidades em estoque.`);
        return;
    }

    state.currentDetailQty = Math.max(1, novaQuantidade); 
    document.getElementById('detailQtyDisplay').textContent = state.currentDetailQty; 
}

export function shareProduct() { 
    const p = state.allProducts.find(x => x.id === state.currentDetailId); 
    if(!p) return;
    const shareText = `Olha o que encontrei na ${state.storeConfigGlobal.storeName || 'loja'}: ${p.name}`;
    const shareUrl = window.location.href;

    if(navigator.share) navigator.share({ title: p.name, text: shareText, url: shareUrl }).catch(console.log);
    else { navigator.clipboard.writeText(`${shareText} ${shareUrl}`); showToast("Link copiado!"); }
}

export function initGlobalCountdowns() {
    if (window.timerInterval) clearInterval(window.timerInterval);
    window.timerInterval = setInterval(() => {
        const agora = Date.now();
        document.querySelectorAll('.product-timer').forEach(timerEl => {
            const pid = timerEl.getAttribute('data-pid');
            const p = state.allProducts.find(x => x.id === pid);
            if (p && p.promoUntil && (p.promoUntil - agora > 0)) {
                timerEl.classList.remove('hidden');
                timerEl.querySelector('.countdown-text').innerText = formatarTempo(p.promoUntil - agora);
            } else {
                timerEl.classList.add('hidden');
            }
        });
        
        if (state.currentDetailId) {
            const p = state.allProducts.find(x => x.id === state.currentDetailId);
            const mTimer = els.modalTimer();
            if (p && p.promoUntil && mTimer && (p.promoUntil - agora > 0)) {
                mTimer.classList.remove('hidden');
                els.modalTimerText().innerText = formatarTempo(p.promoUntil - agora);
            } else if(mTimer) mTimer.classList.add('hidden');
        }
    }, 1000);
}

export function setupSwipes() {
    const el = document.getElementById('mainImageContainer');
    if(!el) return;
    let startX = 0, startY = 0, startTime = 0;

    el.addEventListener('touchstart', (e) => {
        startX = e.changedTouches[0].screenX;
        startY = e.changedTouches[0].screenY;
        startTime = Date.now();
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        const diffX = startX - e.changedTouches[0].screenX;
        const diffY = startY - e.changedTouches[0].screenY;
        if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && (Date.now() - startTime < 250)) { window.openImageZoom(); return; }
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            const direcao = diffX > 0 ? 1 : -1;
            if (state.currentDetailImages.length > 1) {
                state.currentDetailImageIndex = (state.currentDetailImageIndex + direcao + state.currentDetailImages.length) % state.currentDetailImages.length;
                updateDetailImageDisplay();
            }
        }
    }, { passive: true });
}

export function openDeliveryModal() {
    document.getElementById('modalDelivery').classList.remove('hidden');
}

