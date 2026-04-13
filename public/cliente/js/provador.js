/* =========================================================================
   PROVADOR VIRTUAL - VERSÃO FINAL (js/provador.js)
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
                position: fixed; inset: 0; background: #fff; z-index: 999999 !important;
                display: flex; flex-direction: column; font-family: 'Inter', sans-serif;
            }
            
            /* GARANTE QUE A NOTIFICAÇÃO APAREÇA POR CIMA DE TUDO */
            .swal2-container { z-index: 10000000 !important; }

            .p-header { 
                padding: 10px 15px; display: flex; gap: 8px; align-items: center; 
                background: #fff; z-index: 10;
            }
            .p-filters { display: flex; gap: 5px; flex: 1; }
            .p-filters select {
                flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
                padding: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase;
            }
            .p-btn-close {
                width: 38px; height: 38px; background: #000; color: #fff;
                border-radius: 8px; display: flex; align-items: center; justify-content: center;
            }
            .p-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

            .p-deck {
                flex: 1; position: relative; display: flex; overflow-x: auto;
                scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            .p-deck::-webkit-scrollbar { display: none; }

            .p-card {
                min-width: 100vw; height: 100%; position: relative;
                display: flex; align-items: center; justify-content: center;
                padding: 0 55px; scroll-snap-align: center;
            }
            .p-img-box {
                width: 100%; aspect-ratio: 1/1; position: relative;
                border-radius: 4px; overflow: hidden; background: #f1f5f9;
            }
            .p-img-box img { width: 100%; height: 100%; object-fit: cover; }
            
            .p-individual-price {
                position: absolute; bottom: 8px; right: 8px;
                background: rgba(0,0,0,0.7); color: #fff; padding: 4px 8px;
                border-radius: 6px; font-size: 10px; font-weight: 700; backdrop-filter: blur(4px);
            }
            
            .p-side-left { position: absolute; left: 8px; top: 0; bottom: 0; width: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 5; }
            .p-side-right { position: absolute; right: 8px; top: 0; bottom: 0; width: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; z-index: 5; }
            
            .p-thumb { width: 38px; height: 38px; border-radius: 8px; border: 2px solid #eee; object-fit: cover; }
            .p-thumb.active { border-color: #000; transform: scale(1.1); }
            .p-size { width: 32px; height: 32px; border-radius: 6px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; border: 1px solid #e2e8f0; }
            
            .p-footer { padding: 15px; background: #fff; border-top: 1px solid #f1f5f9; z-index: 10; }
            .p-btn-action {
                width: 100%; height: 60px; background: #000; color: #fff; border-radius: 16px;
                display: flex; align-items: center; justify-content: space-between;
                padding: 0 20px; font-weight: 800; text-transform: uppercase;
            }
        </style>

        <div class="p-header">
            <div class="p-filters">
                <select id="selCatTop">
                    <option value="Todas">Top: Todas</option>
                    ${catTops.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="selCatBot">
                    <option value="Todas">Bottom: Todas</option>
                    ${catBots.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <button class="p-btn-close" onclick="window.closeProvador()"><i data-lucide="x"></i></button>
        </div>

        <div class="p-main">
            <div id="deckTop" class="p-deck"></div>
            <div id="deckBot" class="p-deck"></div>
        </div>

        <div class="p-footer">
            <button id="btnConfirmLook" class="p-btn-action">
                <div class="flex flex-col items-start">
                    <span class="text-[9px] opacity-50">Adicionar Look Completo</span>
                    <span id="pTotal" class="text-lg leading-none">R$ 0,00</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs">ADICIONAR</span>
                    <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                </div>
            </button>
        </div>
    `;

    window.closeProvador = () => {
        container.style.display = 'none';
        document.body.style.overflow = '';
    };

    window.changePThumb = (el, newImg) => {
        const card = el.closest('.p-card');
        card.querySelector('.main-img').src = newImg;
        card.dataset.img = newImg;
        card.querySelectorAll('.p-thumb').forEach(t => t.classList.remove('active'));
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
                <div class="p-card" data-id="${p.id}" data-price="${p.value}" data-img="${p.images[0]}">
                    <div class="p-side-left">
                        ${gallery.slice(0, 5).map(img => `<img src="${img}" class="p-thumb ${img === p.images[0] ? 'active' : ''}" onclick="window.changePThumb(this, '${img}')">`).join('')}
                    </div>
                    <div class="p-side-right">
                        ${(p.sizes || []).map(s => `<div class="p-size">${s}</div>`).join('')}
                    </div>
                    <div class="p-img-box">
                        <img src="${p.images[0]}" class="main-img">
                        <div class="p-individual-price">R$ ${Number(p.value).toFixed(2).replace('.', ',')}</div>
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
        setTimeout(() => el.dispatchEvent(new Event('scroll')), 200);
    };

    const updateUI = () => {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        const total = (Number(t?.dataset.price || 0) + Number(b?.dataset.price || 0));
        document.getElementById('pTotal').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
    };

    container.querySelector('#btnConfirmLook').onclick = function() {
        const t = document.querySelector('#deckTop .active-piece');
        const b = document.querySelector('#deckBot .active-piece');
        
        if (!t && !b) return;

        if(t) window.addToCart(window.state.allProducts.find(x => x.id == t.dataset.id), 1, { image: t.dataset.img });
        if(b) window.addToCart(window.state.allProducts.find(x => x.id == b.dataset.id), 1, { image: b.dataset.img });

        Swal.fire({
            title: 'Look Adicionado!',
            text: 'Deseja ir para o carrinho?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonColor: '#000',
            confirmButtonText: 'Ver Carrinho',
            cancelButtonText: 'Continuar',
            heightAuto: false
        }).then((result) => {
            if (result.isConfirmed) {
                window.closeProvador();
                window.openCartModal();
            }
        });
    };

    container.querySelector('#selCatTop').onchange = (e) => { filterCatTop = e.target.value; render(); };
    container.querySelector('#selCatBot').onchange = (e) => { filterCatBot = e.target.value; render(); };

    if (window.lucide) lucide.createIcons();
    container.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
};
