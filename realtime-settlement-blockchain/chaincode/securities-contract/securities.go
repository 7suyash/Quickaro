// =============================================================================
// Securities Smart Contract - Manages equity ownership on the blockchain
// =============================================================================
// This chaincode handles the securities (equity shares) leg of settlement.
// It provides functions to create, issue, transfer, and query securities.
// =============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SecurityAsset represents an equity holding on the ledger.
// Key format: "{Symbol}_{Owner}" (e.g., "RELIANCE_brokerA")
type SecurityAsset struct {
	DocType  string `json:"docType"`  // "securityAsset" — used for CouchDB rich queries
	ID       string `json:"id"`       // Composite key: Symbol_Owner
	Symbol   string `json:"symbol"`   // Equity symbol (e.g., RELIANCE, TCS, INFY)
	Owner    string `json:"owner"`    // Owner identifier (e.g., brokerA)
	Quantity int    `json:"quantity"` // Number of shares held
}

// SecuritiesContract provides functions for managing equity ownership.
type SecuritiesContract struct {
	contractapi.Contract
}

// =============================================================================
// CreateSecurity registers a new security asset on the ledger.
// =============================================================================
func (s *SecuritiesContract) CreateSecurity(ctx contractapi.TransactionContextInterface,
	symbol string, owner string, quantity int) error {

	if quantity < 0 {
		return fmt.Errorf("quantity must be non-negative, got %d", quantity)
	}

	assetID := fmt.Sprintf("%s_%s", symbol, owner)

	// Check if asset already exists
	existing, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return fmt.Errorf("failed to read ledger: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("security asset %s already exists", assetID)
	}

	asset := SecurityAsset{
		DocType:  "securityAsset",
		ID:       assetID,
		Symbol:   symbol,
		Owner:    owner,
		Quantity: quantity,
	}

	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset: %v", err)
	}

	return ctx.GetStub().PutState(assetID, assetJSON)
}

// =============================================================================
// IssueShares adds additional shares to an existing security asset.
// =============================================================================
func (s *SecuritiesContract) IssueShares(ctx contractapi.TransactionContextInterface,
	symbol string, owner string, additionalQty int) error {

	if additionalQty <= 0 {
		return fmt.Errorf("additional quantity must be positive, got %d", additionalQty)
	}

	assetID := fmt.Sprintf("%s_%s", symbol, owner)

	assetJSON, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return fmt.Errorf("failed to read ledger: %v", err)
	}
	if assetJSON == nil {
		return fmt.Errorf("security asset %s does not exist", assetID)
	}

	var asset SecurityAsset
	err = json.Unmarshal(assetJSON, &asset)
	if err != nil {
		return fmt.Errorf("failed to unmarshal asset: %v", err)
	}

	asset.Quantity += additionalQty

	updatedJSON, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal updated asset: %v", err)
	}

	return ctx.GetStub().PutState(assetID, updatedJSON)
}

// =============================================================================
// TransferShares moves shares from one owner to another.
// Creates the receiver's asset if it doesn't exist.
// =============================================================================
func (s *SecuritiesContract) TransferShares(ctx contractapi.TransactionContextInterface,
	from string, to string, symbol string, quantity int) error {

	if quantity <= 0 {
		return fmt.Errorf("transfer quantity must be positive, got %d", quantity)
	}

	// --- Debit sender ---
	fromID := fmt.Sprintf("%s_%s", symbol, from)
	fromJSON, err := ctx.GetStub().GetState(fromID)
	if err != nil {
		return fmt.Errorf("failed to read sender asset: %v", err)
	}
	if fromJSON == nil {
		return fmt.Errorf("sender %s does not own %s", from, symbol)
	}

	var fromAsset SecurityAsset
	err = json.Unmarshal(fromJSON, &fromAsset)
	if err != nil {
		return fmt.Errorf("failed to unmarshal sender asset: %v", err)
	}

	if fromAsset.Quantity < quantity {
		return fmt.Errorf("insufficient shares: %s owns %d %s, attempted to transfer %d",
			from, fromAsset.Quantity, symbol, quantity)
	}

	fromAsset.Quantity -= quantity

	// --- Credit receiver ---
	toID := fmt.Sprintf("%s_%s", symbol, to)
	toJSON, err := ctx.GetStub().GetState(toID)
	if err != nil {
		return fmt.Errorf("failed to read receiver asset: %v", err)
	}

	var toAsset SecurityAsset
	if toJSON == nil {
		// Create new asset for receiver
		toAsset = SecurityAsset{
			DocType:  "securityAsset",
			ID:       toID,
			Symbol:   symbol,
			Owner:    to,
			Quantity: quantity,
		}
	} else {
		err = json.Unmarshal(toJSON, &toAsset)
		if err != nil {
			return fmt.Errorf("failed to unmarshal receiver asset: %v", err)
		}
		toAsset.Quantity += quantity
	}

	// --- Commit both updates ---
	fromUpdatedJSON, err := json.Marshal(fromAsset)
	if err != nil {
		return fmt.Errorf("failed to marshal sender asset: %v", err)
	}
	err = ctx.GetStub().PutState(fromID, fromUpdatedJSON)
	if err != nil {
		return fmt.Errorf("failed to update sender asset: %v", err)
	}

	toUpdatedJSON, err := json.Marshal(toAsset)
	if err != nil {
		return fmt.Errorf("failed to marshal receiver asset: %v", err)
	}

	return ctx.GetStub().PutState(toID, toUpdatedJSON)
}

// =============================================================================
// QuerySecurityOwner returns the security asset for a given symbol and owner.
// =============================================================================
func (s *SecuritiesContract) QuerySecurityOwner(ctx contractapi.TransactionContextInterface,
	symbol string, owner string) (*SecurityAsset, error) {

	assetID := fmt.Sprintf("%s_%s", symbol, owner)

	assetJSON, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return nil, fmt.Errorf("failed to read ledger: %v", err)
	}
	if assetJSON == nil {
		return nil, fmt.Errorf("security asset %s does not exist", assetID)
	}

	var asset SecurityAsset
	err = json.Unmarshal(assetJSON, &asset)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal asset: %v", err)
	}

	return &asset, nil
}

// =============================================================================
// GetShares is a helper that returns the quantity of shares held.
// Returns 0 if the asset does not exist (no error).
// =============================================================================
func (s *SecuritiesContract) GetShares(ctx contractapi.TransactionContextInterface,
	owner string, symbol string) (int, error) {

	assetID := fmt.Sprintf("%s_%s", symbol, owner)

	assetJSON, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return 0, fmt.Errorf("failed to read ledger: %v", err)
	}
	if assetJSON == nil {
		return 0, nil
	}

	var asset SecurityAsset
	err = json.Unmarshal(assetJSON, &asset)
	if err != nil {
		return 0, fmt.Errorf("failed to unmarshal asset: %v", err)
	}

	return asset.Quantity, nil
}

// =============================================================================
// Main
// =============================================================================
func main() {
	chaincode, err := contractapi.NewChaincode(&SecuritiesContract{})
	if err != nil {
		log.Fatalf("Error creating securities chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Error starting securities chaincode: %v", err)
	}
}
