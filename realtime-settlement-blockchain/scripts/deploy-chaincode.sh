#!/bin/bash
# =============================================================================
# deploy-chaincode.sh - Deploy All Smart Contracts
# =============================================================================
# This script deploys all three chaincodes to the settlement channel:
#   1. securities-contract
#   2. payment-contract
#   3. settlement-contract
#
# Uses the Fabric lifecycle: package → install → approve → commit
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CHAINCODE_DIR="$PROJECT_DIR/chaincode"
ORGANIZATIONS_DIR="$PROJECT_DIR/organizations"

CHANNEL_NAME="settlementchannel"
ORDERER_ADDRESS="localhost:7050"
ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrg/orderers/orderer.settlement.com/msp/tlscacerts/tlsca.settlement.com-cert.pem"
SEQUENCE=1

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deploying Smart Contracts to Settlement Channel${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ---------------------------------------------------------------------------
# Helper: Deploy a single chaincode
# ---------------------------------------------------------------------------
deploy_chaincode() {
    local CC_NAME=$1
    local CC_PATH=$2
    local CC_LABEL="${CC_NAME}_${SEQUENCE}"

    echo -e "${YELLOW}─── Deploying: $CC_NAME ───${NC}"

    # Step A: Package chaincode
    echo "  Packaging..."
    peer lifecycle chaincode package "${CC_NAME}.tar.gz" \
        --path "$CC_PATH" \
        --lang golang \
        --label "$CC_LABEL"
    echo -e "${GREEN}  ✓ Packaged${NC}"

    # Step B: Install on Exchange peer
    echo "  Installing on Exchange peer..."
    export CORE_PEER_LOCALMSPID="ExchangeMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"
    export CORE_PEER_ADDRESS="localhost:7051"
    peer lifecycle chaincode install "${CC_NAME}.tar.gz"

    # Install on Broker peer
    echo "  Installing on Broker peer..."
    export CORE_PEER_LOCALMSPID="BrokerMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/brokerOrg/peers/peer0.broker.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/brokerOrg/users/Admin@broker.settlement.com/msp"
    export CORE_PEER_ADDRESS="localhost:8051"
    peer lifecycle chaincode install "${CC_NAME}.tar.gz"

    # Install on Bank peer
    echo "  Installing on Bank peer..."
    export CORE_PEER_LOCALMSPID="BankMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/bankOrg/peers/peer0.bank.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/bankOrg/users/Admin@bank.settlement.com/msp"
    export CORE_PEER_ADDRESS="localhost:9051"
    peer lifecycle chaincode install "${CC_NAME}.tar.gz"

    # Install on Clearing peer
    echo "  Installing on Clearing peer..."
    export CORE_PEER_LOCALMSPID="ClearingMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/clearingOrg/peers/peer0.clearing.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/clearingOrg/users/Admin@clearing.settlement.com/msp"
    export CORE_PEER_ADDRESS="localhost:10051"
    peer lifecycle chaincode install "${CC_NAME}.tar.gz"

    echo -e "${GREEN}  ✓ Installed on all peers${NC}"

    # Step C: Get package ID
    export CORE_PEER_LOCALMSPID="ExchangeMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"
    export CORE_PEER_ADDRESS="localhost:7051"

    CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled --output json | \
        python3 -c "import sys,json; pkgs=json.load(sys.stdin)['installed_chaincodes']; print([p['package_id'] for p in pkgs if p['label']=='$CC_LABEL'][0])")

    echo "  Package ID: $CC_PACKAGE_ID"

    # Step D: Approve for each organization
    echo "  Approving for organizations..."

    # Approve for ExchangeOrg
    export CORE_PEER_LOCALMSPID="ExchangeMSP"
    export CORE_PEER_ADDRESS="localhost:7051"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"
    peer lifecycle chaincode approveformyorg \
        -o "$ORDERER_ADDRESS" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version 1.0 \
        --package-id "$CC_PACKAGE_ID" \
        --sequence $SEQUENCE \
        --tls \
        --cafile "$ORDERER_CA"

    # Approve for BrokerOrg
    export CORE_PEER_LOCALMSPID="BrokerMSP"
    export CORE_PEER_ADDRESS="localhost:8051"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/brokerOrg/peers/peer0.broker.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/brokerOrg/users/Admin@broker.settlement.com/msp"
    peer lifecycle chaincode approveformyorg \
        -o "$ORDERER_ADDRESS" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version 1.0 \
        --package-id "$CC_PACKAGE_ID" \
        --sequence $SEQUENCE \
        --tls \
        --cafile "$ORDERER_CA"

    # Approve for BankOrg
    export CORE_PEER_LOCALMSPID="BankMSP"
    export CORE_PEER_ADDRESS="localhost:9051"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/bankOrg/peers/peer0.bank.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/bankOrg/users/Admin@bank.settlement.com/msp"
    peer lifecycle chaincode approveformyorg \
        -o "$ORDERER_ADDRESS" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version 1.0 \
        --package-id "$CC_PACKAGE_ID" \
        --sequence $SEQUENCE \
        --tls \
        --cafile "$ORDERER_CA"

    # Approve for ClearingOrg
    export CORE_PEER_LOCALMSPID="ClearingMSP"
    export CORE_PEER_ADDRESS="localhost:10051"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/clearingOrg/peers/peer0.clearing.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/clearingOrg/users/Admin@clearing.settlement.com/msp"
    peer lifecycle chaincode approveformyorg \
        -o "$ORDERER_ADDRESS" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version 1.0 \
        --package-id "$CC_PACKAGE_ID" \
        --sequence $SEQUENCE \
        --tls \
        --cafile "$ORDERER_CA"

    echo -e "${GREEN}  ✓ Approved by all organizations${NC}"

    # Step E: Commit chaincode definition
    echo "  Committing chaincode definition..."
    export CORE_PEER_LOCALMSPID="ExchangeMSP"
    export CORE_PEER_ADDRESS="localhost:7051"
    export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"

    peer lifecycle chaincode commit \
        -o "$ORDERER_ADDRESS" \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version 1.0 \
        --sequence $SEQUENCE \
        --tls \
        --cafile "$ORDERER_CA" \
        --peerAddresses "localhost:7051" \
        --tlsRootCertFiles "$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt" \
        --peerAddresses "localhost:8051" \
        --tlsRootCertFiles "$ORGANIZATIONS_DIR/brokerOrg/peers/peer0.broker.settlement.com/tls/ca.crt" \
        --peerAddresses "localhost:9051" \
        --tlsRootCertFiles "$ORGANIZATIONS_DIR/bankOrg/peers/peer0.bank.settlement.com/tls/ca.crt" \
        --peerAddresses "localhost:10051" \
        --tlsRootCertFiles "$ORGANIZATIONS_DIR/clearingOrg/peers/peer0.clearing.settlement.com/tls/ca.crt"

    echo -e "${GREEN}  ✓ $CC_NAME committed to channel${NC}"
    echo ""

    # Cleanup package file
    rm -f "${CC_NAME}.tar.gz"
}

# ---------------------------------------------------------------------------
# Deploy all three chaincodes
# ---------------------------------------------------------------------------
export CORE_PEER_TLS_ENABLED=true

deploy_chaincode "securities-contract" "$CHAINCODE_DIR/securities-contract"
deploy_chaincode "payment-contract" "$CHAINCODE_DIR/payment-contract"
deploy_chaincode "settlement-contract" "$CHAINCODE_DIR/settlement-contract"

# ---------------------------------------------------------------------------
# Verify deployment
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Verifying Deployment ───${NC}"

export CORE_PEER_LOCALMSPID="ExchangeMSP"
export CORE_PEER_ADDRESS="localhost:7051"
export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/exchangeOrg/peers/peer0.exchange.settlement.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/exchangeOrg/users/Admin@exchange.settlement.com/msp"

peer lifecycle chaincode querycommitted --channelID "$CHANNEL_NAME" --output json

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ All smart contracts deployed successfully!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Deployed chaincodes:"
echo "    • securities-contract"
echo "    • payment-contract"
echo "    • settlement-contract"
echo ""
echo "  Next: Run 'node application/client-sdk/app.js'"
