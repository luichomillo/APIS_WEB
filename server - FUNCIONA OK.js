const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const session = require('express-session');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 3000;
const path = require('path');

app.use(express.json());
//app.use('/api', Anyroute)

// Habilitar CORS para todas las solicitudes y permitir red privada
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Access-Control-Allow-Private-Network'],
    preflightContinue: true
}));

// Middleware para agregar el encabezado `Access-Control-Allow-Private-Network`
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});

// Middleware para obtener la IP del cliente
app.use((req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress.replace('::ffff:', ''); // Corrige la IP
    next();
});

// Middleware para el manejo de sesiones
app.use(session({
    secret: 'mi-secreto',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Cambiar a true en producción con HTTPS
}));

// Base de datos SQLite
let db = new sqlite3.Database('./analytics.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');

        // Crear tablas si no existen
        db.run(`CREATE TABLE IF NOT EXISTS views (id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0)`);
        db.run(`CREATE TABLE IF NOT EXISTS connections (id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0)`);
        db.run(`CREATE TABLE IF NOT EXISTS connections_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS active_connections (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, connected_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS USUARIOS (USER TEXT PRIMARY KEY, PASSW TEXT, HABILITADO BOOLEAN, CATEGORIA TEXT DEFAULT 'INVITADO')`);

        // Inicializar valores de las tablas si es necesario
        db.run(`INSERT OR IGNORE INTO views (id, count) VALUES (1, 0)`);
        db.run(`INSERT OR IGNORE INTO connections (id, count) VALUES (1, 0)`);
    }
});

// Configuración del correo electrónico
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'lvallejos120@gmail.com',
        pass: 'River1975'
    }
});

// Middleware para verificar si el usuario está autenticado
function isAuthenticated(req, res, next) {
    if (req.session.user && req.session.categoria) {
        return next();
    } else {
        res.redirect('/login.html');
    }
}

// Middleware para verificar la categoría de usuario
function checkCategoria(categoriaPermitida) {
    return function (req, res, next) {
        if (req.session.categoria === categoriaPermitida || req.session.categoria === 'CLIENTE') {
            return next();
        } else {
            res.redirect('/login.html');
        }
    };
}

// Ruta de inicio de sesión
app.post('/login', (req, res) => {
    const { user, passw } = req.body;

    db.get('SELECT * FROM USUARIOS WHERE USER = ? AND PASSW = ?', [user, passw], (err, row) => {
        if (err) {
            res.json({ error: 'Error en el servidor.' });
            return;
        }

        if (!row) {
            res.json({ error: 'Usuario o contraseña incorrectos.' });
            return;
        }

        if (row.HABILITADO === 1) {
            // Guardar la sesión del usuario
            req.session.user = row.USER;
            req.session.categoria = row.CATEGORIA;
            res.json({ success: true });
        } else {
            // Habilitar provisionalmente como INVITADO
            db.run('UPDATE USUARIOS SET HABILITADO = 1, CATEGORIA = "INVITADO" WHERE USER = ?', [user], (updateErr) => {
                if (updateErr) {
                    res.json({ error: 'Error al habilitar el usuario.' });
                    return;
                }

                // Notificar al administrador
                const mailOptions = {
                    from: 'lvallejos120@gmail.com',
                    to: 'lvallejos120@gmail.com',
                    subject: 'Usuario provisionalmente habilitado',
                    text: `El usuario ${user} ha sido habilitado como INVITADO.`
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        res.json({ error: 'No se pudo enviar el correo.' });
                        return;
                    }
                    req.session.user = row.USER;
                    req.session.categoria = 'INVITADO';
                    res.json({ error: 'Será habilitado en breve...' });
                });
            });
        }
    });
});

// AUTENTICAR USER
function isAuthenticated(req, res, next) {
    if (req.session.user && req.session.categoria) {
        return next();
    } else {
        res.redirect('/login.html');
    }
}


// login
app.get('/login.html', (req, res) => {
//    res.sendFile(path.join(__dirname, 'public', 'login.html'));
res.sendfile('D:/STREAMING/nginx/www/login.html');
});

// Rutas protegidas
app.get('https://luichomillo.freeddns.org/luichotv.html', isAuthenticated, (req, res) => {
//    res.sendFile(path.join(__dirname, 'public', 'LuichoTV.html'));
res.sendfile('D:/STREAMING/nginx/www/login.html');
});

// Rutas protegidas
app.get('/LuichoTV.html', isAuthenticated, (req, res) => {
//    res.sendFile(path.join(__dirname, 'public', 'LuichoTV.html'));
res.sendfile('D:/STREAMING/nginx/www/login.html');
});

app.get('/pagina-invitado.html', isAuthenticated, checkCategoria('INVITADO'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pagina-invitado.html'));
});

app.get('/pagina-cliente.html', isAuthenticated, checkCategoria('CLIENTE'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pagina-cliente.html'));
});

// Verificación de sesión
app.get('/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, categoria: req.session.categoria });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- Mantenimiento de estadísticas y conexiones ---

// Endpoint para obtener el número de conexiones en vivo y las IPs conectadas
app.get('/api/connections', (req, res) => {
    db.all(`SELECT ip FROM active_connections`, (err, rows) => {
        if (err) {
            console.error("Error al obtener las conexiones:", err.message);
            res.status(500).send('Error al obtener las conexiones.');
        } else {
            res.json({ connections: rows.length, ips: rows.map(row => row.ip) });
        }
    });
});

// Endpoint para obtener el número de vistas acumuladas
app.get('/api/views', (req, res) => {
    db.get(`SELECT count FROM views WHERE id = 1`, (err, row) => {
        if (err) {
            console.error("Error al obtener las vistas:", err.message);
            res.status(500).send('Error al obtener las vistas.');
        } else {
            res.json({ views: row ? row.count : 0 });
        }
    });
});

// Endpoint para registrar una vista
app.post('/api/views', (req, res) => {
    db.run(`UPDATE views SET count = count + 1 WHERE id = 1`, function (err) {
        if (err) {
            console.error("Error al actualizar las vistas:", err.message);
            res.status(500).send('Error al actualizar las vistas.');
        } else {
            console.log("Vista registrada correctamente");
            res.status(200).send('Vista registrada.');
        }
    });
});

// Endpoint para manejar conexiones y desconexiones en tiempo real
app.post('/api/connections', (req, res) => {
    const increment = req.query.increment === 'true';
    const ip = req.clientIp;

    if (increment) {
        // Registrar la conexión activa si no está registrada
        db.run(`INSERT INTO active_connections (ip) VALUES (?)`, [ip], function (err) {
            if (err) {
                console.error("Error al registrar conexión:", err.message);
                res.status(500).send('Error al registrar conexión.');
            } else {
                console.log(`Conexión registrada: ${ip}`);
                res.status(200).send('Conexión registrada.');
            }
        });
    } else {
        // Eliminar la conexión activa y sumar a las vistas
        db.run(`DELETE FROM active_connections WHERE ip = ?`, [ip], function (err) {
            if (err) {
                console.error("Error al eliminar conexión:", err.message);
                res.status(500).send('Error al eliminar conexión.');
            } else {
                db.run(`UPDATE views SET count = count + 1 WHERE id = 1`, function (err) {
                    if (err) {
                        console.error("Error al actualizar vistas:", err.message);
                        res.status(500).send('Error al actualizar vistas.');
                    } else {
                        console.log(`Conexión eliminada y vista registrada: ${ip}`);
                        res.status(200).send('Conexión eliminada y vista registrada.');
                    }
                });
            }
        });
    }
});

// Endpoint para resetear contadores cuando no hay transmisión
app.post('/api/reset-counters', (req, res) => {
    db.run(`UPDATE views SET count = 0 WHERE id = 1`);
    db.run(`UPDATE connections SET count = 0 WHERE id = 1`);
    db.run(`DELETE FROM active_connections`);
    console.log("Contadores reseteados porque no hay transmisión.");
    res.status(200).send('Contadores reseteados.');
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
