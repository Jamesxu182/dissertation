#!/usr/bin/sh

if [ -d crypto-config ]
then
    rm -rf crypto-config
fi

cryptogen generate --config=./crypto-config.yaml

if [ -f composer-genesis.block ]
then
    rm composer-genesis.block
fi

configtxgen -profile ComposerOrdererGenesis -outputBlock ./composer-genesis.block

if [ -f composer-channel.tx ]
then
    rm composer-channnel.tx
fi

configtxgen -profile ComposerChannel -outputCreateChannelTx ./composer-channel.tx -channelID composerchannel
