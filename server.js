const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configura el middleware para poder recibir datos en JSON
app.use(express.json());

// Conexión a la base de datos SQLite
let db = new sqlite3.Database('./analytics.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
    }
});

// Ejemplo de ruta para probar la conexión
app.get('/', (req, res) => {
    res.send('¡Servidor en funcionamiento!');
});

// API de prueba para consultar la base de datos
app.get('/api/test', (req, res) => {
    db.serialize(() => {
        db.each(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'`, (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ tables: row.count });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Cerrar la conexión de la base de datos al cerrar el servidor
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Cerrando la conexión con la base de datos.');
        process.exit(0);
    });
});

// *** Ruta para registrar la conexión de un usuario ***
app.post('/api/register-connection', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP: ", IP);
    
    let fecha = new Date();
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'POST: IP no proporcionada' });
    }

    db.get('SELECT * FROM USUARIOS WHERE IP_USER = ?', [IP], (err, row) => {
        if (err) {
            console.log("ERROR EN EL SERVIDOR: ", err);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (row) {
            // Si ya existe un registro para esta IP, marcar como conectado
            console.log("FECHA UPDATE", formattedDate);
            db.run(`UPDATE USUARIOS SET VIVO = TRUE, Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
                if (err) {
                    console.log("ERROR AL REGISTRAR CONEXION UPDATE: ", err);
                    return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                }
                console.log("REGISTRAR CONEXION OK");
                return res.json({ success: true });
            });
        } else {
            // Si la IP no existe, crear un nuevo usuario anónimo
            console.log("FECHA INSERT: ", formattedDate);
            db.run(`INSERT INTO USUARIOS (USER, IP_USER, VIVO, Fecha_VIVO) VALUES (?, ?, ?, ?)`, ['Anónimo', IP, true, formattedDate], function(err) {
                if (err) {
                    console.log("ERROR AL REGISTRAR CONEXION INSERT: ", err);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }
                console.log("NUEVA IP");
                return res.json({ success: true });
            });
        }
    });
});
