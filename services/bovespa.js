const Router = require('express').Router;
const NodeCache = require('node-cache');
const request = require('request');
const moment = require('moment');

let cache = new NodeCache({
    stdTTL: 1800,
});

function getPreviousWorkday() {
    let workday = moment();
    let day = workday.day();
    let diff = 1;
    if (day == 0 || day == 1) {
        diff = day + 2;
    }
    return workday.subtract(diff, 'days').format('YYYY-MM-DD');
}

function getData(ticker) {
    console.log('(bovespa) GetTicker %s', ticker);
    return new Promise(async resolve => {
        request(`https://bovespa.nihey.org/api/quote/${ticker}/${getPreviousWorkday()}`, function (err, resp, body) {
            if (err || !body) return resolve(null);
            let json = JSON.parse(body);
            if (!json) return resolve(null);
            resolve(json);
        });
    });
}

let router = new Router();

router.get('/', (req, res) => {
    res.type('.txt').send('Drizer\'s bovespa ticker price service. Usage: /price/ticker1,ticker2...?noHeaders=[true|false]&failSafe=[true|false]&noCache=[true|false]&format=[csv|json]');
});
router.get('/:names', async (req, res) => {
    try {
        let table = [];
        let names = req.params.names.split(',').map(n => n.trim().toUpperCase()).filter(ticker => ticker.length > 0);
        let format = req.query.format || 'csv';
        let noHeaders = req.query.noHeaders === 'true';
        let failSafe = req.query.failSafe === 'true';
        let noCache = req.query.noCache === 'true';
        res.type('.txt');
        if (!names || !names.length) {
            res.send('Missing ticker.');
            return;
        }
        if (names.length > 30) {
            res.send('Too many tickers.');
            return;
        }
        for (let name of names) {
            let cachedPrice = cache.get(name);
            if (cachedPrice && !noCache) {
                if (failSafe && cachedPrice.match('not found')) {
                    table.push(0);
                    continue;
                }
                table.push(cachedPrice);
                continue;
            }
            let data = await getData(name);
            if (!data) {
                if (failSafe) {
                    table.push(0);
                    continue;
                }
                table.push(`Could not get data for ticker ${name}.`);
                continue;
            }
            data = data.preult;
            if (!data) {
                cache.set(name, `Ticker not found: ${name}`, 60);
                if (failSafe) {
                    table.push(0);
                    continue;
                }
                table.push(`Ticker not found: ${name}`);
                continue;
            }
            price = parseFloat(data).toFixed(2);
            cache.set(name, price);
            table.push(price);
        }
        res.send(format === 'csv' ? (noHeaders ? '' : names.join(',') + '\n') + table.join(',') : table);
    } catch (e) {
        console.log(e.stack);
        if (!res.headersSent) res.send('Error parsing data.');
    }
});

module.exports = {
    path: '/price',
    name: 'Bovespa (B3) Data Service',
    router,
}