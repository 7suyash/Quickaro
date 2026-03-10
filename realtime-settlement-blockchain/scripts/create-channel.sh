#!/bin/bash
# =============================================================================
# create-channel.sh - Create and Join the Settlement Channel
# =============================================================================
# This script:
#   1. Creates the 'settlementchannel' channel transaction
#   2. Creates the channel on the orderer
#   3. Joins all peer nodes to the channel
#   4. Sets anchor peers for each organization
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NETWORK_DIR="$PROJECT_DIR/network"
ORGANIZATIONS_DIR="$PROJECT_DIR/organizations"

CHANNEL_NAME="settlementchannel"
ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrg/orderers/orderer.settlement.com/msp/tlscacerts/tlsca.settlement.com-cert.pem"
ORDERER_ADDRESS="localhost:7050"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Creating Settlement Channel${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Generate channel creation transaction
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 1: Generate channel transaction ───${NC}"
export FABRIC_CFG_PATH="$NETWORK_DIR"

configtxgen \
    -profile SettlementChannel \
    -outputCreateChannelTx "$NETWORK_DIR/${CHANNEL_NAME}.tx" \
    -channelID "$CHANNEL_NAME"

echo -e "${GREEN}✓ Channel transaction generated${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Create channel
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 2: Create channel on orderer ───${NC}"

# Set Exchange peer environment
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="ExchangeMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"

peer channel create \
    -o "$ORDERER_ADDRESS" \
    -c "$CHANNEL_NAME" \
    -f "$NETWORK_DIR/${CHANNEL_NAME}.tx" \
    --outputBlock "$NETWORK_DIR/${CHANNEL_NAME}.block" \
    --tls \
    --cafile "$ORDERER_CA"

echo -e "${GREEN}✓ Channel '$CHANNEL_NAME' created${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Join peers to channel
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 3: Join peers to channel ───${NC}"

# Join Exchange peer
export CORE_PEER_LOCALMSPID="ExchangeMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
peer channel join -b "$NETWORK_DIR/${CHANNEL_NAME}.block"
echo -e "${GREEN}  ✓ Exchange peer joined${NC}"

# Join Broker peer
export CORE_PEER_LOCALMSPID="BrokerMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/brokerOrg/peers/peer0.broker.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/brokerOrg/users/Admin@broker.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:8051"
peer channel join -b "$NETWORK_DIR/${CHANNEL_NAME}.block"
echo -e "${GREEN}  ✓ Broker peer joined${NC}"

# Join Bank peer
export CORE_PEER_LOCALMSPID="BankMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/bankOrg/peers/peer0.bank.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/bankOrg/users/Admin@bank.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:9051"
peer channel join -b "$NETWORK_DIR/${CHANNEL_NAME}.block"
echo -e "${GREEN}  ✓ Bank peer joined${NC}"

# Join Clearing peer
export CORE_PEER_LOCALMSPID="ClearingMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/clearingOrg/peers/peer0.clearing.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/clearingOrg/users/Admin@clearing.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:10051"
peer channel join -b "$NETWORK_DIR/${CHANNEL_NAME}.block"
echo -e "${GREEN}  ✓ Clearing peer joined${NC}"

# Join Regulator peer
export CORE_PEER_LOCALMSPID="RegulatorMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/regulatorOrg/peers/peer0.regulator.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/regulatorOrg/users/Admin@regulator.settlement.com/msp"
export CORE_PEER_ADDRESS="localhost:11051"
peer channel join -b "$NETWORK_DIR/${CHANNEL_NAME}.block"
echo -e "${GREEN}  ✓ Regulator peer joined${NC}"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Channel '$CHANNEL_NAME' created and all peers joined!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Next: Run ./scripts/deploy-chaincode.sh"
