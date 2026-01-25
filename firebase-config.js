// ===================================
// FIREBASE CONFIGURATION
// ===================================
// IMPORTANTE: Reemplaza estos valores con los de tu proyecto Firebase
// Instrucciones en: implementation_plan.md

const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase
let app, auth, db;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('✅ Firebase inicializado correctamente');
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    alert('Error de configuración de Firebase. Por favor verifica las credenciales en firebase-config.js');
}
