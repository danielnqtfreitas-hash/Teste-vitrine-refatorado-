/* =========================================================================
   MÓDULO: PROVADOR VIRTUAL FULLSCREEN (REIMAGINADO)
   ========================================================================= */

window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    // 1. Mapear Categorias Reais
    const catTops = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'superior').map(p => p.category))].filter(Boolean);
    const catBots = [...new Set(window.state.allProducts.filter(p => p.posicaoProvador === 'inferior').map(p => p.category))].filter(Boolean);
    
    let filterCatTop = 'Todas';
    let filterCatBot = 'Todas';

    container.innerHTML = `
        <style>
            #provadorFullscreen {
                position: fixed; inset: 0; background: #000; z-index: 9999;
                display: flex; flex-direction: column; font-family: 'Inter', sans-serif;
            }
            
            /* Container das Imagens: Ocupa tudo, sem margem no topo */
            .peças-container { 
                flex: 1; display: flex; flex-direction: column; overflow: hidden; 
                background: #fff;
            }

            .deck-wrapper { flex: 1; position: relative; overflow: hidden; display: flex; }
            
            .deck-scroll {
                flex: 1; display: flex; overflow-x: auto; 
                snap-type: x mandatory; scrollbar-width: none;
            }
            .deck-scroll::-webkit-scrollbar { display: none; }

            /* Cards de Peça: 50% da altura da tela cada para ficarem colados */
            .p-card { 
                min-width: 100vw; height: 100%; position: relative;
                background: #f1f5f9;
            }
            .p-card img.main-img { width: 100%; height: 100%; object-fit: cover; }

            /* Camada de Controles flutuantes (Não empurram o layout) */
            .overlay-controls {
                position: absolute; inset: 0; pointer-events: none; z-index: 50;
                padding: 15px; display: flex; flex-direction: column; justify-content: space-between;
            }
            .overlay-controls > * { pointer-events: auto; }

            /* Filtros e Fechar flutuando sobre a imagem */
            .top-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
            .prov-filters { display: flex; gap: 6px; flex: 1; }
            .prov-filters select {
                background: rgba(255,255,255,0.85); backdrop-filter: blur(10px);
                border: none; border-radius: 12px; padding: 10px;
                font-size: 10px; font-weight: 900; text-transform: uppercase;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }

            #btnCloseProvador {
                width: 42px; height: 42px; background: rgba(255,255,255,0.85);
                backdrop-filter: blur(10px); border-radius: 50%;
                display: flex; align-items: center; justify-content: center; shadow: 0 4px 10px rgba(0,0,0,0.1);
            }

            /* Variações de Cores (Esquerda) */
            .color-variants {
                position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 10px; z-index: 60;
            }
            .color-dot {
                width: 42px; height: 42px; border-radius: 12px; border: 2px solid white;
                object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: 0.2s;
            }
            .color-dot.active { border-color: #000; transform: scale(1.1); }

            /* Tamanhos na Vertical (Direita) */
            .size-badge-vertical {
                position: absolute; right: 15px; top: 50%; transform: translateY(-50%);
                display: flex; flex-direction: column; gap: 5px; z-index: 60;
            }
            .size-item {
                background: rgba(255,255,255,0.9); width: 30px; height: 30px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 8px; font-size: 10px; font-weight: 900; color: #000;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }

            /* Footer Fixo */
            #provFooter { padding: 15px; background: white; z-index: 100; }
            .btn-checkout-provador {
                width: 100%; height: 65px; background: #000; color: #fff; border-radius: 20px;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 25px; font-weight: 800; text-transform: uppercase;
            }
        </style>

        <div class="overlay-controls">
            <div class="top-bar">
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
                <button id="btnCloseProvador">
                    <i data-lucide="x" class="text-black w-5 h-5"></i>
                </button>
            </div>
        </div>

        <div class="peças-container">
            <div id="deckTop" class="deck-scroll"></div>
            <div id="deckBot" class="deck-scroll"></div>
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
                const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                card.classList.toggle('active-piece', Math.abs(center - cardCenter) < 100);
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

    // --- LOGICA DE NOTIFICAÇÃO PROFISSIONAL ---
    const showSuccessNotification = () => {
        Swal.fire({
            title: 'Look no Carrinho!',
            text: 'O que deseja fazer agora?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonColor: '#000',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ir para o Carrinho',
            cancelButtonText: 'Continuar Comprando',
            heightAuto: false, // Importante para mobile
            scrollbarPadding: false
        }).then((result) => {
            if (result.isConfirmed) {
                container.style.display = 'none';
                document.body.style.overflow = '';
                window.openCartModal();
            } else {
                container.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    };

    // Eventos
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
        
        showSuccessNotification();
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
