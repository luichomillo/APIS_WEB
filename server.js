const https = require('https');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();
const cookies = require("cookie-parser");
const app = express();

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Cargar los certificados SSL
const options = {
    key: fs.readFileSync('localhost-key.pem'),
    cert: fs.readFileSync('localhost.pem')
};

// CORS general para rutas públicas
const generalCorsOptions = {
    origin: '*',  // Permite acceso desde cualquier origen
    allowedHeaders: ['Content-Type'],
    preflightContinue: true
};

// Middleware para cookies
app.use(cookies());

// Middleware para parsear application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Aplicar CORS general a todas las rutas
app.use(cors(generalCorsOptions));

// Middleware para el manejo de sesiones
app.use(session({
    secret: 'mi-secreto',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        httpOnly: true,
        secure: true, // Ahora que estamos en HTTPS, podemos usar secure
        sameSite: 'None', // Para permitir cross-site requests
        maxAge: 60 * 60 * 1000 // 1 hora
    }
}));

// Middleware para obtener la IP del cliente
app.use((req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress.replace('::ffff:', '');
    next();
});

// Base de datos SQLite
let db = new sqlite3.Database('./analytics.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
    }
});

// Middleware para verificar si el usuario está autenticado
function isAuthenticated(req, res, next) {
    if (req.session.userID) {
        return next();
    } else {
        res.redirect('/login.html');
    }
}

// ****LOGIN USUARIOS (FUNCIONANDO CON SESIONES)****
app.post('/api/login', upload.none(), (req, res) => {
    const { user, passw, IP } = req.body;
    console.log("user: ", user, "passw: ", passw, "IP: ", IP);

    db.get('SELECT * FROM USUARIOS WHERE USER = ? AND PASSW = ?', [user, passw], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (row) {
            console.log("Inicia sesión para ID: ", row.idUSER);
            req.session.userID = row.idUSER; // Almacenar el idUSER en la sesión
            
            let fecha = new Date();
            let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours()}:${fecha.getMinutes()}`;

            db.run(`UPDATE USUARIOS SET CONECTADO = TRUE, UltimaConexion = ?, IP_User = ? WHERE idUSER = ?`, [formattedDate, IP, row.idUSER], function (err) {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                }
                return res.json({ success: true });
            });
        } else {
            return res.json({ success: false, error: 'Usuario o contraseña incorrectos' });
        }
    });
});

// **** VERIFICAR SI EL USUARIO ESTA LOGUEADO POR IP ****
app.get('/api/verificarusuario', (req, res) => {
    const { IP } = req.query;
    if (!IP) {
        return res.json({ loggedIn: false });
    }

    db.get('SELECT HABILITADO, CONECTADO FROM USUARIOS WHERE IP_User = ?', [IP], (err, row) => {
        if (err) {
            console.error("Error al consultar la base de datos:", err.message);
            return res.json({ loggedIn: false });
        }

        if (row && row.HABILITADO === 1 && row.CONECTADO === 1) {
            return res.json({ loggedIn: true });
        } else {
            return res.json({ loggedIn: false });
        }
    });
});

// Seguimiento de la sesión
app.get('/api/debug', (req, res) => {
    console.log('Debug session:', req.session);
    res.json({ session: req.session });
});

// Iniciar servidor HTTPS
https.createServer(options, app).listen(PORT, () => {
    console.log(`Servidor HTTPS escuchando en https://localhost:${PORT}`);
});

// ****LOGOUT USUARIOS****
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});
