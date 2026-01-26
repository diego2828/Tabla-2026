// ===================================
// SUPABASE CONFIGURATION
// ===================================

const SUPABASE_URL = 'https://ijbzetgsoehpbunulmrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqYnpldGdzb2VocGJ1bnVsbXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDY5NDEsImV4cCI6MjA4NDg4Mjk0MX0.Tt-Ji5vUnYS2D7rm-DgOJbIKCAyXegSQv8JCK6Rhv6U';

// Inicializar Supabase Client
let supabaseClient = null;

try {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado correctamente');
    } else {
        console.error('❌ Supabase library no está cargada');
    }
} catch (error) {
    console.error('❌ Error inicializando Supabase:', error);
}

// Exportar para uso global
window.supabase = supabaseClient;
