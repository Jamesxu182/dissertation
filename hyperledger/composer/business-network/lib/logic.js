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

/* global getAssetRegistry getFactory emit query */

/**
 * Write your transction processor functions here
 */

const namespace = 'ie.tcd.network';
const simCardAssetType = 'SimCardAsset';
const simCardAssetNS = namespace + '.' + simCardAssetType;
const dataUsageAssetType = 'DataUsageAsset';
const dataUsageAssetNS = namespace + '.' + dataUsageAssetType;
const providerParticipantType = 'ProviderParticipant';
const providerParticipantNS = namespace + '.' + providerParticipantType;
const carrierParticipantType = 'CarrierParticipant';
const carrierParticipantNS = namespace + '.' + carrierParticipantType;

/**
 * AddDataUsageTransaction transaction
 * @param {ie.tcd.network.AddDataUsageTransaction} addDataUsageTransaction
 * @transaction
 */
async function addDataUsageTransaction(tx) {
    let results = await query('selectDataUsageAssetByProviderAndSimCard', { provider: 'resource:' + tx.provider.getFullyQualifiedIdentifier(), simCard: 'resource:' + tx.simCard.getFullyQualifiedIdentifier() });

    const dataUsageAssetRegistry = await getAssetRegistry(dataUsageAssetNS);

    if(results.length < 1) {
        let usageId = tx.simCard.imsi + '_' + tx.provider.providerId;
        let newUsage = getFactory().newResource('ie.tcd.network', 'DataUsageAsset', usageId);
        newUsage.simCard = tx.simCard;
        newUsage.provider = tx.provider;
        newUsage.usageValue = tx.addedUsageValue;

        await dataUsageAssetRegistry.add(newUsage);
    } else {
        let existingUsage = results[0];
        existingUsage.usageValue += tx.addedUsageValue;

        await dataUsageAssetRegistry.update(existingUsage);
    }
}

/**
 * AddDataUsageTransaction transaction
 * @param {ie.tcd.network.CreateDataUsageTransaction} createDataUsageTransaction
 * @transaction
 */
async function createDataUsageAssetTransaction(tx) {
    // return getAssetRegistry('ie.tcd.network.DataUsageAsset').then(function(usageAssetRegistry) {
    //     var newUsage = getFactory().newResource('ie.tcd.network', 'DataUsageAsset', tx.usageId);
    //     newUsage.simCard = tx.simCard;
    //     newUsage.provider = tx.provider;
    //     newUsage.usageValue = tx.usageValue;
    //     return usageAssetRegistry.add(newUsage);
    // }).catch(function(error) {
    //     console.error(error);
    // });

    let newUsage = getFactory().newResource('ie.tcd.network', 'DataUsageAsset', tx.usageId);
    newUsage.simCard = tx.simCard;
    newUsage.provider = tx.provider;
    newUsage.usageValue = tx.usageValue;

    const dataUsageAssetRegistry = await getAssetRegistry(dataUsageAssetNS);
    await dataUsageAssetRegistry.add(newUsage);

    let dataUsageCreatedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetCreatedEvent');
    dataUsageCreatedEvent.usage = newUsage;
    emit(dataUsageCreatedEvent);
}

/**
 * UpdateDataUsageAssetTransaction transaction
 * @param {ie.tcd.network.UpdateDataUsageAssetTransaction} updateDataUsageAssetTransaction
 * @transaction
 */
async function updateDataUsageAssetTransaction(tx) {
    const newUsageValue = tx.newUsageValue;
    const oldUsageValue= tx.dataUsageAsset.usageValue;

    tx.dataUsageAsset.usageValue = tx.newUsageValue;
    const dataUsageAssetRegistry = await getAssetRegistry(dataUsageAssetNS);
    await dataUsageAssetRegistry.update(tx.dataUsageAsset);

    let dataUsageUpdatedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetUpdatedEvent');
    dataUsageUpdatedEvent.usage = tx.dataUsageAsset;
    dataUsageUpdatedEvent.oldUsageValue = oldUsageValue;
    dataUsageUpdatedEvent.newUsageValue = newUsageValue;

    emit(dataUsageUpdatedEvent);
}

/**
 * QueryAllDataUsageAssetsTransaction transaction
 * @param {ie.tcd.network.QueryAllDataUsageAssetsTransaction} queryAllDataUsageAssetsTransaction
 * @transaction
 */
async function queryAllDataUsageAssetsTransaction(tx) {
    let results = await query('selectDataUsageAsset');

    let dataUsageAssetQueriedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetQueriedEvent');
    dataUsageAssetQueriedEvent.length = results.length;
    dataUsageAssetQueriedEvent.usages = [];

    for(let n = 0; n < results.length; n++) {
        dataUsageAssetQueriedEvent.usages[n] = results[n];
    }
    emit(dataUsageAssetQueriedEvent);
}

/**
 * QueryDataUsageAssetByUsageIdTransaction transaction
 * @param {ie.tcd.network.QueryDataUsageAssetByUsageIdTransaction} queryDataUsageAssetByUsageIdTransaction
 * @transaction
 */
async function queryDataUsageAssetByUsageIdTransaction(tx) {
    let results = await query('selectDataUsageAssetByUsageId', { usageId: tx.usageId });

    let dataUsageAssetQueriedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetQueriedEvent');
    dataUsageAssetQueriedEvent.length = results.length;
    dataUsageAssetQueriedEvent.usages = [];

    for(let n = 0; n < results.length; n++) {
        dataUsageAssetQueriedEvent.usages[n] = results[n];
    }

    emit(dataUsageAssetQueriedEvent);
}

/**
 * QueryDataUsageAssetByProvider transaction
 * @param {ie.tcd.network.QueryDataUsageAssetByProviderTransaction} queryDataUsageAssetByProvider
 * @transaction
 */
async function queryDataUsageAssetByProviderTransaction(tx) {
    let results = await query('selectDataUsageAssetByProvider', { provider: 'resource:' + tx.provider.getFullyQualifiedIdentifier() });

    let dataUsageAssetQueriedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetQueriedEvent');
    dataUsageAssetQueriedEvent.length = results.length;
    dataUsageAssetQueriedEvent.usages = [];

    for(let n = 0; n < results.length; n++) {
        dataUsageAssetQueriedEvent.usages[n] = results[n];
    }

    emit(dataUsageAssetQueriedEvent);
}

/**
 * QueryDataUsageAssetBySimCardTransaction transaction
 * @param {ie.tcd.network.QueryDataUsageAssetBySimCardTransaction} queryDataUsageAssetBySimCardTransaction
 * @transaction
 */
async function queryDataUsageAssetBySimCardTransaction(tx) {
    let results = await query('selectDataUsageAssetBySimCard', { simCard: 'resource:' + tx.simCard.getFullyQualifiedIdentifier() });

    let dataUsageAssetQueriedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetQueriedEvent');
    dataUsageAssetQueriedEvent.length = results.length;
    dataUsageAssetQueriedEvent.usages = [];

    for(let n = 0; n < results.length; n++) {
        dataUsageAssetQueriedEvent.usages[n] = results[n];
    }

    emit(dataUsageAssetQueriedEvent);
}

/**
 * QueryDataUsageAssetByProviderAndSimCardTransaction transaction
 * @param {ie.tcd.network.QueryDataUsageAssetByProviderAndSimCardTransaction} queryDataUsageAssetByProviderAndSimCardTransaction
 * @transaction
 */
async function queryDataUsageAssetByProviderAndSimCardTransaction(tx) {
    let results = await query('selectDataUsageAssetByProviderAndSimCard', { provider: 'resource:' + tx.provider.getFullyQualifiedIdentifier(), simCard: 'resource:' + tx.simCard.getFullyQualifiedIdentifier() });

    let dataUsageAssetQueriedEvent = getFactory().newEvent('ie.tcd.network','DataUsageAssetQueriedEvent');
    dataUsageAssetQueriedEvent.length = results.length;
    dataUsageAssetQueriedEvent.usages = [];

    for(let n = 0; n < results.length; n++) {
        dataUsageAssetQueriedEvent.usages[n] = results[n];
    }

    emit(dataUsageAssetQueriedEvent);
}
