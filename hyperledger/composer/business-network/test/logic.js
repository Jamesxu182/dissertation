/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'ie.tcd.network';
const simCardAssetType = 'SimCardAsset';
const simCardAssetNS = namespace + '.' + simCardAssetType;
const dataUsageAssetType = 'DataUsageAsset';
const dataUsageAssetNS = namespace + '.' + dataUsageAssetType;
const providerParticipantType = 'ProviderParticipant';
const providerParticipantNS = namespace + '.' + providerParticipantType;
const carrierParticipantType = 'CarrierParticipant';
const carrierParticipantNS = namespace + '.' + carrierParticipantType;

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice and Bob.
    const aliceCardName = 'alice';
    const bobCardName = 'bob';

    const vodafoneCardName = 'Vodafone';
    const tcdCardName = 'Trinity College Dublin';
    const ucdCardName = 'University College Dublin';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        const carrierParticipantRegistry = await businessNetworkConnection.getParticipantRegistry(carrierParticipantNS);
        // Create the participants.
        const vodafone = factory.newResource(namespace, carrierParticipantType, '1');
        vodafone.carrierName = 'Vodafone';

        carrierParticipantRegistry.add(vodafone);

        const providerParticipantRegistry = await businessNetworkConnection.getParticipantRegistry(providerParticipantNS);
        // Create the participants.
        const tcd = factory.newResource(namespace, providerParticipantType, '1');
        tcd.providerName = 'Trinity College Dublin';

        const ucd = factory.newResource(namespace, providerParticipantType, '2');
        ucd.providerName = 'Dublin College Dublin';

        providerParticipantRegistry.addAll([tcd, ucd]);

        // Create the assets.
        const simCardAssetRegistry = await businessNetworkConnection.getAssetRegistry(simCardAssetNS);
        const simCard = factory.newResource(namespace, simCardAssetType, '123456');
        simCard.carrier = factory.newRelationship(namespace, carrierParticipantType, '1');
        simCardAssetRegistry.add(simCard);

        const dataUsageAssetRegistry = await businessNetworkConnection.getAssetRegistry(dataUsageAssetNS);
        const dataUsage = factory.newResource(namespace, dataUsageAssetType, '1');
        dataUsage.simCard = factory.newRelationship(namespace, simCardAssetType, '123456');
        dataUsage.provider = factory.newRelationship(namespace, providerParticipantType, '1');
        dataUsage.usageValue = 10;
        dataUsageAssetRegistry.add(dataUsage);

        // Issue the identities.
        let identity = await businessNetworkConnection.issueIdentity(carrierParticipantNS + '#1', 'Vodafone');
        await importCardForIdentity(vodafoneCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(providerParticipantNS + '#1', 'Trinity College Dublin');
        await importCardForIdentity(tcdCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(providerParticipantNS + '#2', 'University College Dublin');
        await importCardForIdentity(ucdCardName, identity);
    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    it('University College Dublin add two data usages of 10 and 30 to SIM card with IMSI 123456', async () => {
        // Use the identity for UCD
        await useIdentity(ucdCardName);

        const dataUsageAssetRegistry = await businessNetworkConnection.getAssetRegistry(dataUsageAssetNS);

        let transaction = factory.newTransaction(namespace, 'AddDataUsageTransaction');
        transaction.simCard = factory.newRelationship(namespace, simCardAssetType, '123456');
        transaction.provider = factory.newRelationship(namespace, providerParticipantType, '2');
        transaction.addedUsageValue = 10;
        await businessNetworkConnection.submitTransaction(transaction);


        let dataUsageAsset = await dataUsageAssetRegistry.get('123456_2' );

        // 1st validate

        dataUsageAsset.usageId.should.equal('123456_2');
        dataUsageAsset.simCard.getFullyQualifiedIdentifier().should.equal(simCardAssetNS + '#123456');
        dataUsageAsset.provider.getFullyQualifiedIdentifier().should.equal(providerParticipantNS + '#2');
        dataUsageAsset.usageValue.should.equal(10);

        transaction = factory.newTransaction(namespace, 'AddDataUsageTransaction');
        transaction.simCard = factory.newRelationship(namespace, simCardAssetType, '123456');
        transaction.provider = factory.newRelationship(namespace, providerParticipantType, '2');
        transaction.addedUsageValue = 30;
        await businessNetworkConnection.submitTransaction(transaction);

        dataUsageAsset = await dataUsageAssetRegistry.get('123456_2' );

        // 2rd validate

        dataUsageAsset.usageId.should.equal('123456_2');
        dataUsageAsset.simCard.getFullyQualifiedIdentifier().should.equal(simCardAssetNS + '#123456');
        dataUsageAsset.provider.getFullyQualifiedIdentifier().should.equal(providerParticipantNS + '#2');
        dataUsageAsset.usageValue.should.equal(40);
    });

    it('Trinity creates data usage for simcard with IMSI 123456', async () => {
        // Use the identity for Trinity.
        await useIdentity(tcdCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'CreateDataUsageTransaction');
        transaction.usageId = '2';
        transaction.simCard = factory.newRelationship(namespace, simCardAssetType, '123456');
        transaction.provider = factory.newRelationship(namespace, providerParticipantType, '2');
        transaction.usageValue = 0;
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const dataUsageAssetRegistry = await businessNetworkConnection.getAssetRegistry(dataUsageAssetNS);
        const dataUsageAsset = await dataUsageAssetRegistry.get('2');

        // Validate the asset.
        dataUsageAsset.usageId.should.equal('2');
        dataUsageAsset.simCard.getFullyQualifiedIdentifier().should.equal(simCardAssetNS + '#123456');
        dataUsageAsset.provider.getFullyQualifiedIdentifier().should.equal(providerParticipantNS + '#2');
        dataUsageAsset.usageValue.should.equal(0);
    });

    it('Trinity updates data usage for simcard with IMSI 123456 to usage value of 10', async () => {
        // Use the identity for Trinity.
        await useIdentity(tcdCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'UpdateDataUsageAssetTransaction');
        transaction.dataUsageAsset = factory.newRelationship(namespace, dataUsageAssetType, '1');
        transaction.newUsageValue = 10;
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset.
        const dataUsageAssetRegistry = await businessNetworkConnection.getAssetRegistry(dataUsageAssetNS);
        const dataUsageAsset = await dataUsageAssetRegistry.get('1');

        // Validate the asset.
        dataUsageAsset.usageId.should.equal('1');
        dataUsageAsset.simCard.getFullyQualifiedIdentifier().should.equal(simCardAssetNS + '#123456');
        dataUsageAsset.provider.getFullyQualifiedIdentifier().should.equal(providerParticipantNS + '#1');
        dataUsageAsset.usageValue.should.equal(10);
    });

    it('Trinity queries all data usage assets', async () => {
        // Use the identity for Trinity.
        await useIdentity(tcdCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'QueryAllDataUsageAssetsTransaction');
        await businessNetworkConnection.submitTransaction(transaction);

        events.should.have.lengthOf(1);
        let event = events[0];

        event.usages.should.have.lengthOf(1);
        let dataUsageAsset = event.usages[0];

        // validate
        dataUsageAsset.getFullyQualifiedIdentifier().should.equal(dataUsageAssetNS + '#1');
    });

    it('Trinity queries data usage assets with provider of Trinity', async () => {
        // Use the identity for Trinity.
        await useIdentity(tcdCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'QueryDataUsageAssetByProviderTransaction');
        transaction.provider = factory.newRelationship(namespace, providerParticipantType, '1');
        await businessNetworkConnection.submitTransaction(transaction);

        events.should.have.lengthOf(1);
        let event = events[0];

        // event.usages.should.have.lengthOf(1);
        // let dataUsageAsset = event.usages[0];

        // // validate
        // dataUsageAsset.getFullyQualifiedIdentifier().should.equal(dataUsageAssetNS + '#1');
    });

    it('Trinity queries data usage assets with provider of Trinity and sim card of 123456', async () => {
        // Use the identity for Trinity.
        await useIdentity(tcdCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'QueryDataUsageAssetByProviderAndSimCardTransaction');
        transaction.simCard = factory.newRelationship(namespace, simCardAssetType, '123456');
        transaction.provider = factory.newRelationship(namespace, providerParticipantType, '1');
        await businessNetworkConnection.submitTransaction(transaction);

        events.should.have.lengthOf(1);
        let event = events[0];

        // event.usages.should.have.lengthOf(1);
        // let dataUsageAsset = event.usages[0];

        // // validate
        // dataUsageAsset.getFullyQualifiedIdentifier().should.equal(dataUsageAssetNS + '#1');
    });
});
