const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');

// Configuración de base de datos
const { connection, createDatabase, createTables, insertMasterUser } = require('./config/database'); 

const app = express();
const PORT = 3000;

// ✅ MIDDLEWARE CORS
app.use(cors());

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ VERIFICAR Y CREAR CARPETA UPLOADS
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Carpeta uploads creada exitosamente');
}

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// **Servir archivos estáticos**
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Configurar sesiones
app.use(session({
    secret: 'purificadora-pnc-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// ✅ MIDDLEWARE DE LOGGING
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ✅ INICIALIZACIÓN DE BASE DE DATOS
const initializeDatabase = async () => {
    try {
        console.log('🔧 Inicializando base de datos...');
        await createDatabase();
        console.log('✅ Base de datos verificada/creada');
        
        await createTables();
        console.log('✅ Tablas verificadas/creadas');
        
        await insertMasterUser();
        console.log('✅ Usuario maestro verificado/creado');
        console.log('🎉 Base de datos inicializada correctamente');
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error.message);
    }
};

// Inicializar base de datos
initializeDatabase();

// Definimos la carpeta 'public'
const PUBLIC_DIR = path.join(process.cwd(), 'public'); 

// 1. Ruta principal: Muestra home.html 
app.get('/', (req, res) => {
    res.sendFile('home.html', { root: PUBLIC_DIR }); 
});

// 2. Rutas de interfaces (login, register)
app.get('/login.html', (req, res) => {
    res.sendFile('login.html', { root: PUBLIC_DIR }); 
});

app.get('/register.html', (req, res) => {
    res.sendFile('register.html', { root: PUBLIC_DIR }); 
});

// 3. Ruta del dashboard: Protegida por sesión
app.get('/dashboard.html', (req, res) => {
    if (req.session.userId) {
        res.sendFile('dashboard.html', { root: PUBLIC_DIR });
    } else {
        res.redirect('/login.html');
    }

});
// ✅ NUEVA RUTA AGREGADA
app.get('/archivos.html', (req, res) => {
    if (req.session.userId) {
        res.sendFile('archivos.html', { root: PUBLIC_DIR });
    } else {
        res.redirect('/login.html');
    }
});

// ------------------------------------------------------------------
// MIDDLEWARES DE AUTENTICACIÓN
// ------------------------------------------------------------------

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
};

// Middleware para verificar si es admin o maestro
const isAdminOrMaster = (req, res, next) => {
    if (req.session.userType === 'admin' || req.session.userType === 'maestro') {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado: Se requiere rol admin o maestro' });
    }
};

// Middleware para verificar si es maestro
const isMaster = (req, res, next) => {
    if (req.session.userType === 'maestro') {
        next();
    } else {
        res.status(403).json({ error: 'Solo el usuario maestro puede acceder' });
    }
};

// ------------------------------------------------------------------
// RUTAS API (LOGIN/REGISTER/ARCHIVOS)
// ------------------------------------------------------------------

// Ruta de registro
app.post('/api/register', async (req, res) => {
    const { nombre, email, password, codigoAdmin } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        connection.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('❌ Error en registro:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }

            if (results.length === 0) {
                // Determinar tipo de usuario
                let tipo = 'invitado';
                if (codigoAdmin === '0509') { 
                    tipo = 'admin';
                }

                // Hashear contraseña
                const hashedPassword = await bcrypt.hash(password, 10);

                // Insertar usuario
                const query = 'INSERT INTO usuarios (nombre, email, password, tipo) VALUES (?, ?, ?, ?)';
                connection.query(query, [nombre, email, hashedPassword, tipo], (err, result) => {
                    if (err) {
                        console.error('❌ Error registrando usuario:', err);
                        return res.status(500).json({ error: 'Error al registrar usuario' });
                    }

                    res.json({ 
                        success: true, 
                        message: 'Usuario registrado exitosamente',
                        tipo: tipo
                    });
                });
            } else {
                return res.status(400).json({ error: 'El email ya está registrado' });
            }
        });
    } catch (error) {
        console.error('❌ Error en registro:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// Ruta de login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    console.log('🔐 Intento de login:', { email });

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    connection.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('❌ Error en login:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const user = results[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Crear sesión
        req.session.userId = user.id;
        req.session.userName = user.nombre;
        req.session.userType = user.tipo;

        console.log('✅ Sesión creada:', { 
            userId: req.session.userId, 
            userName: req.session.userName, 
            userType: req.session.userType 
        });

        res.json({
            success: true,
            message: 'Login exitoso',
            user: {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                tipo: user.tipo
            }
        });
    });
});

// Ruta de logout
app.post('/api/logout', (req, res) => {
    console.log('🚪 Logout usuario:', req.session.userId);
    req.session.destroy();
    res.json({ success: true, message: 'Sesión cerrada' });
});

// Obtener información del usuario actual
app.get('/api/user', isAuthenticated, (req, res) => {
    connection.query('SELECT id, nombre, email, tipo FROM usuarios WHERE id = ?', [req.session.userId], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo usuario:', err);
            return res.status(500).json({ error: 'Error al obtener usuario' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json(results[0]);
    });
});

// Subir archivo (solo admin y maestro)
app.post('/api/upload', isAuthenticated, isAdminOrMaster, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    console.log('📁 Subiendo archivo:', { 
        originalName: req.file.originalname,
        userId: req.session.userId 
    });

    const query = 'INSERT INTO archivos (nombre_original, nombre_archivo, ruta, tipo_archivo, tamano, subido_por) VALUES (?, ?, ?, ?, ?, ?)';
    const values = [
        req.file.originalname,
        req.file.filename,
        req.file.path,
        req.file.mimetype,
        req.file.size,
        req.session.userId
    ];

    connection.query(query, values, (err, result) => {
        if (err) {
            console.error('❌ Error subiendo archivo:', err);
            return res.status(500).json({ error: 'Error al guardar archivo en la base de datos' });
        }

        res.json({
            success: true,
            message: 'Archivo subido exitosamente',
            file: {
                id: result.insertId,
                nombre: req.file.originalname
            }
        });
    });
});

// Listar archivos
app.get('/api/files', isAuthenticated, (req, res) => {
    const query = `
        SELECT a.*, u.nombre as subido_por_nombre 
        FROM archivos a 
        LEFT JOIN usuarios u ON a.subido_por = u.id 
        ORDER BY a.fecha_subida DESC
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo archivos:', err);
            return res.status(500).json({ error: 'Error al obtener archivos' });
        }
        
        res.json(results || []);
    });
});

// Eliminar archivo (solo admin y maestro)
app.delete('/api/files/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const fileId = req.params.id;
    console.log('🗑️ Eliminando archivo:', { fileId, userId: req.session.userId });

    // Primero obtener la ruta del archivo
    connection.query('SELECT * FROM archivos WHERE id = ?', [fileId], (err, results) => {
        if (err) {
            console.error('❌ Error buscando archivo:', err);
            return res.status(500).json({ error: 'Error al buscar archivo' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        const file = results[0];

        // Eliminar archivo físico
        fs.unlink(file.ruta, (err) => {
            if (err) {
                console.error('⚠️ Error eliminando archivo físico:', err);
            }

            // Eliminar registro de la base de datos
            connection.query('DELETE FROM archivos WHERE id = ?', [fileId], (err) => {
                if (err) {
                    console.error('❌ Error eliminando archivo:', err);
                    return res.status(500).json({ error: 'Error al eliminar archivo de la base de datos' });
                }

                console.log('✅ Archivo eliminado:', fileId);
                res.json({ success: true, message: 'Archivo eliminado exitosamente' });
            });
        });
    });
});

// Listar usuarios (solo maestro)
app.get('/api/users', isAuthenticated, isMaster, (req, res) => {
    connection.query('SELECT id, nombre, email, tipo, fecha_registro FROM usuarios ORDER BY fecha_registro DESC', (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo usuarios:', err);
            return res.status(500).json({ error: 'Error al obtener usuarios' });
        }
        res.json(results);
    });
});

// Eliminar usuario (solo maestro)
app.delete('/api/users/:id', isAuthenticated, isMaster, (req, res) => {
    const userIdToDelete = parseInt(req.params.id); 
    const loggedInUserId = req.session.userId;

    console.log('🗑️ Eliminando usuario:', { userIdToDelete, loggedInUserId });

    // 1. Verificar auto-eliminación
    if (userIdToDelete === loggedInUserId) {
        return res.status(403).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    // 2. Verificar que el usuario existe y no es maestro
    connection.query('SELECT tipo FROM usuarios WHERE id = ?', [userIdToDelete], (err, results) => {
        if (err) {
            console.error('❌ Error verificando usuario:', err);
            return res.status(500).json({ error: 'Error al verificar usuario' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (results[0].tipo === 'maestro') {
            return res.status(403).json({ error: 'No se puede eliminar otro usuario maestro' });
        }

        // 3. Primero eliminar archivos asociados
        connection.query('SELECT id, ruta FROM archivos WHERE subido_por = ?', [userIdToDelete], (err, archivos) => {
            if (err) {
                console.error('❌ Error obteniendo archivos:', err);
                return res.status(500).json({ error: 'Error obteniendo archivos del usuario' });
            }

            // Eliminar archivos físicos
            archivos.forEach(archivo => {
                if (fs.existsSync(archivo.ruta)) {
                    fs.unlink(archivo.ruta, (err) => {
                        if (err) console.error('⚠️ Error eliminando archivo físico:', archivo.ruta);
                    });
                }
            });

            // Eliminar registros de archivos
            if (archivos.length > 0) {
                connection.query('DELETE FROM archivos WHERE subido_por = ?', [userIdToDelete], (err) => {
                    if (err) {
                        console.error('❌ Error eliminando archivos:', err);
                        return res.status(500).json({ error: 'Error eliminando archivos del usuario' });
                    }
                    console.log(`✅ ${archivos.length} archivos eliminados`);
                    eliminarUsuario();
                });
            } else {
                eliminarUsuario();
            }

            function eliminarUsuario() {
                // 4. Finalmente eliminar el usuario
                connection.query('DELETE FROM usuarios WHERE id = ?', [userIdToDelete], (err, result) => {
                    if (err) {
                        console.error('❌ Error eliminando usuario:', err);
                        return res.status(500).json({ error: 'Error eliminando usuario de la base de datos' });
                    }

                    if (result.affectedRows === 0) {
                        return res.status(404).json({ error: 'Usuario no encontrado' });
                    }

                    console.log('✅ Usuario eliminado exitosamente');
                    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
                });
            }
        });
    });
});

// ------------------------------------------------------------------
// SISTEMA DE INVENTARIOS - CON RUTAS COMPLETAS DE EDITAR/ELIMINAR
// ------------------------------------------------------------------

// ✅ INVENTARIO DE ÚTILES DE OFICINA

// Obtener todos los items de oficina
app.get('/api/inventario/oficina', isAuthenticated, (req, res) => {
    const query = `
        SELECT io.*, u.nombre as usuario_nombre 
        FROM inventario_oficina io 
        LEFT JOIN usuarios u ON io.usuario_registro = u.id 
        ORDER BY io.fecha_ingreso DESC
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo inventario oficina:', err);
            return res.status(500).json({ error: 'Error al obtener inventario' });
        }
        res.json(results);
    });
});

// Obtener un item específico de oficina (NUEVA RUTA)
app.get('/api/inventario/oficina/:id', isAuthenticated, (req, res) => {
    const itemId = req.params.id;
    
    const query = `
        SELECT io.*, u.nombre as usuario_nombre 
        FROM inventario_oficina io 
        LEFT JOIN usuarios u ON io.usuario_registro = u.id 
        WHERE io.id = ?
    `;

    connection.query(query, [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo item oficina:', err);
            return res.status(500).json({ error: 'Error al obtener item' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }
        
        res.json(results[0]);
    });
});

// Agregar item a inventario de oficina
app.post('/api/inventario/oficina', isAuthenticated, isAdminOrMaster, (req, res) => {
    const { nombre, cantidad, descripcion, ubicacion } = req.body;

    if (!nombre || !cantidad) {
        return res.status(400).json({ error: 'Nombre y cantidad son obligatorios' });
    }

    const query = 'INSERT INTO inventario_oficina (nombre, cantidad, descripcion, ubicacion, usuario_registro) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [nombre, cantidad, descripcion, ubicacion, req.session.userId], (err, result) => {
        if (err) {
            console.error('❌ Error agregando item oficina:', err);
            return res.status(500).json({ error: 'Error al agregar item' });
        }

        // Registrar movimiento
        const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
        connection.query(movimientoQuery, ['oficina', result.insertId, 'entrada', cantidad, req.session.userId, `Ingreso inicial: ${nombre}`], (err) => {
            if (err) console.error('⚠️ Error registrando movimiento:', err);
        });

        res.json({
            success: true,
            message: 'Item agregado exitosamente',
            item: {
                id: result.insertId,
                nombre: nombre
            }
        });
    });
});

// Actualizar item de oficina (NUEVA RUTA - EDITAR COMPLETO)
app.put('/api/inventario/oficina/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { nombre, cantidad, descripcion, ubicacion } = req.body;

    if (!nombre || !cantidad) {
        return res.status(400).json({ error: 'Nombre y cantidad son obligatorios' });
    }

    const query = 'UPDATE inventario_oficina SET nombre = ?, cantidad = ?, descripcion = ?, ubicacion = ? WHERE id = ?';
    connection.query(query, [nombre, cantidad, descripcion, ubicacion, itemId], (err, result) => {
        if (err) {
            console.error('❌ Error actualizando item oficina:', err);
            return res.status(500).json({ error: 'Error al actualizar item' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        res.json({
            success: true,
            message: 'Item actualizado exitosamente'
        });
    });
});

// Eliminar item de oficina (NUEVA RUTA)
app.delete('/api/inventario/oficina/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;

    // Primero verificar que existe
    connection.query('SELECT * FROM inventario_oficina WHERE id = ?', [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error verificando item:', err);
            return res.status(500).json({ error: 'Error al verificar item' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        // Eliminar movimientos relacionados primero
        connection.query('DELETE FROM movimientos_inventario WHERE tipo_inventario = ? AND item_id = ?', ['oficina', itemId], (err) => {
            if (err) console.error('⚠️ Error eliminando movimientos:', err);
            
            // Luego eliminar el item
            connection.query('DELETE FROM inventario_oficina WHERE id = ?', [itemId], (err, result) => {
                if (err) {
                    console.error('❌ Error eliminando item oficina:', err);
                    return res.status(500).json({ error: 'Error al eliminar item' });
                }

                res.json({
                    success: true,
                    message: 'Item eliminado exitosamente'
                });
            });
        });
    });
});

// Actualizar cantidad de item de oficina (movimientos)
app.put('/api/inventario/oficina/:id/movimiento', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { movimiento, cantidad, observaciones } = req.body;

    if (!movimiento || !cantidad) {
        return res.status(400).json({ error: 'Movimiento y cantidad son obligatorios' });
    }

    // Obtener item actual
    connection.query('SELECT * FROM inventario_oficina WHERE id = ?', [itemId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        const item = results[0];
        let nuevaCantidad = item.cantidad;

        if (movimiento === 'entrada') {
            nuevaCantidad += cantidad;
        } else if (movimiento === 'salida') {
            if (item.cantidad < cantidad) {
                return res.status(400).json({ error: 'No hay suficiente stock' });
            }
            nuevaCantidad -= cantidad;
        }

        // Actualizar cantidad
        connection.query('UPDATE inventario_oficina SET cantidad = ? WHERE id = ?', [nuevaCantidad, itemId], (err) => {
            if (err) {
                console.error('❌ Error actualizando inventario:', err);
                return res.status(500).json({ error: 'Error al actualizar inventario' });
            }

            // Registrar movimiento
            const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
            connection.query(movimientoQuery, ['oficina', itemId, movimiento, cantidad, req.session.userId, observaciones || `Movimiento: ${movimiento}`], (err) => {
                if (err) console.error('⚠️ Error registrando movimiento:', err);
            });

            res.json({
                success: true,
                message: `Inventario actualizado - ${movimiento} de ${cantidad} unidades`,
                nuevaCantidad: nuevaCantidad
            });
        });
    });
});

// ✅ INVENTARIO DE ÚTILES DE LIMPIEZA

// Obtener todos los items de limpieza
app.get('/api/inventario/limpieza', isAuthenticated, (req, res) => {
    const query = `
        SELECT il.*, u.nombre as usuario_nombre 
        FROM inventario_limpieza il 
        LEFT JOIN usuarios u ON il.usuario_registro = u.id 
        ORDER BY il.fecha_ingreso DESC
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo inventario limpieza:', err);
            return res.status(500).json({ error: 'Error al obtener inventario' });
        }
        res.json(results);
    });
});

// Obtener un item específico de limpieza (NUEVA RUTA)
app.get('/api/inventario/limpieza/:id', isAuthenticated, (req, res) => {
    const itemId = req.params.id;
    
    const query = `
        SELECT il.*, u.nombre as usuario_nombre 
        FROM inventario_limpieza il 
        LEFT JOIN usuarios u ON il.usuario_registro = u.id 
        WHERE il.id = ?
    `;

    connection.query(query, [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo item limpieza:', err);
            return res.status(500).json({ error: 'Error al obtener item' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        res.json(results[0]);
    });
});

// Agregar item a inventario de limpieza
app.post('/api/inventario/limpieza', isAuthenticated, isAdminOrMaster, (req, res) => {
    const { producto, cantidad, tipo, proveedor } = req.body;

    if (!producto || !cantidad) {
        return res.status(400).json({ error: 'Producto y cantidad son obligatorios' });
    }

    const query = 'INSERT INTO inventario_limpieza (producto, cantidad, tipo, proveedor, usuario_registro) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [producto, cantidad, tipo, proveedor, req.session.userId], (err, result) => {
        if (err) {
            console.error('❌ Error agregando item limpieza:', err);
            return res.status(500).json({ error: 'Error al agregar item' });
        }

        // Registrar movimiento
        const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
        connection.query(movimientoQuery, ['limpieza', result.insertId, 'entrada', cantidad, req.session.userId, `Ingreso inicial: ${producto}`], (err) => {
            if (err) console.error('⚠️ Error registrando movimiento:', err);
        });

        res.json({
            success: true,
            message: 'Producto agregado exitosamente',
            item: {
                id: result.insertId,
                producto: producto
            }
        });
    });
});

// Actualizar item de limpieza (NUEVA RUTA - EDITAR COMPLETO)
app.put('/api/inventario/limpieza/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { producto, cantidad, tipo, proveedor } = req.body;

    if (!producto || !cantidad) {
        return res.status(400).json({ error: 'Producto y cantidad son obligatorios' });
    }

    const query = 'UPDATE inventario_limpieza SET producto = ?, cantidad = ?, tipo = ?, proveedor = ? WHERE id = ?';
    connection.query(query, [producto, cantidad, tipo, proveedor, itemId], (err, result) => {
        if (err) {
            console.error('❌ Error actualizando item limpieza:', err);
            return res.status(500).json({ error: 'Error al actualizar producto' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({
            success: true,
            message: 'Producto actualizado exitosamente'
        });
    });
});

// Eliminar item de limpieza (NUEVA RUTA)
app.delete('/api/inventario/limpieza/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;

    // Primero verificar que existe
    connection.query('SELECT * FROM inventario_limpieza WHERE id = ?', [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error verificando producto:', err);
            return res.status(500).json({ error: 'Error al verificar producto' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Eliminar movimientos relacionados primero
        connection.query('DELETE FROM movimientos_inventario WHERE tipo_inventario = ? AND item_id = ?', ['limpieza', itemId], (err) => {
            if (err) console.error('⚠️ Error eliminando movimientos:', err);
            
            // Luego eliminar el producto
            connection.query('DELETE FROM inventario_limpieza WHERE id = ?', [itemId], (err, result) => {
                if (err) {
                    console.error('❌ Error eliminando producto:', err);
                    return res.status(500).json({ error: 'Error al eliminar producto' });
                }

                res.json({
                    success: true,
                    message: 'Producto eliminado exitosamente'
                });
            });
        });
    });
});

// Actualizar cantidad de item de limpieza (movimientos)
app.put('/api/inventario/limpieza/:id/movimiento', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { movimiento, cantidad, observaciones } = req.body;

    if (!movimiento || !cantidad) {
        return res.status(400).json({ error: 'Movimiento y cantidad son obligatorios' });
    }

    connection.query('SELECT * FROM inventario_limpieza WHERE id = ?', [itemId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const item = results[0];
        let nuevaCantidad = item.cantidad;

        if (movimiento === 'entrada') {
            nuevaCantidad += cantidad;
        } else if (movimiento === 'salida') {
            if (item.cantidad < cantidad) {
                return res.status(400).json({ error: 'No hay suficiente stock' });
            }
            nuevaCantidad -= cantidad;
        }

        connection.query('UPDATE inventario_limpieza SET cantidad = ? WHERE id = ?', [nuevaCantidad, itemId], (err) => {
            if (err) {
                console.error('❌ Error actualizando inventario:', err);
                return res.status(500).json({ error: 'Error al actualizar inventario' });
            }

            // Registrar movimiento
            const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
            connection.query(movimientoQuery, ['limpieza', itemId, movimiento, cantidad, req.session.userId, observaciones || `Movimiento: ${movimiento}`], (err) => {
                if (err) console.error('⚠️ Error registrando movimiento:', err);
            });

            res.json({
                success: true,
                message: `Inventario actualizado - ${movimiento} de ${cantidad} unidades`,
                nuevaCantidad: nuevaCantidad
            });
        });
    });
});

// ✅ INVENTARIO DE GARRAFONES, SELLOS Y TAPONES

// Obtener todos los items de garrafones
app.get('/api/inventario/garrafones', isAuthenticated, (req, res) => {
    const query = `
        SELECT ig.*, u.nombre as usuario_nombre 
        FROM inventario_garrafones ig 
        LEFT JOIN usuarios u ON ig.usuario_registro = u.id 
        ORDER BY ig.fecha_registro DESC
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo inventario garrafones:', err);
            return res.status(500).json({ error: 'Error al obtener inventario' });
        }
        res.json(results);
    });
});

// Obtener un item específico de garrafones (NUEVA RUTA)
app.get('/api/inventario/garrafones/:id', isAuthenticated, (req, res) => {
    const itemId = req.params.id;
    
    const query = `
        SELECT ig.*, u.nombre as usuario_nombre 
        FROM inventario_garrafones ig 
        LEFT JOIN usuarios u ON ig.usuario_registro = u.id 
        WHERE ig.id = ?
    `;

    connection.query(query, [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo item garrafones:', err);
            return res.status(500).json({ error: 'Error al obtener item' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }
        
        res.json(results[0]);
    });
});

// Agregar item a inventario de garrafones
app.post('/api/inventario/garrafones', isAuthenticated, isAdminOrMaster, (req, res) => {
    const { tipo, cantidad, estado, ubicacion, observaciones } = req.body;

    if (!tipo || !cantidad) {
        return res.status(400).json({ error: 'Tipo y cantidad son obligatorios' });
    }

    const query = 'INSERT INTO inventario_garrafones (tipo, cantidad, estado, ubicacion, observaciones, usuario_registro) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(query, [tipo, cantidad, estado, ubicacion, observaciones, req.session.userId], (err, result) => {
        if (err) {
            console.error('❌ Error agregando item garrafones:', err);
            return res.status(500).json({ error: 'Error al agregar item' });
        }

        // Registrar movimiento
        const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
        connection.query(movimientoQuery, ['garrafones', result.insertId, 'entrada', cantidad, req.session.userId, `Ingreso inicial: ${tipo}`], (err) => {
            if (err) console.error('⚠️ Error registrando movimiento:', err);
        });

        res.json({
            success: true,
            message: 'Item agregado exitosamente',
            item: {
                id: result.insertId,
                tipo: tipo
            }
        });
    });
});

// Actualizar item de garrafones (NUEVA RUTA - EDITAR COMPLETO)
app.put('/api/inventario/garrafones/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { tipo, cantidad, estado, ubicacion, observaciones } = req.body;

    if (!tipo || !cantidad) {
        return res.status(400).json({ error: 'Tipo y cantidad son obligatorios' });
    }

    const query = 'UPDATE inventario_garrafones SET tipo = ?, cantidad = ?, estado = ?, ubicacion = ?, observaciones = ? WHERE id = ?';
    connection.query(query, [tipo, cantidad, estado, ubicacion, observaciones, itemId], (err, result) => {
        if (err) {
            console.error('❌ Error actualizando item garrafones:', err);
            return res.status(500).json({ error: 'Error al actualizar item' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        res.json({
            success: true,
            message: 'Item actualizado exitosamente'
        });
    });
});

// Eliminar item de garrafones (NUEVA RUTA)
app.delete('/api/inventario/garrafones/:id', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;

    // Primero verificar que existe
    connection.query('SELECT * FROM inventario_garrafones WHERE id = ?', [itemId], (err, results) => {
        if (err) {
            console.error('❌ Error verificando item:', err);
            return res.status(500).json({ error: 'Error al verificar item' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        // Eliminar movimientos relacionados primero
        connection.query('DELETE FROM movimientos_inventario WHERE tipo_inventario = ? AND item_id = ?', ['garrafones', itemId], (err) => {
            if (err) console.error('⚠️ Error eliminando movimientos:', err);
            
            // Luego eliminar el item
            connection.query('DELETE FROM inventario_garrafones WHERE id = ?', [itemId], (err, result) => {
                if (err) {
                    console.error('❌ Error eliminando item:', err);
                    return res.status(500).json({ error: 'Error al eliminar item' });
                }

                res.json({
                    success: true,
                    message: 'Item eliminado exitosamente'
                });
            });
        });
    });
});

// Actualizar cantidad de item de garrafones (movimientos)
app.put('/api/inventario/garrafones/:id/movimiento', isAuthenticated, isAdminOrMaster, (req, res) => {
    const itemId = req.params.id;
    const { movimiento, cantidad, observaciones } = req.body;

    if (!movimiento || !cantidad) {
        return res.status(400).json({ error: 'Movimiento y cantidad son obligatorios' });
    }

    connection.query('SELECT * FROM inventario_garrafones WHERE id = ?', [itemId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        const item = results[0];
        let nuevaCantidad = item.cantidad;

        if (movimiento === 'entrada') {
            nuevaCantidad += cantidad;
        } else if (movimiento === 'salida') {
            if (item.cantidad < cantidad) {
                return res.status(400).json({ error: 'No hay suficiente stock' });
            }
            nuevaCantidad -= cantidad;
        }

        connection.query('UPDATE inventario_garrafones SET cantidad = ? WHERE id = ?', [nuevaCantidad, itemId], (err) => {
            if (err) {
                console.error('❌ Error actualizando inventario:', err);
                return res.status(500).json({ error: 'Error al actualizar inventario' });
            }

            // Registrar movimiento
            const movimientoQuery = 'INSERT INTO movimientos_inventario (tipo_inventario, item_id, movimiento, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)';
            connection.query(movimientoQuery, ['garrafones', itemId, movimiento, cantidad, req.session.userId, observaciones || `Movimiento: ${movimiento}`], (err) => {
                if (err) console.error('⚠️ Error registrando movimiento:', err);
            });

            res.json({
                success: true,
                message: `Inventario actualizado - ${movimiento} de ${cantidad} unidades`,
                nuevaCantidad: nuevaCantidad
            });
        });
    });
});

// ✅ OBTENER MOVIMIENTOS DE INVENTARIO
app.get('/api/inventario/movimientos', isAuthenticated, (req, res) => {
    const query = `
        SELECT mi.*, u.nombre as usuario_nombre 
        FROM movimientos_inventario mi 
        LEFT JOIN usuarios u ON mi.usuario_id = u.id 
        ORDER BY mi.fecha_movimiento DESC 
        LIMIT 50
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo movimientos:', err);
            return res.status(500).json({ error: 'Error al obtener movimientos' });
        }
        res.json(results);
    });
});

// === NUEVAS RUTAS PARA GARRAFONES (sistema alternativo) ===
app.get('/api/inventario/garrafones/stock', isAuthenticated, (req, res) => {
    const query = `
        SELECT 
            producto,
            SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END) as stock
        FROM movimientos_garrafones 
        GROUP BY producto
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo stock garrafones:', err);
            return res.status(500).json({ error: 'Error al obtener stock' });
        }
        
        const stockObj = {
            garrafones: 0,
            tapones: 0,
            sellos: 0
        };
        
        results.forEach(item => {
            stockObj[item.producto] = item.stock || 0;
        });
        
        res.json(stockObj);
    });
});

// ------------------------------------------------------------------
// RUTAS DE MANTENIMIENTO
// ------------------------------------------------------------------

// Limpiar archivos huérfanos (solo maestro)
app.get('/api/maintenance/clean-orphaned-files', isAuthenticated, isMaster, (req, res) => {
    console.log('🧹 Limpiando archivos huérfanos...');
    
    connection.query(`
        SELECT a.id, a.nombre_original, a.ruta 
        FROM archivos a 
        LEFT JOIN usuarios u ON a.subido_por = u.id 
        WHERE u.id IS NULL
    `, (err, orphanedFiles) => {
        if (err) {
            console.error('❌ Error buscando archivos huérfanos:', err);
            return res.status(500).json({ error: 'Error buscando archivos huérfanos' });
        }
        
        console.log(`📁 Archivos huérfanos encontrados: ${orphanedFiles.length}`);
        
        if (orphanedFiles.length === 0) {
            return res.json({ message: 'No hay archivos huérfanos' });
        }
        
        // Eliminar archivos físicos
        orphanedFiles.forEach(file => {
            if (fs.existsSync(file.ruta)) {
                fs.unlink(file.ruta, (err) => {
                    if (err) {
                        console.error('⚠️ Error eliminando archivo físico:', file.ruta);
                    } else {
                        console.log('✅ Archivo físico eliminado:', file.ruta);
                    }
                });
            }
        });
        
        // Eliminar registros de la base de datos
        connection.query(`
            DELETE a FROM archivos a 
            LEFT JOIN usuarios u ON a.subido_por = u.id 
            WHERE u.id IS NULL
        `, (err, result) => {
            if (err) {
                console.error('❌ Error eliminando archivos huérfanos:', err);
                return res.status(500).json({ error: 'Error eliminando archivos huérfanos' });
            }
            
            console.log(`✅ ${result.affectedRows} archivos huérfanos eliminados`);
            res.json({ 
                success: true, 
                message: `Se eliminaron ${result.affectedRows} archivos huérfanos`
            });
        });
    });
});

// ------------------------------------------------------------------
// MANEJO DE ERRORES
// ------------------------------------------------------------------

app.use((error, req, res, next) => {
    console.error('❌ Error no manejado:', error);
    res.status(500).json({ 
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log('📁 Asegúrate de que XAMPP esté corriendo con Apache y MySQL activos');
    console.log('🔧 CORS habilitado para permitir peticiones del frontend');
    console.log('📦 Sistema de inventarios activo:');
    console.log('   - Útiles de oficina');
    console.log('   - Útiles de limpieza');
    console.log('   - Garrafones, sellos y tapones');
    console.log('   - Tracking de movimientos');
    console.log('   - ✅ NUEVO: Sistema completo de Editar/Eliminar');
});