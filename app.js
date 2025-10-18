const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos
app.use(express.static('public'));

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SIMULAR LOGIN BÁSICO (sin base de datos)
app.post('/api/login', (req, res) => {
    console.log('🔐 Intento de login recibido');
    res.json({ 
        success: true, 
        message: 'Login simulado - ¡Funciona en Render!',
        user: { 
            id: 1, 
            nombre: 'Usuario Demo', 
            email: 'demo@purificadora.com',
            tipo: 'admin' 
        }
    });
});

app.post('/api/register', (req, res) => {
    console.log('📝 Intento de registro recibido');
    res.json({ 
        success: true, 
        message: 'Registro simulado - ¡Funciona en Render!' 
    });
});

// Ruta para verificar sesión
app.get('/api/user', (req, res) => {
    res.json({
        id: 1,
        nombre: 'Usuario Demo',
        email: 'demo@purificadora.com', 
        tipo: 'admin'
    });
});

// Ruta para logout
app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Sesión cerrada' });
});

// Rutas básicas de páginas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/archivos.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'archivos.html'));
});

// Ruta de prueba
app.get('/api/test', (req, res) => {
    res.json({ message: '✅ ¡Servidor funcionando en Render!' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Servidor corriendo en puerto ' + PORT);
    console.log('🔐 Login simulado activado');
    console.log('📧 Email demo: demo@purificadora.com');
    console.log('🔑 Cualquier contraseña funcionará');
});