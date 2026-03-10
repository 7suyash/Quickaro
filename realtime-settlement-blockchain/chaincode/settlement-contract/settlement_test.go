// =============================================================================
// Settlement Contract - Unit Tests
// =============================================================================

package main

import (
	"encoding/json"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type mockSettlementCtx struct {
	contractapi.TransactionContext
	stub *shimtest.MockStub
}

func (m *mockSettlementCtx) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func newMockSettlementCtx() *mockSettlementCtx {
	stub := shimtest.NewMockStub("settlement", nil)
	return &mockSettlementCtx{stub: stub}
}

// setupDemoState creates the initial state for the demo scenario:
// - BrokerA: ₹500,000 cash, 0 RELIANCE shares
// - BrokerB: ₹0 cash, 100 RELIANCE shares
func setupDemoState(ctx *mockSettlementCtx) {
	// BrokerA cash account
	brokerACash := BankAccount{
		DocType:   "bankAccount",
		AccountID: "brokerA_cash",
		Owner:     "brokerA",
		Balance:   500000,
	}
	brokerACashJSON, _ := json.Marshal(brokerACash)
	ctx.stub.State["brokerA_cash"] = brokerACashJSON

	// BrokerB cash account
	brokerBCash := BankAccount{
		DocType:   "bankAccount",
		AccountID: "brokerB_cash",
		Owner:     "brokerB",
		Balance:   0,
	}
	brokerBCashJSON, _ := json.Marshal(brokerBCash)
	ctx.stub.State["brokerB_cash"] = brokerBCashJSON

	// BrokerB RELIANCE shares
	brokerBShares := SecurityAsset{
		DocType:  "securityAsset",
		ID:       "RELIANCE_brokerB",
		Symbol:   "RELIANCE",
		Owner:    "brokerB",
		Quantity: 100,
	}
	brokerBSharesJSON, _ := json.Marshal(brokerBShares)
	ctx.stub.State["RELIANCE_brokerB"] = brokerBSharesJSON
}

func TestAtomicSettlementSuccess(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)
	setupDemoState(ctx)

	// Execute settlement: BrokerA buys 100 RELIANCE @ ₹2500
	ctx.stub.MockTransactionStart("tx1")
	err := sc.AtomicSettlement(ctx, "TX001", "brokerA", "brokerB", "RELIANCE", 100, 2500)
	ctx.stub.MockTransactionEnd("tx1")

	if err != nil {
		t.Fatalf("expected successful settlement, got: %v", err)
	}

	// Verify BrokerA now has 100 RELIANCE shares
	var buyerShares SecurityAsset
	json.Unmarshal(ctx.stub.State["RELIANCE_brokerA"], &buyerShares)
	if buyerShares.Quantity != 100 {
		t.Errorf("buyer expected 100 shares, got %d", buyerShares.Quantity)
	}

	// Verify BrokerB now has 0 RELIANCE shares
	var sellerShares SecurityAsset
	json.Unmarshal(ctx.stub.State["RELIANCE_brokerB"], &sellerShares)
	if sellerShares.Quantity != 0 {
		t.Errorf("seller expected 0 shares, got %d", sellerShares.Quantity)
	}

	// Verify BrokerA balance: 500000 - 250000 = 250000
	var buyerAccount BankAccount
	json.Unmarshal(ctx.stub.State["brokerA_cash"], &buyerAccount)
	if buyerAccount.Balance != 250000 {
		t.Errorf("buyer expected balance 250000, got %d", buyerAccount.Balance)
	}

	// Verify BrokerB balance: 0 + 250000 = 250000
	var sellerAccount BankAccount
	json.Unmarshal(ctx.stub.State["brokerB_cash"], &sellerAccount)
	if sellerAccount.Balance != 250000 {
		t.Errorf("seller expected balance 250000, got %d", sellerAccount.Balance)
	}

	// Verify trade record
	var trade TradeRecord
	json.Unmarshal(ctx.stub.State["TX001"], &trade)
	if trade.Status != "settled" {
		t.Errorf("expected trade status 'settled', got '%s'", trade.Status)
	}
	if trade.TradeValue != 250000 {
		t.Errorf("expected trade value 250000, got %d", trade.TradeValue)
	}
}

func TestAtomicSettlementInsufficientFunds(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)
	setupDemoState(ctx)

	// BrokerA only has 500000, but trying to buy at a price that exceeds it
	ctx.stub.MockTransactionStart("tx1")
	err := sc.AtomicSettlement(ctx, "TX002", "brokerA", "brokerB", "RELIANCE", 100, 10000)
	ctx.stub.MockTransactionEnd("tx1")

	if err == nil {
		t.Fatal("expected error for insufficient funds")
	}

	// Verify trade recorded as failed
	var trade TradeRecord
	json.Unmarshal(ctx.stub.State["TX002"], &trade)
	if trade.Status != "failed" {
		t.Errorf("expected trade status 'failed', got '%s'", trade.Status)
	}

	// Verify no state changes to securities or accounts
	var sellerShares SecurityAsset
	json.Unmarshal(ctx.stub.State["RELIANCE_brokerB"], &sellerShares)
	if sellerShares.Quantity != 100 {
		t.Errorf("seller shares should remain 100, got %d", sellerShares.Quantity)
	}
}

func TestAtomicSettlementInsufficientShares(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)
	setupDemoState(ctx)

	// BrokerB only has 100 shares, trying to sell 200
	ctx.stub.MockTransactionStart("tx1")
	err := sc.AtomicSettlement(ctx, "TX003", "brokerA", "brokerB", "RELIANCE", 200, 2500)
	ctx.stub.MockTransactionEnd("tx1")

	if err == nil {
		t.Fatal("expected error for insufficient shares")
	}

	// Verify trade recorded as failed
	var trade TradeRecord
	json.Unmarshal(ctx.stub.State["TX003"], &trade)
	if trade.Status != "failed" {
		t.Errorf("expected trade status 'failed', got '%s'", trade.Status)
	}
}

func TestAtomicSettlementDuplicateTrade(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)
	setupDemoState(ctx)

	// First settlement
	ctx.stub.MockTransactionStart("tx1")
	sc.AtomicSettlement(ctx, "TX004", "brokerA", "brokerB", "RELIANCE", 10, 2500)
	ctx.stub.MockTransactionEnd("tx1")

	// Attempt duplicate
	ctx.stub.MockTransactionStart("tx2")
	err := sc.AtomicSettlement(ctx, "TX004", "brokerA", "brokerB", "RELIANCE", 10, 2500)
	ctx.stub.MockTransactionEnd("tx2")

	if err == nil {
		t.Fatal("expected error for duplicate trade ID")
	}
}

func TestAtomicSettlementInvalidInputs(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)

	tests := []struct {
		name    string
		tradeID string
		buyer   string
		seller  string
		symbol  string
		qty     int
		price   int
	}{
		{"empty tradeID", "", "brokerA", "brokerB", "RELIANCE", 100, 2500},
		{"empty buyer", "TX", "", "brokerB", "RELIANCE", 100, 2500},
		{"same buyer seller", "TX", "brokerA", "brokerA", "RELIANCE", 100, 2500},
		{"zero quantity", "TX", "brokerA", "brokerB", "RELIANCE", 0, 2500},
		{"negative price", "TX", "brokerA", "brokerB", "RELIANCE", 100, -1},
	}

	for _, tc := range tests {
		ctx.stub.MockTransactionStart("tx")
		err := sc.AtomicSettlement(ctx, tc.tradeID, tc.buyer, tc.seller, tc.symbol, tc.qty, tc.price)
		ctx.stub.MockTransactionEnd("tx")

		if err == nil {
			t.Errorf("test '%s': expected error, got nil", tc.name)
		}
	}
}

func TestQueryTrade(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)
	setupDemoState(ctx)

	// Execute settlement first
	ctx.stub.MockTransactionStart("tx1")
	sc.AtomicSettlement(ctx, "TX005", "brokerA", "brokerB", "RELIANCE", 50, 2500)
	ctx.stub.MockTransactionEnd("tx1")

	// Query the trade
	ctx.stub.MockTransactionStart("tx2")
	trade, err := sc.QueryTrade(ctx, "TX005")
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if trade.Status != "settled" {
		t.Errorf("expected settled, got %s", trade.Status)
	}
	if trade.Buyer != "brokerA" {
		t.Errorf("expected buyer brokerA, got %s", trade.Buyer)
	}
	if trade.TradeValue != 125000 {
		t.Errorf("expected trade value 125000, got %d", trade.TradeValue)
	}
}

func TestQueryTradeNotFound(t *testing.T) {
	ctx := newMockSettlementCtx()
	sc := new(SettlementContract)

	ctx.stub.MockTransactionStart("tx1")
	_, err := sc.QueryTrade(ctx, "NONEXISTENT")
	ctx.stub.MockTransactionEnd("tx1")

	if err == nil {
		t.Fatal("expected error for non-existent trade")
	}
}
