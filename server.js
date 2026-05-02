// 1. CARREGA AS VARIÁVEIS (Sempre a primeira linha)
require('dotenv').config(); 

const express = require("express");
const path = require("path");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de CORS para permitir que seu frontend acesse a API
app.use(cors());
app.use(express.json());

// 2. INICIALIZAÇÃO BLINDADA DO FIREBASE (CORREÇÃO DO ERRO DE DECODER)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // A correção real está aqui: tratando as quebras de linha da chave privada
                privateKey: process.env.FIREBASE_PRIVATE_KEY 
                    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
                    : undefined,
            })
        });
        console.log("✅ Firebase Admin inicializado com sucesso.");
    } catch (error) {
        console.error("❌ Erro ao inicializar Firebase Admin:", error);
    }
}

const db = admin.firestore();

// 3. CONFIGURAÇÃO DE ARQUIVOS ESTÁTICOS
// Isso garante que o CSS, JS e Imagens da pasta public sejam entregues
app.use(express.static(path.join(__dirname, "public")));

// 4. ROTAS DA API
// Importa suas rotas de vitrine (garanta que o arquivo esteja em ./routes/vitrine.js)
const vitrineRoutes = require("./routes/vitrine")(db, admin);
app.use("/api/produtos", vitrineRoutes);

// 5. ROTAS DE PÁGINA (DIRECIONAMENTO PARA O CLIENTE)
app.get("/", (req, res) => {
    res.redirect("/cliente");
});

app.get("/cliente", (req, res) => {
    // Busca o index.html dentro de public/cliente/
    res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

// 6. TRATAMENTO DE ERRO 404 PARA ROTAS NÃO ENCONTRADAS
app.use((req, res) => {
    res.status(404).send("Página não encontrada");
});

// 7. START DO SERVIDOR
app.listen(PORT, () => {
    console.log(`
================================================
🚀 SERVIDOR RODANDO NA PORTA: ${PORT}
📱 TESTE LOCAL: http://localhost:${PORT}
================================================
    `);
});

// Exporta para a Vercel
module.exports = app;
