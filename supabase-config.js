// ===================================
// SUPABASE CONFIGURATION
// ===================================
// IMPORTANTE: Reemplaza estos valores con los de tu proyecto Supabase
// Instrucciones en: supabase_setup_guide.md

const SUPABASE_URL = 'TU_SUPABASE_URL_AQUI';
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY_AQUI';

// Inicializar Supabase Client
let supabase;

try {
    if (typeof supabase === 'undefined' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado correctamente');
    } else {
        console.error('❌ Supabase library no está cargada');
    }
} catch (error) {
    console.error('❌ Error inicializando Supabase:', error);
    alert('Error de configuración de Supabase. Por favor verifica las credenciales en supabase-config.js');
}
