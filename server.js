const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const admin = require("firebase-admin");

var serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://luichomillo-28552-default-rtdb.firebaseio.com"
});

// Habilitar CORS para tu dominio
app.use(cors({
    origin: 'https://luichomillo.freeddns.org', // Reemplaza esto con tu dominio
    credentials: true // Permitir el uso de cookies si es necesario
}));

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

// API de prueba para consultar la base de datos SQLITE3
app.get('/api/test', (req, res) => {
    db.all(`SELECT * FROM USUARIOS ORDER BY Fecha_VIVO DESC`, (err, rows) => {
	    if (err) {
        	return res.status(500).json({ error: err.message });
    	    } else {
        	// Formatea los datos JSON con una sangría de 2 espacios y envuelve en `<pre>` para buena legibilidad en el navegador
        	const formattedData = JSON.stringify(rows, null, 2);
        
        	return res.send(`<pre>${formattedData}</pre>`);
    	    }
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

// *** Ruta para registrar la conexión de un usuario *** SQLITE3 ***
app.post('/api/register-connection', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP: ", IP);
    
    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
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
            db.run(`UPDATE USUARIOS SET VIVO = TRUE, CONECTADO = TRUE, Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
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
            db.run(`INSERT INTO USUARIOS (USER, IP_USER, VIVO, CONECTADO, Fecha_VIVO) VALUES (?, ?, ?, ?, ?)`, ['Anónimo', IP, true, true, formattedDate], function(err) {
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

// *** CONTADOR DE CONEXIONES ***
app.get('/api/connections', (req, res) => {
	// const { conexiones } = req.body;

	let fecha = new Date();
	fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
	let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
	let formattedFecha = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

	db.get('SELECT COUNT(*) AS connections FROM USUARIOS WHERE VIVO = TRUE AND DATE(Fecha_VIVO) = ?', [formattedFecha], (err, row) => {
	    if (err) {
        	console.error('Error al obtener conexiones:', err.message); 
	        return res.status(500).json({ success: false, error: 'Error en el servidor' });
		console.log("error api/connections");
	    }
	    //console.log("Conns: ", row.connections);
	    return res.json({ connections: row.connections });
		
	    // si cantidad nueva es distinta de la anterior la modifico en Firebase
	    //console.log("conn ant.", conexiones, "conn actual", row.connections );
	    //if (row.connections!=conexiones) {
	    //	    CONN.set({ CANT: row.connections }, { merge: true })  // Actualizar el campo 'CANT' API/CONNECTIONS en Firebase
	    //	    console.log("connections enviadas a FIREBASE:",row.connections );
	    // };	
	});
	
	// *** ACA VOY A CONTROLAR CUANTO TIEMPO LLEVAN SIN HACER EL PING, MAS DE 10' LO DESCONECTO ***

	db.run(`UPDATE USUARIOS SET VIVO = FALSE WHERE VIVO = TRUE AND (strftime('%H',?)*60 + strftime('%M',?)) - (strftime('%H',Fecha_VIVO)*60 + strftime('%M',Fecha_VIVO)) > 10`, [formattedDate, formattedDate], function(err) {
        if (err) {
		console.log('Error al actualizar la base de datos');
        }
    });
});

// *** CONTADOR DE VISTAS TOTALES ***
app.get('/api/views', (req, res) => {
	// const { vistas } = req.body;

	let fecha = new Date();
	fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
	let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

    db.get('SELECT COUNT(*) AS views FROM USUARIOS WHERE DATE(Fecha_VIVO) = ?', [formattedDate], (err, row) => {
    	if (err) {
        	console.error('Error al obtener vistas:', err.message);  // Verificar errores
        	return res.status(500).json({ success: false, error: 'Error en el servidor' });
    	}
    	//console.log("views: ", row.views);
	return res.json({ views: row.views });
	    
	// si cantidad nueva es distinta de la anterior la modifico en Firebase
	//    console.log("vistas ant.", vistas, "vistas actual", row.views );
	//    if (row.views!=vistas) {
	//	    VIEWS.set({ CANT: row.views }, { merge: true })  // Actualizar el campo 'CANT' API/VIEWS en Firebase
	//	    console.log("views enviados a FIREBASE:", row.views );
	//	};
	});
});

// *** PING AL USUARIO PARA VERIFICAR DESCONEXION ***
app.post('/api/ping', (req, res) => {
    const { IP } = req.body;

    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    
    // Actualizar la última actividad del usuario en la base de datos
    db.run(`UPDATE USUARIOS SET Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
        if (err) {
            console.error('Error al actualizar Fecha_VIVO en el ping:', err.message);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }
	console.log(`Ping exitoso para IP ${IP}`);
        return res.json({ success: true });
    });
});

// ****LOGOUT USUARIOS****
app.post('/api/logout', (req, res) => {
    const { IP } = req.body;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    db.run(`UPDATE USUARIOS SET CONECTADO = FALSE, VIVO = FALSE WHERE IP_USER = ?`, [IP], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }
        console.log(`Usuario con IP ${IP} desconectado.`);
        return res.json({ success: true, message: "Usuario desconectado correctamente" });
    });
});

// *** API para verificar y desconectar usuarios inactivos ***
app.get('/api/verify-status', (req, res) => {
    const sql = `
        SELECT * FROM USUARIOS
        WHERE (CONECTADO = TRUE OR VIVO = TRUE)
        AND datetime(Fecha_VIVO) <= datetime('now', 'localtime', '-15 minutes')
    `;

    db.all(sql, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (rows.length > 0) {
            const updateSql = `UPDATE USUARIOS SET CONECTADO = FALSE, VIVO = FALSE 
                               WHERE (CONECTADO = TRUE OR VIVO = TRUE) 
                               AND datetime(Fecha_VIVO) <= datetime('now', 'localtime', '-15 minutes')`;
            db.run(updateSql, (updateErr) => {
                if (updateErr) {
                    return res.status(500).json({ error: updateErr.message });
                }
                console.log("Usuarios inactivos actualizados correctamente.");
                return res.json({ success: true, message: "Usuarios inactivos desconectados", inactiveUsers: rows });
            });
        } else {
            console.log("No hay usuarios inactivos");
            return res.json({ success: true, message: "No hay usuarios inactivos" });
        }
    });
});
	
// *** CHAT ***
app.post('/api/chat/send', (req, res) => {
    const { user, message } = req.body;

    if (!user || !message) {
        return res.status(400).json({ error: 'Usuario y mensaje son necesarios' });
    }

    const messageData = {
        user,
        message,
        timestamp: admin.firestore.Timestamp.now()
    };

    admin.firestore().collection('messages').add(messageData)
        .then(() => res.json({ success: true, message: 'Mensaje enviado' }))
        .catch((error) => res.status(500).json({ error: error.message }));
});

app.get('/api/chat/messages', (req, res) => {
    admin.firestore().collection('messages').orderBy('timestamp', 'desc').limit(50).get()
        .then(snapshot => {
            const messages = [];
            snapshot.forEach(doc => messages.push(doc.data()));
            res.json(messages);
        })
        .catch(error => res.status(500).json({ error: error.message }));
});

// *** Ruta para actualizar o insertar usuario ***
app.post('/api/user', (req, res) => {
    const { IP, USER } = req.body; // Obtener IP y USER del cuerpo de la solicitud

    if (!IP || !USER) {
        return res.status(400).json({ success: false, error: 'IP y USER son obligatorios' });
    }

    // Primero, intentamos actualizar al usuario existente
    db.run(`UPDATE USUARIOS SET USER = ? WHERE IP_USER = ?`, [USER, IP], function(err) {
        if (err) {
            console.error('Error al actualizar el usuario:', err.message);
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }

        // Verificamos si se actualizó alguna fila
        if (this.changes === 0) {
            // Si no se actualizó ninguna fila, insertemos un nuevo usuario
            db.run(`INSERT INTO USUARIOS (IP_USER, USER) VALUES (?, ?)`, [IP, USER], function(err) {
                if (err) {
                    console.error('Error al insertar el usuario:', err.message);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }

                return res.json({ success: true, message: 'Usuario insertado exitosamente' });
            });
        } else {
            // Si se actualizó, respondemos con un mensaje de éxito
            return res.json({ success: true, message: 'Usuario actualizado exitosamente' });
        }
    });
});

// *** Ruta para obtener usuarios conectados ***
app.post('/api/conectados', (req, res) => {
    // Verificar la IP del cliente
    const { IP } = req.body;  // Obtiene la IP del cliente
    console.log("IP recibida en el servidor:", req.body); // Añadir log para ver IP recibida
    const allowedIP = '190.244.137.138'; // Cambia esto por la IP de tu servidor

    if (IP !== allowedIP) {
	console.log("IP: ", IP, " Permitida: ", allowedIP)
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    // Obtener la fecha de hoy en formato YYYY-MM-DD
    let fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajustar a UTC-3
    let formattedDate = `${fechaHoy.getFullYear()}-${(fechaHoy.getMonth() + 1).toString().padStart(2, '0')}-${fechaHoy.getDate().toString().padStart(2, '0')}`;

    // Consultar la base de datos
    db.all(`SELECT * FROM USUARIOS WHERE DATE(Fecha_VIVO) = ? `, [ formattedDate ], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log("formattedDate: ", formattedDate, "rows: ", rows);
        // Filtrar por VIVO
        const conectados = rows.filter(row => row.VIVO === 1);
        const noConectados = rows.filter(row => row.VIVO === 0);
	
	console.log("conectados: ", conectados);
	console.log("noConectados: ", noConectados);
	    
        return res.json({ success: true, conectados, noConectados });
    });
});

// *** PRUEBA DE BASE DE DATOS MYSQL ***
const mysql = require('mysql');

const mysqlConnection = mysql.createConnection({
    host: 'sql10.freesqldatabase.com',
    user: 'sql10741803',
    password: 'Kth7BbalP2',
    database: 'sql10741803',
    port: 3306,
    connectTimeout: 10000 // Timeout de conexión de 10 segundos
});

mysqlConnection.connect((err) => {
    if (err) {
        console.error('Error al conectar con MySQL:', err.message);
        return;
    }
    console.log('Conexión a MySQL establecida');
});

const sqliteDb = new sqlite3.Database('./analytics.db');
app.get('/api/migrate-usuarios', (req, res) => {
    // Consultar todos los usuarios desde SQLite
    sqliteDb.all('SELECT USER, PASSW, HABILITADO, CATEGORIA, idUSER, IP_User, VIVO, Fecha_VIVO FROM Usuarios', (err, rows) => {
        if (err) {
            console.error("Error al consultar SQLite:", err.message);
            return res.status(500).json({ success: false, message: 'Error consultando SQLite', error: err.message });
        }

        // Variable para contar las inserciones exitosas y fallidas
        let successCount = 0;
        let failureCount = 0;

        // Insertar cada usuario en MySQL
        rows.forEach(row => {
            const query = `
                INSERT INTO Usuarios (USER, PASSW, HABILITADO, CATEGORIA, idUSER, IP_User, VIVO, Fecha_VIVO)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                PASSW = VALUES(PASSW), HABILITADO = VALUES(HABILITADO), CATEGORIA = VALUES(CATEGORIA), 
                IP_User = VALUES(IP_User), VIVO = VALUES(VIVO), Fecha_VIVO = VALUES(Fecha_VIVO)
            `;

            mysqlConnection.query(query, [
                row.USER,
                row.PASSW,
                row.HABILITADO,
                row.CATEGORIA,
                row.idUSER,
                row.IP_User,
                row.VIVO,
                row.Fecha_VIVO
            ], (err) => {
                if (err) {
                    failureCount++;
                    console.error('Error migrando usuario:', row.USER, err.message);
                } else {
                    successCount++;
                }
            });
        });

        // Esperar unos segundos para completar la migración antes de responder
        setTimeout(() => {
            res.json({
                success: true,
                message: 'Migración completa',
                details: {
                    inserted: successCount,
                    failed: failureCount
                }
            });
        }, 2000); // Ajustar el tiempo según la cantidad de datos
    });
});

// *** Ruta para actualizar o insertar usuario en MySQL ***
app.post('/api/usermysql', (req, res) => {
    const { IP, USER } = req.body; // Obtener IP y USER del cuerpo de la solicitud
    console.log("antes del update: IP ", IP, "USER ", USER);
    
    if (!IP || !USER) {
        return res.status(400).json({ success: false, error: 'IP y USER son obligatorios' });
    }

    const fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajustar a UTC-3
    const fechaVivo = fechaHoy.toISOString().slice(0, 19).replace('T', ' '); // Obtener fecha y hora actual en formato 'YYYY-MM-DD HH:MM:SS'
    	
    // Primero, intentamos actualizar al usuario existente
    const updateQuery = `UPDATE Usuarios SET USER = ?, VIVO = 1, FECHA_VIVO = ? WHERE IP_USER = ?`;
    mysqlConnection.query(updateQuery, [USER, fechaVivo, IP], (err, result) => {
        if (err) {
            console.error('Error al actualizar el usuario:', err.message);
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }

        // Verificamos si se actualizó alguna fila
        if (result.affectedRows === 0) {
            // Si no se actualizó ninguna fila, insertemos un nuevo usuario
            const insertQuery = `INSERT INTO Usuarios (IP_USER, USER, VIVO, FECHA_VIVO) VALUES (?, ?, 1, ?)`;
            mysqlConnection.query(insertQuery, [IP, USER, fechaVivo], (err) => {
                if (err) {
                    console.error('Error al insertar el usuario:', err.message);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }

                return res.json({ success: true, message: 'Usuario insertado exitosamente' });
            });
        } else {
            // Si se actualizó, respondemos con un mensaje de éxito
            return res.json({ success: true, message: 'Usuario actualizado exitosamente' });
        }
    });
});

// *** Registrar Conexión version MYSQL ***
app.post('/api/register-connection-mysql', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP:", IP);

    // Ajusta la fecha a UTC-3
    let fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3);
    let formattedDate = fechaHoy.toISOString().slice(0, 19).replace('T', ' ');

    if (!IP) {
        return res.status(400).json({ success: false, error: 'POST: IP no proporcionada' });
    }

    mysqlConnection.query('SELECT * FROM Usuarios WHERE IP_USER = ?', [IP], (err, results) => {
        if (err) {
            console.error("ERROR EN EL SERVIDOR:", err);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (results.length > 0) {
            // Si ya existe un registro para esta IP, marcar como conectado
            console.log("FECHA UPDATE:", formattedDate);
            mysqlConnection.query(
                `UPDATE Usuarios SET VIVO = 1, FECHA_VIVO = ? WHERE IP_USER = ?`,
                [formattedDate, IP],
                (err) => {
                    if (err) {
                        console.error("ERROR AL REGISTRAR CONEXION UPDATE:", err);
                        return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                    }
                    console.log("REGISTRAR CONEXION OK");
                    return res.json({ success: true });
                }
            );
        } else {
            // Si la IP no existe, crear un nuevo usuario anónimo
            console.log("FECHA INSERT:", formattedDate);
            mysqlConnection.query(
                `INSERT INTO Usuarios (USER, IP_USER, VIVO, FECHA_VIVO) VALUES (?, ?, ?, ?)`,
                ['Anónimo', IP, 1, formattedDate],
                (err) => {
                    if (err) {
                        console.error("ERROR AL REGISTRAR CONEXION INSERT:", err);
                        return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                    }
                    console.log("NUEVA IP");
                    return res.json({ success: true });
                }
            );
        }
    });
