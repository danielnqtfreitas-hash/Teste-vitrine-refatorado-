window.RestauranteTheme = {
    renderCard: function(p) {
        const preco = p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const desc = p.description || '';
        
        return `
            <div onclick="window.openProductModal('${p.id}')" class="flex items-center p-4 bg-white border-b border-gray-100 active:bg-gray-50 transition-all w-full cursor-pointer">
                <div class="flex-1 pr-3">
                    <h3 class="font-bold text-gray-800 text-sm leading-tight mb-1">${p.name}</h3>
                    <p class="text-[11px] text-gray-500 line-clamp-2 mb-2 font-medium">${desc}</p>
                    <span class="text-green-600 font-bold text-sm">${preco}</span>
                </div>
                ${p.images && p.images[0] ? `
                    <div class="w-20 h-20 flex-shrink-0">
                        <img src="${p.images[0]}" class="w-full h-full object-cover rounded-xl shadow-sm">
                    </div>
                ` : ''}
            </div>
        `;
    },
    
    renderComplements: function(p) {
        if (!p.complements || p.complements.length === 0) return '';
        // Lógica de renderização de subgrupos que enviamos anteriormente...
        return p.complements.map(group => `
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-100 my-3">
                <h4 class="font-bold text-xs text-gray-700 uppercase">${group.name}</h4>
                <div class="mt-2 space-y-2">
                    ${group.items.map(item => `
                        <label class="flex justify-between text-sm bg-white p-2 rounded border border-gray-100">
                            <span>${item.name}</span>
                            <input type="checkbox" class="accent-purple-600">
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
};
