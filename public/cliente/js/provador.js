window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    // --- LOGICA DE CATEGORIAS DINÂMICAS ---
    const catTops = [...new Set(state.allProducts
        .filter(p => p.posicaoProvador === 'superior')
        .map(p => p.category))].filter(c => c).sort();

    const catBots = [...new Set(state.allProducts
        .filter(p => p.posicaoProvador === 'inferior')
        .map(p => p.category))].filter(c => c).sort();
    
    let filterCatTop = 'Todas';
    let filterCatBot = 'Todas';

    container.innerHTML = `
        <style>
            .p-card { position: relative; width: 80%; flex-shrink: 0; margin: 0 10%; transition: transform 0.3s; }
            .active-piece { transform: scale(1.05); }
            .p-info-badge {
                position: absolute; top: 15px; right: 15px;
                background: rgba(255,255,255,0.95); padding: 6px 12px;
                border-radius: 12px; font-size: 11px; font-weight: 900;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1); z-index: 20;
                display: flex; flex-direction: column; align-items: flex-end;
            }
            .color-variants {
                position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 10px; z-index: 30;
                transition: opacity 0.3s;
            }
            .color-dot {
                width: 42px; height: 42px; border-radius: 10px;
                border: 2px solid white; object-fit: cover;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: 0.2s;
            }
            .color-dot.active-border { border-color: #000 !important; transform: scale(1.1); }
            .active-piece .color-variants { opacity: 1; pointer-events: auto; }
            .p-card:not(.active-piece) .color-variants { opacity: 0; pointer-events: none; }
            .main-img { width: 100%; height: 350px; object-fit: cover; border-radius: 24px; }
            #provHeader { padding: 15px; }
        </style>

        <div class="peças-container">
            <div id="deckTop" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full"></div>
            <div id="deckBot" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full"></div>
        </div>

        <div id="provHeader">
            <div class="flex justify-end items-center mb-3">
                <button id="btnCloseProvador" class="w-10 h-10 bg-black/5 text-black rounded-full flex items-center justify-center active:scale-90 transition-all">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <select id="selCatTop" class="bg-white border border-slate-200 rounded-xl py-3 px-3 text-[10px] font-black uppercase tracking-wider shadow-sm outline-none">
                    <option value="Todas">Tops: Todas</option>
                    ${catTops.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="selCatBot" class="bg-white border border-slate-200 rounded-xl py-3 px-3 text-[10px] font-black uppercase tracking-wider shadow-sm outline-none">
                    <option value="Todas">Bottoms: Todas</option>
                    ${catBots.map(c => `<option value="${c}">${c}</option>`).join('')}
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
            <button id="btnFinalizarLook" class="w-full h-16 bg-black text-white rounded-2xl font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-3 active:scale-95 transition-all">
                <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                Adicionar ao Carrinho
            </button>
        </div>
    `;

    // --- HANDLERS ---
    window.changeProvadorThumb = (el, newImg) => {
        const card = el.closest('.p-card');
        const mainImg = card.querySelector('.main-img');
        mainImg.src = newImg;
        card.dataset.img = newImg;
        card.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('active-border'));
        el.classList.add('active-border');
        updateUI();
    };

    const fechar = () => {
        container.classList.add('hidden');
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    container.onclick = (e) => {
        if (e.target.closest('#btnCloseProvador')) fechar();
        if (e.target.closest('#btnFinalizarLook')) {
            const t = document.querySelector('#deckTop .active-piece');
            const b = document.querySelector('#deckBot .active-piece');
            if(t) {
                const p = state.allProducts.find(x => x.id == t.dataset.id);
                window.addToCart(p, 1, { selectedSize: p.sizes?.[0] || 'UN', image: t.dataset.img });
            }
            if(b) {
                const p = state.allProducts.find(x => x.id == b.dataset.id);
                window.addToCart(p, 1, { selectedSize: p.sizes?.[0] || 'UN', image: b.dataset.img });
            }
            if(window.showToast) showToast("Look no carrinho!");
            fechar();
        }
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    const render = () => {
        const tops = state.allProducts.filter(p => p.posicaoProvador === 'superior' && (filterCatTop === 'Todas' || p.category === filterCatTop));
        const bots = state.allProducts.filter(p => p.posicaoProvador === 'inferior' && (filterCatBot === 'Todas' || p.category === filterCatBot));

        const makeHtml = (list) => list.map(p => {
            let gallery = [p.images?.[0]];
            if (p.variations) p.variations.forEach(v => { if (v.image && !gallery.includes(v.image)) gallery.push(v.image); });
            gallery = gallery.filter(img => img);

            const dotsHtml = gallery.length > 1 ? `
                <div class="color-variants">
                    ${gallery.slice(0, 5).map((img, idx) => `
                        <img src="${img}" class="color-dot ${idx === 0 ? 'active-border' : ''}" onclick="window.changeProvadorThumb(this, '${img}')">
                    `).join('')}
                </div>
            ` : '';

            return `
                <div class="p-card snap-center" data-id="${p.id}" data-price="${p.value}" data-img="${p.images?.[0]}">
                    <div class="p-info-badge">
                        <span class="text-slate-900">R$ ${p.value.toFixed(2)}</span>
                        <span class="text-[9px] text-slate-400 mt-1">${p.sizes ? p.sizes.join(' | ') : 'UN'}</span>
                    </div>
                    ${dotsHtml}
                    <img src="${p.images?.[0]}" class="main-img shadow-xl">
                </div>`;
        }).join('');

        document.getElementById('deckTop').innerHTML = makeHtml(tops) || '<div class="w-full text-center py-20 opacity-30 text-[10px] font-bold uppercase">Nenhum Top</div>';
        document.getElementById('deckBot').innerHTML = makeHtml(bots) || '<div class="w-full text-center py-20 opacity-30 text-[10px] font-bold uppercase">Nenhum Bottom</div>';
        
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
        setTimeout(() => el.dispatchEvent(new Event('scroll')), 300);
    };

    const updateUI = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        const total = (Number(t?.dataset.price || 0) + Number(b?.dataset.price || 0));
        document.getElementById('pTotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
        document.getElementById('miniPrev').innerHTML = `
            ${t ? `<img src="${t.dataset.img}" class="w-12 h-12 rounded-full border-2 border-white object-cover shadow-lg">` : ''}
            ${b ? `<img src="${b.dataset.img}" class="w-12 h-12 rounded-full border-2 border-white object-cover shadow-lg">` : ''}
        `;
    };

    if (window.lucide) lucide.createIcons();
    container.classList.remove('hidden');
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
