var RateLimit = require('express-rate-limit');
var Database = require('better-sqlite3');
var crypto = require('crypto');
var Router = require('express').Router;

var limiter1 = new RateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    delayMs: 0,
    headers: true,
});
var limiter2 = new RateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    delayMs: 0,
    headers: true,
});

const MAX_TIME = 31556926; // 1 ano
const db = new Database('locks.db');

let router = new Router();

router.get('/create', [limiter1], (req, res) => {
    if (typeof req.query.time !== 'string') {
        res.send({ error: true, message: 'Missing "time".' });
        return;
    }
    var time = parseInt(req.query.time);
    if (isNaN(time) || time < 60 || time > MAX_TIME) {
        res.send({ error: true, message: `Parameter "time" must be a number greater than 60 and lower than ${MAX_TIME}.` });
        return;
    }
    crypto.generateKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        }
    }, (err, publicKey, privateKey) => {
        if (err) {
            res.send({ error: true, message: `Error generating key.` });
        } else {
            var secret = crypto.randomBytes(20).toString('hex');
            var expires = Date.now() + time * 1000;
            db.prepare('insert into locks(secret,time,privateKey,created) values(?,?,?,?)').run(secret, expires, privateKey.toString('hex'), Date.now());
            res.send({
                error: false,
                id: secret,
                publicKey: publicKey,
                unlockTime: expires,
            });
        }
    });
});
router.get('/info', [limiter2], (req, res) => {
    if (typeof req.query.id !== 'string') {
        res.send({ error: true, message: 'Missing "id".' });
        return;
    }
    var exists = db.prepare('select * from locks where secret = ?').get(req.query.id);
    if (!exists) {
        res.send({ error: true, message: 'Lock not found.' });
        return;
    }
    var t = exists.time - Date.now();
    res.send({
        error: false,
        created: exists.created,
        locked: t > 0,
        remaining: t > 0 ? t / 1000 : 0,
    });
});
router.get('/release', [limiter2], (req, res) => {
    if (typeof req.query.id !== 'string') {
        res.send({ error: true, message: 'Missing "id".' });
        return;
    }
    var exists = db.prepare('select * from locks where secret = ?').get(req.query.id);
    if (!exists) {
        res.send({ error: true, message: 'Lock not found.' });
        return;
    }
    var t = exists.time - Date.now();
    if (t > 0) {
        res.send({
            error: true,
            privateKey: null,
            message: 'The lock cannot be released yet.',
            remaining: t / 1000,
        });
        return;
    }
    res.send({
        error: false,
        privateKey: exists.privateKey,
        message: 'Ok.',
        remaining: 0,
    });
});
router.get('/', (req, res) => {
    res.send(`
    <!doctype html>
    <head>
        <style>
            html, body {
                font-family: monospace;
                font-size:15px;
            }
            pre {
                background:#eee;
                padding:5px;
            }
        </style>
        <title>Time-lock encryption service</title>
    </head>
    <body>
            <h1>Time-lock encryption service</h1>
            <div>
                <h2>GET /lock/create</h2>
                Generate a RSA key pair and return the PUBLIC key.
                <h4>Param: time</h4>
                <small>The time in seconds until the private key is made available.</small>
                <div>
                    <br>
                    <pre style="display:block; margin:0">
GET /lock/create?time=3600

{"error":false,"id":...,"publicKey":"...","unlockTime":...}</pre>
                    <br>
                </div>
                <h2>GET /lock/release</h2>
                Get the PRIVATE key for lock ID created by /lock/create, fails if lock TIME has not passed yet.
                <h4>Param: id</h4>
                <small>The ID returned by /lock/create.</small>
                <div>
                    <br>
                    <pre style="display:block; margin:0">
GET /lock/release?id=...

{"error":false, "privateKey": ..., "remaining": ...}</pre>
                    <br>
                </div>
                <h2>GET /lock/info</h2>
                Get details about a lock.
                <h4>Param: id</h4>
                <small>The ID returned by /lock/create.</small>
                <div>
                    <br>
                    <pre style="display:block; margin:0">
GET /lock/info?id=...

{"error":false, "created": ..., "locked": ...., "remaining": ...}</pre>
                    <br>
                </div>
            </div>
        <br>
    </body>
    `);
});

db.prepare(`CREATE TABLE IF NOT EXISTS locks (
    id INTEGER UNIQUE NOT NULL PRIMARY KEY,
    secret TEXT UNIQUE NOT NULL,
    time INTEGER NOT NULL,
    created INTEGER NOT NULL,
    privateKey TEXT NOT NULL
)`).run();

module.exports = {
    path: '/lock',
    name: 'Cryptographic time-locks',
    router,
}