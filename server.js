const express = require('express');

let app = express();

let services = [];

function useService(svcName) {
    let service = require(`./services/${svcName}`);
    app.use(service.path, service.router);
    console.log('Service registered: %s', service.name);
    services.push(service);
}

useService('bovespa');
useService('timelock');

app.get('/', (req, res) => {
    let txt = 'Drizer HTTP Services\n\n';
    for(let service of services) {
        txt += `${service.path} -> ${service.name}\n`;
    }
    res.type('.txt').send(txt);
});

app.listen(3000, () => {
    console.log('Listening on port 3000');
});