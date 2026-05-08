// js/theme-restaurante.js
export const RestauranteTheme = {
    // 1. Injeta a casca do iFood
    setup() {
        const tipoNegocio = window.state?.storeConfig?.tipoNegocio || 'varejo';
        if (tipoNegocio !== 'restaurante') return;

        // Esconde elementos de Varejo (Moda)
        const selectorsToHide = [
            '#magicSections', 
            '#categoryContainer', 
            'nav.fixed.bottom-0', // Menu inferior (Amei, Provador)
            '#promoBanner'
        ];
        selectorsToHide.forEach(s => {
            const el = document.querySelector(s);
            if (el) el.style.display = 'none';
        });

        // Ajusta o Container para Lista Única
        const container = document.getElementById('catalogContainer');
        if (container) {
            container.className = "flex flex-col w-full bg-white min-h-screen pb-32";
            container.style.padding = "0";
        }

        this.renderDeliveryHeader();
        this.renderFloatingCart();
    },

    // 2. Modal estilo Restaurante
    renderModal(p) {
        console.log("Abrindo modal de restaurante para:", p.name || p.nome);
        
        const modal = document.getElementById('modalDetails');
        if (!modal) return;

        // Referências dos elementos internos
        const nameEl = document.getElementById('detailName');
        const priceEl = document.getElementById('detailPrice');
        const descEl = document.getElementById('detailDesc');
        const imgEl = document.getElementById('detailImg');

        // Mapeamento de dados (suporta 'nome' ou 'name', 'preco' ou 'price')
        const nome = p.name || p.nome || 'Produto';
        const preco = p.price || p.preco || 0;
        const descricao = p.description || p.descricao || '';
        const imagem = (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || 'https://placehold.co/400?text=Sem+Foto');

        if (nameEl) nameEl.innerText = nome;
        if (priceEl) priceEl.innerText = `R$ ${parseFloat(preco).toFixed(2).replace('.', ',')}`;
        if (descEl) descEl.innerText = descricao;
        if (imgEl) imgEl.src = imagem;

        // Abre o modal e trava o scroll
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },
    
    // 3. Header estilo iFood com Busca
    renderDeliveryHeader() {
        if (document.getElementById('deliveryHeader')) return;
        const app = document.getElementById('app');
        const header = document.createElement('div');
        header.id = 'deliveryHeader';
        header.className = "sticky top-0 z-[100] bg-white border-b border-gray-100 p-4 shadow-sm";
        header.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <img src="${window.state.storeConfig.logo}" class="w-12 h-12 rounded-full border shadow-sm">
                <div>
                    <h1 class="font-bold text-gray-800 text-lg">${window.state.storeConfig.name}</h1>
                    <div class="flex items-center gap-1 text-[10px] font-bold text-green-600">
                        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Aberto agora
                    </div>
                </div>
            </div>
            <div class="relative">
                <input type="text" id="deliverySearch" placeholder="Buscar itens no cardápio..." 
                       class="w-full bg-gray-100 border-none rounded-xl py-3 px-10 text-sm focus:ring-2 focus:ring-red-500">
                <i data-lucide="search" class="absolute left-3 top-3.5 w-4 h-4 text-gray-400"></i>
            </div>
        `;
        app.prepend(header);
        if(window.lucide) window.lucide.createIcons();
    },

    // 4. Card Horizontal (Informação na esquerda, foto na direita)
    renderCard(p) {
        const precoNumerico = p.price || p.preco || 0;
        const precoFormatado = precoNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const img = (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || 'https://placehold.co/200?text=Sem+Foto');
        
        // Importante: Passamos o p.id para o window.openProductModal
        return `
            <div onclick="window.openProductModal('${p.id}')" class="flex items-center p-4 border-b border-gray-100 bg-white active:bg-gray-50 transition-all cursor-pointer">
                <div class="flex-1 pr-3">
                    <h3 class="font-bold text-gray-800 text-[15px] leading-tight mb-1">${p.name || p.nome}</h3>
                    <p class="text-[12px] text-gray-500 line-clamp-2 mb-2 leading-relaxed">${p.description || p.descricao || 'Prato preparado com ingredientes selecionados.'}</p>
                    <div class="flex items-center gap-2">
                        <span class="text-green-600 font-bold text-sm">${precoFormatado}</span>
                        ${p.promoValue ? `<span class="text-[10px] text-gray-400 line-through">R$ ${p.promoValue}</span>` : ''}
                    </div>
                </div>
                <div class="w-20 h-20 flex-shrink-0">
                    <img src="${img}" class="w-full h-full object-cover rounded-lg shadow-sm" loading="lazy">
                </div>
            </div>
        `;
    },

    // 5. Barra de Sacola Flutuante (Botão Vermelho)
    renderFloatingCart() {
        let btn = document.getElementById('deliveryCartBar');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'deliveryCartBar';
            btn.className = "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-[1000] animate-slide-up";
            document.body.appendChild(btn);
        }

        const count = window.state.cart.reduce((acc, i) => acc + i.qty, 0);
        const total = window.state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);

        if (count > 0) {
            btn.innerHTML = `
                <button onclick="window.openCart()" class="w-full bg-[#EA1D2C] text-white flex items-center justify-between p-4 rounded-xl font-bold shadow-lg">
                    <div class="flex items-center gap-2">
                        <span class="bg-black/20 px-2 py-0.5 rounded text-xs">${count}</span>
                        <span>Ver sacola</span>
                    </div>
                    <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
                </button>
            `;
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    }
};
