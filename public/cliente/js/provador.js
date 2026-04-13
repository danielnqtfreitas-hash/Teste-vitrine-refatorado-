window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    // 1. Mapear Categorias Reais do seu Estado
    const catTops = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'superior').map(p => p.category))].filter(Boolean);
    const catBots = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'inferior').map(p => p.category))].filter(Boolean);
    
    let filterCatTop = 'Todas';
    let filterCatBot = 'Todas';

    container.innerHTML = `
        <style>
            #provadorFullscreen {
                position: fixed; inset: 0; background: #f8fafc; z-index: 9999;
                display: flex; flex-direction: column; font-family: 'Inter', sans-serif;
            }
            .peças-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-top: 60px; }
            
            /* Card de Peça */
            .p-card { 
                min-width: 85vw; height: 35vh; margin: 0 10px; position: relative;
                background: white; border-radius: 24px; overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .p-card img.main-img { width: 100%; height: 100%; object-fit: cover; }

            /* Tamanhos na Vertical (Direita) */
            .size-badge-vertical {
                position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 4px; z-index: 10;
            }
            .size-item {
                background: rgba(255,255,255,0.9); border: 1px solid rgba(0,0,0,0.05);
                width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
                border-radius: 8px; font-size: 10px; font-weight: 800; color: #1e293b;
            }

            /* Variações de Cores (Esquerda) */
            .color-variants {
                position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 8px; z-index: 10;
            }
            .color-dot {
                width: 38px; height: 38px; border-radius: 10px; border: 2px solid white;
                object-fit: cover; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: 0.2s;
            }
            .color-dot.active { border-color: #000; transform: scale(1.1); }

            /* Header e Filtros */
            #provHeader { position: absolute; top: 0; left: 0; right: 0; p-5; z-index: 100; padding: 15px; }
            
            /* Footer e Botão */
            #provFooter { padding: 20px; background: white; border-top: 1px solid #f1f5f9; }
            .btn-checkout-provador {
                width: 100%; height: 65px; background: #000; color: #fff; border-radius: 20px;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 25px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
            }
        </style>

        <div id="provHeader">
            <div class="flex justify-end mb-3">
                <button id="btnCloseProvador" class="w-10 h-10 bg-white/80 backdrop-blur shadow-sm rounded-full flex items-center justify-center">
                    <i data-lucide="x" class="text-black w-5 h-5"></i>
                </button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <select id="selCatTop" class="bg-white border-none rounded-2xl py-3 px-4 text-[10px] font-black uppercase shadow-sm">
                    <option value="Todas">Tops: Todas</option>
                    ${catTops.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="selCatBot" class="bg-white border-none rounded-2xl py-3 px-4 text-[10px] font-black uppercase shadow-sm">
                    <option value="Todas">Bottoms: Todas</option>
                    ${catBots.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
        </div>

        <div class="peças-container">
            <div id="deckTop" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full py-2"></div>
            <div id="deckBot" class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full py-2"></div>
        </div>

        <div id="provFooter">
            <button id="btnFinalizarLook" class="btn-checkout-provador active:scale-95 transition-transform">
                <div class="flex flex-col items-start">
                    <span class="text-[10px] opacity-60">Adicionar Look</span>
                    <span id="pTotal" class="text-lg leading-none">R$ 0,00</span>
                </div>
                <i data-lucide="shopping-bag" class="w-6 h-6"></i>
            </button>
        </div>
    `;

    // --- FUNÇÕES DE INTERAÇÃO ---
    window.changeProvadorThumb = (el, newImg) => {
        const card = el.closest('.p-card');
        card.querySelector('.main-img').src = newImg;
        card.dataset.img = newImg;
        card.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        el.classList.add('active');
        updateUI();
    };

    const render = () => {
        const tops = window.state.allProducts.filter(p => p.posicaoProvador === 'superior' && (filterCatTop === 'Todas' || p.category === filterCatTop));
        const bots = window.state.allProducts.filter(p => p.posicaoProvador === 'inferior' && (filterCatBot === 'Todas' || p.category === filterCatBot));

        const makeHtml = (list) => list.map(p => {
            let gallery = [p.images[0]];
            if (p.variations) p.variations.forEach(v => { if(v.image) gallery.push(v.image) });
            gallery = [...new Set(gallery)];

            const sizesHtml = (p.sizes || []).map(s => `<div class="size-item">${s}</div>`).join('');
            const colorsHtml = gallery.length > 1 ? `
                <div class="color-variants">
                    ${gallery.slice(0, 4).map(img => `<img src="${img}" class="color-dot ${img === p.images[0] ? 'active' : ''}" onclick="window.changeProvadorThumb(this, '${img}')">`).join('')}
                </div>` : '';

            return `
                <div class="p-card snap-center" data-id="${p.id}" data-price="${p.value}" data-img="${p.images[0]}">
                    ${colorsHtml}
                    <div class="size-badge-vertical">${sizesHtml}</div>
                    <img src="${p.images[0]}" class="main-img">
                </div>`;
        }).join('');

        document.getElementById('deckTop').innerHTML = makeHtml(tops);
        document.getElementById('deckBot').innerHTML = makeHtml(bots);
        setupScroll('deckTop'); setupScroll('deckBot');
    };

    const setupScroll = (id) => {
        const el = document.getElementById(id);
        el.onscroll = () => {
            const center = el.scrollLeft + el.offsetWidth / 2;
            el.querySelectorAll('.p-card').forEach(card => {
                card.classList.toggle('active-piece', Math.abs(center - (card.offsetLeft + card.offsetWidth / 2)) < 100);
            });
            clearTimeout(el.timer); el.timer = setTimeout(() => updateUI(), 100);
        };
        setTimeout(() => el.dispatchEvent(new Event('scroll')), 300);
    };

    const updateUI = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        const total = (Number(t?.dataset.price || 0) + Number(b?.dataset.price || 0));
        document.getElementById('pTotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    };

    // Eventos de Fechamento e Checkout
    container.querySelector('#btnCloseProvador').onclick = () => {
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    container.querySelector('#btnFinalizarLook').onclick = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        if(!t && !b) return;
        if(t) window.addToCart(window.state.allProducts.find(x => x.id == t.dataset.id), 1, { image: t.dataset.img });
        if(b) window.addToCart(window.state.allProducts.find(x => x.id == b.dataset.id), 1, { image: b.dataset.img });
        showToast("Look Adicionado!");
        container.querySelector('#btnCloseProvador').click();
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
