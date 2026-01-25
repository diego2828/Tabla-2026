// ===================================
// SUPABASE CONFIGURATION
// ===================================
// IMPORTANTE: Reemplaza estos valores con los de tu proyecto Supabase
// Instrucciones en: supabase_setup_guide.md

const SUPABASE_URL = 'https://ijbzetgsoehpbunulmrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqYnpldGdzb2VocGJ1bnVsbXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMDY5NDEsImV4cCI6MjA4NDg4Mjk0MX0.Tt-Ji5vUnYS2D7rm-DgOJbIKCAyXegSQv8JCK6Rhv6U';

// Inicializar Supabase Client
let supabase = null;

// Check if credentials are configured (NOT placeholders)
const isSupabaseConfigured =
    SUPABASE_URL !== 'TU_SUPABASE_URL_AQUI' &&
    SUPABASE_ANON_KEY !== 'TU_SUPABASE_ANON_KEY_AQUI';

try {
    if (isSupabaseConfigured) {
        if (typeof window.supabase !== 'undefined') {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase inicializado correctamente');
        } else {
            console.error('❌ Supabase library no está cargada');
        }
    } else {
        console.warn('⚠️ Supabase no configurado - usando localStorage como fallback');
        console.log('👉 Para habilitar multi-usuario, configura Supabase siguiendo la guía');
    }
} catch (error) {
    console.error('❌ Error inicializando Supabase:', error);
}
