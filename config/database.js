const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

// Configuración de la conexión a MySQL
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'purificadoracontrol',
    multipleStatements: true
});

// Conectar a MySQL
connection.connect((err) => {
    if (err) {
        console.error('#####################################################');
        console.error('🛑 ERROR CRÍTICO DE CONEXIÓN A BASE DE DATOS');
        console.error('CÓDIGO DE ERROR:', err.code); 
        console.error('MENSAJE:', err.message);
        console.error('-----------------------------------------------------');
        console.error('SOLUCIÓN: Asegúrese que Apache y MySQL estén en VERDE');
        console.error('en el Panel de Control de XAMPP.');
        console.error('#####################################################');
        return;
    }
    console.log('✅ Conectado a MySQL correctamente');
});

// Crear base de datos si no existe
const createDatabase = () => {
    return new Promise((resolve, reject) => {
        const dbConnection = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: ''
        });

        dbConnection.query('CREATE DATABASE IF NOT EXISTS purificadoracontrol', (err) => {
            if (err) {
                console.error('❌ Error creando base de datos:', err);
                reject(err);
                return;
            }
            console.log('✅ Base de datos verificada/creada');
            dbConnection.end();
            resolve();
        });
    });
};

// Crear tablas - VERSIÓN COMPLETA CON INVENTARIOS
const createTables = () => {
    return new Promise((resolve, reject) => {
        // Tabla de usuarios
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                tipo ENUM('maestro', 'admin', 'invitado') DEFAULT 'invitado',
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Tabla de archivos con ON DELETE CASCADE
        const createFilesTable = `
            CREATE TABLE IF NOT EXISTS archivos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre_original VARCHAR(255) NOT NULL,
                nombre_archivo VARCHAR(255) NOT NULL,
                ruta VARCHAR(255) NOT NULL,
                tipo_archivo VARCHAR(100),
                tamano INT,
                subido_por INT,
                fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `;

        // Tabla de inventario de útiles de oficina
        const createOficinaTable = `
            CREATE TABLE IF NOT EXISTS inventario_oficina (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                cantidad INT NOT NULL DEFAULT 0,
                descripcion TEXT,
                ubicacion VARCHAR(100),
                fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_registro INT,
                FOREIGN KEY (usuario_registro) REFERENCES usuarios(id)
            )
        `;

        // Tabla de inventario de limpieza
        const createLimpiezaTable = `
            CREATE TABLE IF NOT EXISTS inventario_limpieza (
                id INT AUTO_INCREMENT PRIMARY KEY,
                producto VARCHAR(255) NOT NULL,
                cantidad INT NOT NULL DEFAULT 0,
                tipo VARCHAR(100),
                proveedor VARCHAR(255),
                fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_registro INT,
                FOREIGN KEY (usuario_registro) REFERENCES usuarios(id)
            )
        `;

        // Tabla de inventario de garrafones, sellos y tapones
        const createGarrafonesTable = `
            CREATE TABLE IF NOT EXISTS inventario_garrafones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo ENUM('garrafon', 'sello', 'tapon') NOT NULL,
                cantidad INT NOT NULL DEFAULT 0,
                estado ENUM('nuevo', 'usado', 'danado') DEFAULT 'nuevo',
                ubicacion VARCHAR(100),
                observaciones TEXT,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usuario_registro INT,
                FOREIGN KEY (usuario_registro) REFERENCES usuarios(id)
            )
        `;

        // Tabla de movimientos de inventario (para tracking)
        const createMovimientosTable = `
            CREATE TABLE IF NOT EXISTS movimientos_inventario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo_inventario ENUM('oficina', 'limpieza', 'garrafones') NOT NULL,
                item_id INT NOT NULL,
                movimiento ENUM('entrada', 'salida') NOT NULL,
                cantidad INT NOT NULL,
                usuario_id INT NOT NULL,
                observaciones TEXT,
                fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            )
        `;

        // === NUEVA TABLA PARA MOVIMIENTOS DE GARRAFONES ===
        const createMovimientosGarrafonesTable = `
            CREATE TABLE IF NOT EXISTS movimientos_garrafones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo ENUM('entrada', 'salida') NOT NULL,
                producto ENUM('garrafones', 'tapones', 'sellos') NOT NULL,
                cantidad INT NOT NULL,
                descripcion TEXT,
                usuario_id INT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            )
        `;

        const allTables = [
            createUsersTable, 
            createFilesTable, 
            createOficinaTable, 
            createLimpiezaTable, 
            createGarrafonesTable,
            createMovimientosTable,
            createMovimientosGarrafonesTable  // ← NUEVA TABLA AGREGADA
        ].join('; ');

        connection.query(allTables, (err, results) => {
            if (err) {
                console.error('❌ Error creando tablas:', err);
                reject(err);
                return;
            }
            console.log('✅ Todas las tablas verificadas/creadas correctamente');
            console.log('   - usuarios');
            console.log('   - archivos');
            console.log('   - inventario_oficina');
            console.log('   - inventario_limpieza');
            console.log('   - inventario_garrafones');
            console.log('   - movimientos_inventario');
            console.log('   - ✅ movimientos_garrafones (NUEVA)');
            
            // Insertar datos iniciales en movimientos_garrafones
            insertDatosInicialesGarrafones()
                .then(() => resolve())
                .catch(error => {
                    console.error('⚠️ Error insertando datos iniciales, pero continuando...', error.message);
                    resolve(); // Continuar aunque falle la inserción de datos iniciales
                });
        });
    });
};

// Función para insertar datos iniciales en movimientos_garrafones
const insertDatosInicialesGarrafones = () => {
    return new Promise((resolve, reject) => {
        // Verificar si ya existen datos en la tabla
        const checkData = 'SELECT COUNT(*) as count FROM movimientos_garrafones';
        connection.query(checkData, (err, results) => {
            if (err) {
                console.error('❌ Error verificando datos de garrafones:', err);
                reject(err);
                return;
            }
            
            if (results[0].count === 0) {
                // Insertar datos iniciales
                const insertInitialData = `
                    INSERT INTO movimientos_garrafones (tipo, producto, cantidad, descripcion, usuario_id) VALUES
                    ('entrada', 'garrafones', 125, 'Stock inicial', 1),
                    ('entrada', 'tapones', 350, 'Stock inicial', 1),
                    ('entrada', 'sellos', 210, 'Stock inicial', 1)
                `;
                
                connection.query(insertInitialData, (err, result) => {
                    if (err) {
                        console.error('❌ Error insertando datos iniciales de garrafones:', err);
                        reject(err);
                        return;
                    }
                    console.log('✅ Datos iniciales de garrafones insertados correctamente');
                    console.log('   - Garrafones: 125 unidades');
                    console.log('   - Tapones: 350 unidades');
                    console.log('   - Sellos: 210 unidades');
                    resolve();
                });
            } else {
                console.log('✅ Datos de garrafones ya existen en la tabla');
                resolve();
            }
        });
    });
};

// Insertar usuario maestro
const insertMasterUser = () => {
    return new Promise((resolve, reject) => {
        const hashedPassword = bcrypt.hashSync('123456', 10);
        
        const checkMaster = 'SELECT * FROM usuarios WHERE email = ?';
        connection.query(checkMaster, ['carlosadan12345@gmail.com'], (err, results) => {
            if (err) {
                console.error('❌ Error verificando usuario maestro:', err);
                reject(err);
                return;
            }
            
            if (results.length === 0) {
                const insertMaster = `
                    INSERT INTO usuarios (nombre, email, password, tipo) 
                    VALUES (?, ?, ?, 'maestro')
                `;
                connection.query(insertMaster, ['Carlos Maestro', 'carlosadan12345@gmail.com', hashedPassword], (err, result) => {
                    if (err) {
                        console.error('❌ Error insertando usuario maestro:', err);
                        reject(err);
                        return;
                    }
                    console.log('✅ Usuario maestro creado exitosamente');
                    console.log('   📧 Email: carlosadan12345@gmail.com');
                    console.log('   🔑 Password: 123456');
                    resolve();
                });
            } else {
                console.log('✅ Usuario maestro ya existe');
                resolve();
            }
        });
    });
};

module.exports = {
    connection,
    createDatabase,
    createTables,
    insertMasterUser
};