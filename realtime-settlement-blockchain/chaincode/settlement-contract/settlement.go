// =============================================================================
// Settlement Smart Contract - Atomic Delivery-versus-Payment (DvP)
// =============================================================================
// This is the core settlement chaincode that orchestrates atomic DvP.
// It simultaneously transfers securities and funds in a single blockchain
// transaction, ensuring that if either leg fails, the entire transaction
// is rolled back.
//
// Settlement flow:
//   1. Verify buyer has sufficient funds
//   2. Verify seller has sufficient shares
//   3. Transfer shares from seller to buyer
//   4. Transfer funds from buyer to seller
//   5. Record trade as settled
//   6. Emit settlement event
// =============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// =============================================================================
// Data Models
// =============================================================================

// TradeRecord represents a trade submitted for settlement.
type TradeRecord struct {
	DocType       string `json:"docType"`       // "tradeRecord"
	TradeID       string `json:"tradeID"`       // Unique trade identifier
	Buyer         string `json:"buyer"`         // Buyer broker ID
	Seller        string `json:"seller"`        // Seller broker ID
	Symbol        string `json:"symbol"`        // Equity symbol
	Quantity      int    `json:"quantity"`       // Number of shares
	Price         int    `json:"price"`          // Price per share
	TradeValue    int    `json:"tradeValue"`     // Total trade value (qty * price)
	Status        string `json:"status"`         // "pending", "settled", "failed"
	SettledAt     string `json:"settledAt"`      // ISO timestamp of settlement
	FailureReason string `json:"failureReason"` // Reason if settlement failed
}

// SecurityAsset mirrors the securities contract's asset structure.
type SecurityAsset struct {
	DocType  string `json:"docType"`
	ID       string `json:"id"`
	Symbol   string `json:"symbol"`
	Owner    string `json:"owner"`
	Quantity int    `json:"quantity"`
}

// BankAccount mirrors the payment contract's account structure.
type BankAccount struct {
	DocType   string `json:"docType"`
	AccountID string `json:"accountID"`
	Owner     string `json:"owner"`
	Balance   int    `json:"balance"`
}

// SettlementEvent is emitted when a trade is settled.
type SettlementEvent struct {
	TradeID    string `json:"tradeID"`
	Buyer      string `json:"buyer"`
	Seller     string `json:"seller"`
	Symbol     string `json:"symbol"`
	Quantity   int    `json:"quantity"`
	TradeValue int    `json:"tradeValue"`
	Status     string `json:"status"`
	Timestamp  string `json:"timestamp"`
}

// SettlementContract provides the atomic DvP settlement function.
type SettlementContract struct {
	contractapi.Contract
}

// =============================================================================
// AtomicSettlement - Core DvP Settlement Function
// =============================================================================
// Executes simultaneous transfer of securities and funds in a single
// blockchain transaction. If any step fails, the entire transaction
// is rolled back by the Fabric transaction mechanism.
// =============================================================================
func (s *SettlementContract) AtomicSettlement(ctx contractapi.TransactionContextInterface,
	tradeID string, buyer string, seller string,
	symbol string, qty int, price int) error {

	// --- Input validation ---
	if tradeID == "" {
		return fmt.Errorf("tradeID cannot be empty")
	}
	if buyer == "" || seller == "" {
		return fmt.Errorf("buyer and seller cannot be empty")
	}
	if buyer == seller {
		return fmt.Errorf("buyer and seller cannot be the same party")
	}
	if qty <= 0 {
		return fmt.Errorf("quantity must be positive, got %d", qty)
	}
	if price <= 0 {
		return fmt.Errorf("price must be positive, got %d", price)
	}

	// --- Check for duplicate trade ---
	existingTradeJSON, err := ctx.GetStub().GetState(tradeID)
	if err != nil {
		return fmt.Errorf("failed to check existing trade: %v", err)
	}
	if existingTradeJSON != nil {
		return fmt.Errorf("trade %s already exists", tradeID)
	}

	tradeValue := qty * price

	// --- Derive account/asset keys ---
	buyerAccountID := fmt.Sprintf("%s_cash", buyer)
	sellerAccountID := fmt.Sprintf("%s_cash", seller)
	sellerSecurityID := fmt.Sprintf("%s_%s", symbol, seller)
	buyerSecurityID := fmt.Sprintf("%s_%s", symbol, buyer)

	// =========================================================================
	// Step 1: Verify buyer has sufficient funds
	// =========================================================================
	buyerAccountJSON, err := ctx.GetStub().GetState(buyerAccountID)
	if err != nil {
		return fmt.Errorf("failed to read buyer account: %v", err)
	}
	if buyerAccountJSON == nil {
		return s.recordFailedTrade(ctx, tradeID, buyer, seller, symbol, qty, price, tradeValue,
			"buyer account does not exist")
	}

	var buyerAccount BankAccount
	err = json.Unmarshal(buyerAccountJSON, &buyerAccount)
	if err != nil {
		return fmt.Errorf("failed to unmarshal buyer account: %v", err)
	}

	if buyerAccount.Balance < tradeValue {
		return s.recordFailedTrade(ctx, tradeID, buyer, seller, symbol, qty, price, tradeValue,
			fmt.Sprintf("insufficient funds: buyer has %d, needs %d", buyerAccount.Balance, tradeValue))
	}

	// =========================================================================
	// Step 2: Verify seller has sufficient shares
	// =========================================================================
	sellerSecurityJSON, err := ctx.GetStub().GetState(sellerSecurityID)
	if err != nil {
		return fmt.Errorf("failed to read seller securities: %v", err)
	}
	if sellerSecurityJSON == nil {
		return s.recordFailedTrade(ctx, tradeID, buyer, seller, symbol, qty, price, tradeValue,
			"seller does not own the requested security")
	}

	var sellerSecurity SecurityAsset
	err = json.Unmarshal(sellerSecurityJSON, &sellerSecurity)
	if err != nil {
		return fmt.Errorf("failed to unmarshal seller security: %v", err)
	}

	if sellerSecurity.Quantity < qty {
		return s.recordFailedTrade(ctx, tradeID, buyer, seller, symbol, qty, price, tradeValue,
			fmt.Sprintf("insufficient shares: seller has %d, needs %d", sellerSecurity.Quantity, qty))
	}

	// =========================================================================
	// Step 3: Transfer shares (seller → buyer)
	// =========================================================================
	sellerSecurity.Quantity -= qty

	// Get or create buyer security asset
	var buyerSecurity SecurityAsset
	buyerSecurityJSON, err := ctx.GetStub().GetState(buyerSecurityID)
	if err != nil {
		return fmt.Errorf("failed to read buyer securities: %v", err)
	}

	if buyerSecurityJSON == nil {
		buyerSecurity = SecurityAsset{
			DocType:  "securityAsset",
			ID:       buyerSecurityID,
			Symbol:   symbol,
			Owner:    buyer,
			Quantity: qty,
		}
	} else {
		err = json.Unmarshal(buyerSecurityJSON, &buyerSecurity)
		if err != nil {
			return fmt.Errorf("failed to unmarshal buyer security: %v", err)
		}
		buyerSecurity.Quantity += qty
	}

	// =========================================================================
	// Step 4: Transfer funds (buyer → seller)
	// =========================================================================
	buyerAccount.Balance -= tradeValue

	sellerAccountJSON, err := ctx.GetStub().GetState(sellerAccountID)
	if err != nil {
		return fmt.Errorf("failed to read seller account: %v", err)
	}
	if sellerAccountJSON == nil {
		return fmt.Errorf("seller account %s does not exist", sellerAccountID)
	}

	var sellerAccount BankAccount
	err = json.Unmarshal(sellerAccountJSON, &sellerAccount)
	if err != nil {
		return fmt.Errorf("failed to unmarshal seller account: %v", err)
	}

	sellerAccount.Balance += tradeValue

	// =========================================================================
	// Step 5: Commit all state updates
	// =========================================================================

	// Update seller securities
	sellerSecurityUpdated, _ := json.Marshal(sellerSecurity)
	err = ctx.GetStub().PutState(sellerSecurityID, sellerSecurityUpdated)
	if err != nil {
		return fmt.Errorf("failed to update seller securities: %v", err)
	}

	// Update buyer securities
	buyerSecurityUpdated, _ := json.Marshal(buyerSecurity)
	err = ctx.GetStub().PutState(buyerSecurityID, buyerSecurityUpdated)
	if err != nil {
		return fmt.Errorf("failed to update buyer securities: %v", err)
	}

	// Update buyer account
	buyerAccountUpdated, _ := json.Marshal(buyerAccount)
	err = ctx.GetStub().PutState(buyerAccountID, buyerAccountUpdated)
	if err != nil {
		return fmt.Errorf("failed to update buyer account: %v", err)
	}

	// Update seller account
	sellerAccountUpdated, _ := json.Marshal(sellerAccount)
	err = ctx.GetStub().PutState(sellerAccountID, sellerAccountUpdated)
	if err != nil {
		return fmt.Errorf("failed to update seller account: %v", err)
	}

	// =========================================================================
	// Step 6: Record trade as settled
	// =========================================================================
	now := time.Now().UTC().Format(time.RFC3339)

	trade := TradeRecord{
		DocType:    "tradeRecord",
		TradeID:    tradeID,
		Buyer:      buyer,
		Seller:     seller,
		Symbol:     symbol,
		Quantity:   qty,
		Price:      price,
		TradeValue: tradeValue,
		Status:     "settled",
		SettledAt:  now,
	}

	tradeJSON, err := json.Marshal(trade)
	if err != nil {
		return fmt.Errorf("failed to marshal trade record: %v", err)
	}

	err = ctx.GetStub().PutState(tradeID, tradeJSON)
	if err != nil {
		return fmt.Errorf("failed to save trade record: %v", err)
	}

	// =========================================================================
	// Emit settlement event
	// =========================================================================
	event := SettlementEvent{
		TradeID:    tradeID,
		Buyer:      buyer,
		Seller:     seller,
		Symbol:     symbol,
		Quantity:   qty,
		TradeValue: tradeValue,
		Status:     "settled",
		Timestamp:  now,
	}

	eventJSON, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal settlement event: %v", err)
	}

	err = ctx.GetStub().SetEvent("SettlementCompleted", eventJSON)
	if err != nil {
		return fmt.Errorf("failed to emit settlement event: %v", err)
	}

	return nil
}

// =============================================================================
// QueryTrade returns the trade record for a given trade ID.
// =============================================================================
func (s *SettlementContract) QueryTrade(ctx contractapi.TransactionContextInterface,
	tradeID string) (*TradeRecord, error) {

	tradeJSON, err := ctx.GetStub().GetState(tradeID)
	if err != nil {
		return nil, fmt.Errorf("failed to read trade: %v", err)
	}
	if tradeJSON == nil {
		return nil, fmt.Errorf("trade %s does not exist", tradeID)
	}

	var trade TradeRecord
	err = json.Unmarshal(tradeJSON, &trade)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal trade: %v", err)
	}

	return &trade, nil
}

// =============================================================================
// recordFailedTrade saves a failed trade record and returns an error.
// =============================================================================
func (s *SettlementContract) recordFailedTrade(ctx contractapi.TransactionContextInterface,
	tradeID, buyer, seller, symbol string, qty, price, tradeValue int,
	reason string) error {

	now := time.Now().UTC().Format(time.RFC3339)

	trade := TradeRecord{
		DocType:       "tradeRecord",
		TradeID:       tradeID,
		Buyer:         buyer,
		Seller:        seller,
		Symbol:        symbol,
		Quantity:      qty,
		Price:         price,
		TradeValue:    tradeValue,
		Status:        "failed",
		SettledAt:     now,
		FailureReason: reason,
	}

	tradeJSON, _ := json.Marshal(trade)
	ctx.GetStub().PutState(tradeID, tradeJSON)

	// Emit failure event
	event := SettlementEvent{
		TradeID:    tradeID,
		Buyer:      buyer,
		Seller:     seller,
		Symbol:     symbol,
		Quantity:   qty,
		TradeValue: tradeValue,
		Status:     "failed",
		Timestamp:  now,
	}
	eventJSON, _ := json.Marshal(event)
	ctx.GetStub().SetEvent("SettlementFailed", eventJSON)

	return fmt.Errorf("settlement failed for trade %s: %s", tradeID, reason)
}

// =============================================================================
// Main
// =============================================================================
func main() {
	chaincode, err := contractapi.NewChaincode(&SettlementContract{})
	if err != nil {
		log.Fatalf("Error creating settlement chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Error starting settlement chaincode: %v", err)
	}
}
