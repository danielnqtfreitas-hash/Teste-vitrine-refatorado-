/* =========================================================================
   MÓDULO: PROVADOR VIRTUAL - ATUALIZAÇÃO CIRÚRGICA (js/provador.js)
   ========================================================================= */

window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    const catTops = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'superior').map(p => p.category))].filter(Boolean);
    const catBots = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'inferior').map(p => p.category))].filter(Boolean);
    
    let filterCatTop = 'Todas';
    let filterCatBot = 'Todas';

    container.innerHTML = `
        <style>
            #provadorFullscreen {
                position: fixed; inset: 0; background: #fff; z-index: 9999;
                display: flex; flex-direction: column; font-family: 'Inter', sans-serif;
            }
            
            .peças-container { 
                flex: 1; display: flex; flex-direction: column; overflow: hidden;
                background: #fff; padding: 0 55px; /* Calhas laterais para controles */
            }

            .deck-scroll {
                flex: 1; display: flex; overflow-x: auto; 
                snap-type: x mandatory; scrollbar-width: none;
            }
            .deck-scroll::-webkit-scrollbar { display: none; }

            .p-card { 
                min-width: calc(100vw - 110px); height: 100%; position: relative;
                background: #fff; display: flex; align-items: center; justify-content: center;
            }
            .p-card img.main-img { width: 100%; height: 100%; object-fit: cover; }

            /* Calhas Laterais Brancas */
            .side-control-left {
                position: absolute; left: -55px; top: 0; bottom: 0; width: 55px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 12px; background: #fff; z-index: 10;
            }
            .side-control-right {
                position: absolute; right: -55px; top: 0; bottom: 0; width: 55px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 6px; background: #fff; z-index: 10;
            }

            .color-dot {
                width: 40px; height: 40px; border-radius: 12px; border: 2px solid #f1f5f9;
                object-fit: cover; transition: 0.2s;
            }
            .color-dot.active { border-color: #000; transform: scale(1.1); }

            .size-item {
                width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
                border-radius: 10px; font-size: 11px; font-weight: 800; color: #000;
                border: 1px solid #eee; background: #fdfdfd;
            }

            /* Overlay do Topo */
            .top-bar-overlay {
                position: absolute; top: 0; left: 0; right: 0; z-index: 100;
                padding: 15px; display: flex; justify-content: space-between; gap: 8px;
            }
            .prov-filters { display: flex; gap: 6px; flex: 1; }
            .prov-filters select {
                background: #fff; border: 1px solid #eee; border-radius: 12px;
                padding: 10px; font-size: 10px; font-weight: 800; text-transform: uppercase;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }

            #btnCloseProvador {
                width: 42px; height: 42px; background: #000; color: #fff;
                border-radius: 14px; display: flex; align-items: center; justify-content: center;
            }

            /* Footer */
            #provFooter { padding: 18px; background: white; border-top: 1px solid #f1f5f9; }
            .btn-checkout-provador {
                width: 100%; height: 65px; background: #000; color: #fff; border-radius: 22px;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 25px; font-weight: 800; text-transform: uppercase;
            }
        </style>

        <div class="top-bar-overlay">
            <div class="prov-filters">
                <select id="selCatTop">
                    <option value="Todas">Tops: Todas</option>
                    ${catTops.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="selCatBot">
                    <option value="Todas">Bottoms: Todas</option>
                    ${catBots.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <button id="btnCloseProvador"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>

        <div class="peças-container">
            <div id="deckTop" class="deck-scroll"></div>
            <div id="deckBot" class="deck-scroll"></div>
        </div>

        <div id="provFooter">
            <button id="btnFinalizarLook" class="btn-checkout-provador">
                <div class="flex flex-col items-start">
                    <span class="text-[9px] opacity-60">Finalizar e Adicionar</span>
                    <span id="pTotal" class="text-xl leading-none">R$ 0,00</span>
                </div>
                <i data-lucide="shopping-cart" class="w-6 h-6"></i>
            </button>
        </div>
    `;

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

            return `
                <div class="p-card snap-center" data-id="${p.id}" data-price="${p.value}" data-img="${p.images[0]}">
                    <div class="side-control-left">
                        ${gallery.slice(0, 5).map(img => `<img src="${img}" class="color-dot ${img === p.images[0] ? 'active' : ''}" onclick="window.changeProvadorThumb(this, '${img}')">`).join('')}
                    </div>
                    <div class="side-control-right">
                        ${(p.sizes || []).map(s => `<div class="size-item">${s}</div>`).join('')}
                    </div>
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
                const c = card.offsetLeft + card.offsetWidth / 2;
                card.classList.toggle('active-piece', Math.abs(center - c) < 100);
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

    // Ação de clique único para adicionar e notificar
    container.querySelector('#btnFinalizarLook').onclick = function() {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        
        if(!t && !b) return;

        if(t) window.addToCart(window.state.allProducts.find(x => x.id == t.dataset.id), 1, { image: t.dataset.img });
        if(b) window.addToCart(window.state.allProducts.find(x => x.id == b.dataset.id), 1, { image: b.dataset.img });

        Swal.fire({
            title: 'Look Adicionado!',
            text: 'O que deseja fazer?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonColor: '#000',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Ver Carrinho',
            cancelButtonText: 'Continuar Comprando',
            heightAuto: false
        }).then((result) => {
            container.style.display = 'none';
            document.body.style.overflow = '';
            if (result.isConfirmed) window.openCartModal();
        });
    };

    container.querySelector('#btnCloseProvador').onclick = () => {
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
