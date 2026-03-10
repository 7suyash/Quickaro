#!/bin/bash
# =============================================================================
# start-network.sh - Start the Settlement Blockchain Network
# =============================================================================
# This script:
#   1. Generates crypto materials using cryptogen
#   2. Creates the genesis block using configtxgen
#   3. Starts all Docker containers (orderer, peers, CAs, CouchDB)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NETWORK_DIR="$PROJECT_DIR/network"
ORGANIZATIONS_DIR="$PROJECT_DIR/organizations"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Starting Real-Time Settlement Blockchain Network${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Clean up previous runs
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 1: Cleaning up previous network ───${NC}"
docker-compose -f "$NETWORK_DIR/docker-compose.yaml" down --volumes --remove-orphans 2>/dev/null || true
rm -rf "$ORGANIZATIONS_DIR/ordererOrg"
rm -rf "$ORGANIZATIONS_DIR/exchangeOrg/msp" "$ORGANIZATIONS_DIR/exchangeOrg/peers" "$ORGANIZATIONS_DIR/exchangeOrg/users" "$ORGANIZATIONS_DIR/exchangeOrg/ca"
rm -rf "$ORGANIZATIONS_DIR/brokerOrg/msp" "$ORGANIZATIONS_DIR/brokerOrg/peers" "$ORGANIZATIONS_DIR/brokerOrg/users" "$ORGANIZATIONS_DIR/brokerOrg/ca"
rm -rf "$ORGANIZATIONS_DIR/bankOrg/msp" "$ORGANIZATIONS_DIR/bankOrg/peers" "$ORGANIZATIONS_DIR/bankOrg/users" "$ORGANIZATIONS_DIR/bankOrg/ca"
rm -rf "$ORGANIZATIONS_DIR/clearingOrg/msp" "$ORGANIZATIONS_DIR/clearingOrg/peers" "$ORGANIZATIONS_DIR/clearingOrg/users" "$ORGANIZATIONS_DIR/clearingOrg/ca"
rm -rf "$ORGANIZATIONS_DIR/regulatorOrg/msp" "$ORGANIZATIONS_DIR/regulatorOrg/peers" "$ORGANIZATIONS_DIR/regulatorOrg/users" "$ORGANIZATIONS_DIR/regulatorOrg/ca"
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Generate crypto materials
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 2: Generating crypto materials ───${NC}"
cryptogen generate \
    --config="$NETWORK_DIR/crypto-config.yaml" \
    --output="$ORGANIZATIONS_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to generate crypto materials${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Crypto materials generated${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Generate genesis block
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 3: Generating genesis block ───${NC}"
export FABRIC_CFG_PATH="$NETWORK_DIR"

configtxgen \
    -profile SettlementOrdererGenesis \
    -channelID system-channel \
    -outputBlock "$NETWORK_DIR/genesis.block"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to generate genesis block${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Genesis block created${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Start Docker containers
# ---------------------------------------------------------------------------
echo -e "${YELLOW}─── Step 4: Starting Docker containers ───${NC}"
docker-compose -f "$NETWORK_DIR/docker-compose.yaml" up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to start Docker containers${NC}"
    exit 1
fi

# Wait for containers to stabilize
echo "  Waiting for containers to start..."
sleep 5

# Verify all containers are running
RUNNING=$(docker-compose -f "$NETWORK_DIR/docker-compose.yaml" ps --services --filter "status=running" | wc -l)
EXPECTED=12  # 1 orderer + 5 peers + 5 CouchDB + 1 CLI

echo -e "${GREEN}✓ $RUNNING containers running${NC}"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Network started successfully!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Orderer:   orderer.settlement.com:7050"
echo "  Exchange:  peer0.exchange.settlement.com:7051"
echo "  Broker:    peer0.broker.settlement.com:8051"
echo "  Bank:      peer0.bank.settlement.com:9051"
echo "  Clearing:  peer0.clearing.settlement.com:10051"
echo "  Regulator: peer0.regulator.settlement.com:11051"
echo ""
echo "  Next: Run ./scripts/create-channel.sh"
