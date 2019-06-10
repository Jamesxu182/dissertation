const ipc = require('node-ipc');
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const ipconfigs = require('./config/iptable.json');
const AsyncLock = require('async-lock');

// ipc config
ipc.config.id = 'ns-3.sock';
ipc.config.appspace = '';
ipc.config.retry= 1500;
ipc.config.rawBuffer=true;
ipc.config.encoding='utf8';

// ip table
let iptable = {};
// let locktable = {};
let lock = new AsyncLock();

//
let namespace = 'ie.tcd.network';

// composer client config
let businessNetworkConnection = new BusinessNetworkConnection();
let cardName = 'TCD@business-network';

let invokeAddDataUsageTransaction = async (value, imsi) => {
    let key = imsi + '_1';
    lock.acquire(key, (done) => {
        businessNetworkConnection.connect(cardName).then((businessNetworkDefinition) => {
            let factory = businessNetworkDefinition.getFactory();
            let transaction = factory.newTransaction(namespace, 'AddDataUsageTransaction');
            transaction.simCard = factory.newRelationship(namespace, 'SimCardAsset', imsi);
            transaction.provider = factory.newRelationship(namespace, 'ProviderParticipant', '1');
            transaction.addedUsageValue = value;

            businessNetworkConnection.submitTransaction(transaction).then(() => {
                done();
                // businessNetworkConnection.disconnect().then(() => {
                    // done();
                // });
            }).catch((err) => {
                done(err);
            });
        }).catch((err) => {
            done(err);
        })
    }, (err, ret) => {
        console.log("lock release");
    });
}

let initIpTable = (configs) => {
    configs.forEach((config) => {
        iptable[config['ip']] = config['imsi'];
    });
}

let parseRawData = (data) => {
    let columns = data.toString('utf8').split('\t');

    let source = columns[0];
    let value = parseFloat(columns[2]);
    let imsi = iptable[source];

    invokeAddDataUsageTransaction(value, imsi);
}

businessNetworkConnection.on('event', (event) => {
    if(event.getType() == 'DataUsageAssetAddedEvent') {
        console.log(event.usage.getIdentifier());
    }
});


initIpTable(ipconfigs);

ipc.serve(
    function() {
        ipc.server.on(
            'data',
            function(data) {
                parseRawData(data);
            }
        );
    }
);

ipc.server.start();
