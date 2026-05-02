// 1. CARREGA AS VARIÁVEIS
require('dotenv').config(); 

const express = require("express");
const path = require("path");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 2. INICIALIZAÇÃO DO FIREBASE (CORREÇÃO CIRÚRGICA DO ERRO DE DECODER)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // O SEGREDO ESTÁ AQUI: O .replace resolve o erro de DECODER routines::unsupported
                privateKey: process.env.FIREBASE_PRIVATE_KEY 
                    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
                    : undefined,
            })
        });
        console.log("✅ Firebase Admin conectado com sucesso.");
    } catch (error) {
        console.error("❌ Erro fatal na conexão Firebase:", error);
    }
}

const db = admin.firestore();

// 3. CONFIGURAÇÃO DE ARQUIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, "public")));

// 4. ROTAS DA API
const vitrineRoutes = require("./routes/vitrine")(db, admin);
app.use("/api/produtos", vitrineRoutes);

// 5. ROTAS DE PÁGINA
app.get("/", (req, res) => {
    res.redirect("/cliente");
});

app.get("/cliente", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

// 6. START DO SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 Servidor pronto na porta ${PORT}`);
});

// Exporta para a Vercel funcionar
module.exports = app;
