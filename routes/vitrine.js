const express = require('express');
const router = express.Router();

module.exports = (db, admin) => {

    // --- ROTA DA VITRINE (ESTRUTURA COMPLETA) ---
    router.get('/:lojaId', async (req, res) => {
        const lojaId = req.params.lojaId;

        try {
            // 1. Busca Configurações da Loja
            const configDoc = await db.collection('stores').doc(lojaId).collection('config').doc('store').get();
            if (!configDoc.exists) return res.status(404).json({ erro: "Loja não encontrada" });

            const configData = configDoc.data();

            // 2. Busca Banners e Produtos em Paralelo (Performance)
            const [heroSnap, prodSnap] = await Promise.all([
                db.collection('stores').doc(lojaId).collection('hero_cards').get(),
                db.collection('stores').doc(lojaId).collection('products').where('status', '==', 'active').get()
            ]);

            const banners = heroSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const produtos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const pacoteCompleto = {
                config: configData,
                banners: banners,
                produtos: produtos,
                lastSync: new Date().toISOString(),
                server: "Vercel Cloud"
            };

            // 3. Cache Inteligente (Substitui o JSON local - Economiza Firebase)
            res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
            
            return res.json(pacoteCompleto);

        } catch (error) {
            console.error("❌ Erro na rota da vitrine:", error);
            res.status(500).json({ erro: "Erro interno no servidor" });
        }
    });

    // --- ROTA DE ANALYTICS (VISITAS - MANTIDA INTEGRALMENTE) ---
    router.post('/:lojaId/visit', async (req, res) => {
        const lojaId = req.params.lojaId;
        const hojeId = new Date().toLocaleDateString('en-CA'); 
        const horaAtual = new Date().getHours();

        try {
            const batch = db.batch();
            const historyRef = db.collection('stores').doc(lojaId).collection('analytics_history').doc(hojeId);
            const globalRef = db.collection('stores').doc(lojaId).collection('analytics').doc('global');

            batch.set(historyRef, { 
                visits: admin.firestore.FieldValue.increment(1), 
                [horaAtual]: admin.firestore.FieldValue.increment(1), 
                date: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            batch.set(globalRef, { 
                totalVisits: admin.firestore.FieldValue.increment(1), 
                [`visits_${horaAtual}`]: admin.firestore.FieldValue.increment(1), 
                lastUpdate: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            await batch.commit();
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error("❌ Erro Analytics:", error);
            res.status(500).json({ erro: "Erro interno" });
        }
    });

    // --- ROTA DE MÉTRICAS (PRODUTOS - MANTIDA INTEGRALMENTE) ---
    router.post('/metricas', async (req, res) => {
        try {
            const { lojaId, produtoId, acao } = req.body;
            if (!lojaId || !produtoId) return res.status(400).json({ error: "Dados incompletos" });

            const batch = db.batch();

            if (acao === 'fav' || acao === 'cart') {
                const globalRef = db.collection('stores').doc(lojaId).collection('analytics').doc('global');
                const campoDinamico = `stats.${produtoId}.${acao === 'fav' ? 'favs' : 'adds'}`;
                batch.set(globalRef, {
                    [campoDinamico]: admin.firestore.FieldValue.increment(1),
                    "totalInteracoes": admin.firestore.FieldValue.increment(1)
                }, { merge: true });
            }

            if (acao === 'view') {
                const viewsRef = db.collection('stores').doc(lojaId).collection('analytics').doc('product_views');
                batch.set(viewsRef, {
                    stats: { [produtoId]: { views: admin.firestore.FieldValue.increment(1) } }
                }, { merge: true });
            }

            await batch.commit();
            res.status(200).json({ success: true });
        } catch (error) {
            console.error("❌ Erro Métricas:", error); 
            res.status(500).json({ error: "Erro interno" });
        }
    });

    return router; 
};
