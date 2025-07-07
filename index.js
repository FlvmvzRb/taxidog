const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicializa a app principal (PetBoard)
admin.initializeApp();

// Configurações das agendas externas
const banhoConfig = {
    projectId: "banho-e6a59",
    // Não precisa da chave API aqui, a autenticação é via Conta de Serviço
};
const crecheConfig = {
    projectId: "creche-14172",
};

// Inicializa as apps externas com as credenciais da conta de serviço da função
const banhoApp = admin.initializeApp({ projectId: banhoConfig.projectId }, "banhoApp");
const crecheApp = admin.initializeApp({ projectId: crecheConfig.projectId }, "crecheApp");

exports.importAgendas = functions.https.onCall(async (data, context) => {
    // Verifica se o pedido vem de um utilizador autenticado no PetBoard
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um utilizador autenticado.');
    }

    const dateStr = data.date;
    if (!dateStr) {
        throw new functions.https.HttpsError('invalid-argument', 'A função deve ser chamada com uma data.');
    }

    const banhoDb = admin.firestore(banhoApp);
    const crecheDb = admin.firestore(crecheApp);
    let agendamentosImportados = [];

    try {
        // Função auxiliar para buscar dados de uma agenda
        const fetchFromAgenda = async (db) => {
            const querySnapshot = await db.collection("agendamentos")
                .where("data", "==", dateStr)
                .where("taxiDog", "==", true)
                .get();
            
            querySnapshot.forEach(doc => {
                const docData = doc.data();
                // Puxa o nome do pet e a rota definida no agendamento
                if (docData.petName && docData.defaultRoute) {
                    agendamentosImportados.push({ 
                        name: docData.petName, 
                        route: docData.defaultRoute
                    });
                }
            });
        };

        // Executa a busca para ambas as agendas
        await fetchFromAgenda(banhoDb);
        await fetchFromAgenda(crecheDb);

        // Remove duplicados (caso um mesmo pet tenha banho e creche no mesmo dia)
        const uniqueAgendamentos = Array.from(new Map(agendamentosImportados.map(item => [`${item.name}-${item.route}`, item])).values());

        return { agendamentos: uniqueAgendamentos };

    } catch (error) {
        console.error("Erro ao aceder às bases de dados externas:", error);
        throw new functions.https.HttpsError('internal', 'Não foi possível importar as agendas. Verifique as permissões e a estrutura dos dados.');
    }
});
