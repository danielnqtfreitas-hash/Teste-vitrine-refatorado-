/* =========================================================================
   PROVADOR VIRTUAL ULTIMATE - FOCO IMERSIVO 1:1 (Mobile First)
   ========================================================================= */

window.openProvador = function() {
    let container = document.getElementById('provadorFullscreen');
    if (!container) {
        container = document.createElement('div');
        container.id = 'provadorFullscreen';
        document.body.appendChild(container);
    }

    // Coleta categorias reais do estado global
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
            
            /* Header Flutuante para não ocupar espaço das fotos */
            .prov-header {
                position: absolute; top: 0; left: 0; right: 0; z-index: 100;
                padding: 12px; display: flex; gap: 8px; align-items: center;
                background: linear-gradient(to bottom, rgba(255,255,255,0.9), transparent);
            }
            .prov-filters { display: flex; gap: 6px; flex: 1; }
            .prov-filters select {
                flex: 1; background: #fff; border: 1px solid #eee; border-radius: 10px;
                padding: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase;
                outline: none; box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            }
            .btn-close-p {
                width: 38px; height: 38px; background: #000; color: #fff;
                border-radius: 10px; display: flex; align-items: center; justify-content: center;
            }

            /* Container de Peças 1:1 */
            .peças-container {
                flex: 1; display: flex; flex-direction: column; 
                justify-content: center; align-items: center; background: #fff;
            }

            .deck-wrapper {
                width: 100%; flex: 1; position: relative;
                display: flex; overflow: hidden;
            }

            .deck-scroll {
                flex: 1; display: flex; overflow-x: auto; 
                snap-type: x mandatory; scrollbar-width: none;
            }
            .deck-scroll::-webkit-scrollbar { display: none; }

            /* Card 1:1 com calhas laterais para controles */
            .p-card { 
                min-width: 100vw; height: 100%; position: relative;
                display: flex; align-items: center; justify-content: center;
                padding: 0 60px; /* Calhas brancas para variações e tamanhos */
            }
            .img-box {
                width: 100%; aspect-ratio: 1/1; position: relative;
                box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 4px; overflow: hidden;
            }
            .img-box img { width: 100%; height: 100%; object-fit: cover; }

            /* Calhas Laterais Fixas por Peça */
            .side-left {
                position: absolute; left: 5px; top: 0; bottom: 0; width: 50px;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
            }
            .side-right {
                position: absolute; right: 5px; top: 0; bottom: 0; width: 50px;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
            }

            .thumb-variant {
                width: 42px; height: 42px; border-radius: 8px; border: 2px solid #f1f5f9;
                object-fit: cover; transition: 0.2s;
            }
            .thumb-variant.active { border-color: #000; transform: scale(1.1); }

            .size-tag {
                width: 34px; height: 34px; border-radius: 8px; background: #f8fafc;
                border: 1px solid #eee; display: flex; align-items: center; justify-content: center;
                font-size: 11px; font-weight: 800; color: #334155;
            }

            /* Rodapé com Preço e Ação */
            .prov-footer { padding: 16px; background: #fff; border-top: 1px solid #f1f5f9; }
            .btn-add-look {
                width: 100%; height: 60px; background: #000; color: #fff; border-radius: 16px;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 20px; font-weight: 800; text-transform: uppercase;
                transition: transform 0.1s active;
            }
        </style>

        <div class="prov-header">
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
            <button class="btn-close-p" onclick="window.closeProvador()"><i data-lucide="x"></i></button>
        </div>

        <div class="peças-container">
            <div id="deckTop" class="deck-scroll"></div>
            <div id="deckBot" class="deck-scroll"></div>
        </div>

        <div class="prov-footer">
            <button id="btnConfirmLook" class="btn-add-look">
                <div class="flex flex-col items-start">
                    <span class="text-[9px] opacity-50 font-medium">Adicionar Look Completo</span>
                    <span id="pTotal" class="text-lg leading-none">R$ 0,00</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs">ADICIONAR</span>
                    <i data-lucide="shopping-cart" class="w-5 h-5"></i>
                </div>
            </button>
        </div>
    `;

    // --- LÓGICA DE INTERAÇÃO ---

    window.closeProvador = () => {
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    window.changePThumb = (el, newImg) => {
        const card = el.closest('.p-card');
        card.querySelector('.main-img').src = newImg;
        card.dataset.img = newImg;
        card.querySelectorAll('.thumb-variant').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        updateUI();
    };

    const render = () => {
        const tops = window.state.allProducts.filter(p => p.posicaoProvador === 'superior' && (filterCatTop === 'Todas' || p.category === filterCatTop));
        const bots = window.state.allProducts.filter(p => p.posicaoProvador === 'inferior' && (filterCatBot === 'Todas' || p.category === filterCatBot));

        const makeHtml = (list) => list.map(p => {
            let gallery = [p.images[0], ...(p.variations || []).map(v => v.image)].filter(Boolean);
            gallery = [...new Set(gallery)];

            return `
                <div class="p-card snap-center" data-id="${p.id}" data-price="${p.value}" data-img="${p.images[0]}">
                    <div class="side-left">
                        ${gallery.slice(0, 5).map(img => `
                            <img src="${img}" class="thumb-variant ${img === p.images[0] ? 'active' : ''}" 
                                 onclick="window.changePThumb(this, '${img}')">
                        `).join('')}
                    </div>
                    <div class="side-right">
                        ${(p.sizes || []).map(s => `<div class="size-tag">${s}</div>`).join('')}
                    </div>
                    <div class="img-box">
                        <img src="${p.images[0]}" class="main-img">
                    </div>
                </div>`;
        }).join('');

        document.getElementById('deckTop').innerHTML = makeHtml(tops) || '<div class="p-card">Nenhum Top</div>';
        document.getElementById('deckBot').innerHTML = makeHtml(bots) || '<div class="p-card">Nenhum Bottom</div>';
        
        setupScroll('deckTop');
        setupScroll('deckBot');
    };

    const setupScroll = (id) => {
        const el = document.getElementById(id);
        el.onscroll = () => {
            const center = el.scrollLeft + el.offsetWidth / 2;
            el.querySelectorAll('.p-card').forEach(card => {
                const c = card.offsetLeft + card.offsetWidth / 2;
                card.classList.toggle('active-piece', Math.abs(center - c) < 100);
            });
            updateUI();
        };
        // Trigger inicial
        setTimeout(() => el.dispatchEvent(new Event('scroll')), 200);
    };

    const updateUI = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        const total = (Number(t?.dataset.price || 0) + Number(b?.dataset.price || 0));
        document.getElementById('pTotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    };

    // Ação única e direta
    container.querySelector('#btnConfirmLook').onclick = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        
        if (!t && !b) return;

        // Adição mecânica ao carrinho
        if(t) window.addToCart(window.state.allProducts.find(x => x.id == t.dataset.id), 1, { image: t.dataset.img });
        if(b) window.addToCart(window.state.allProducts.find(x => x.id == b.dataset.id), 1, { image: b.dataset.img });

        // Notificação imediata
        Swal.fire({
            title: 'Look Adicionado!',
            text: 'Deseja finalizar o pedido agora?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonColor: '#000',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Ver Carrinho',
            cancelButtonText: 'Continuar',
            heightAuto: false
        }).then((result) => {
            window.closeProvador();
            if (result.isConfirmed) window.openCartModal();
        });
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
