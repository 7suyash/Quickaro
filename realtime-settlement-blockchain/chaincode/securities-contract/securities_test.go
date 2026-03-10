// =============================================================================
// Securities Contract - Unit Tests
// =============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// mockTransactionContext wraps a mock stub into the contractapi interface.
type mockTransactionContext struct {
	contractapi.TransactionContext
	stub *shimtest.MockStub
}

func (m *mockTransactionContext) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func newMockCtx() *mockTransactionContext {
	stub := shimtest.NewMockStub("securities", nil)
	ctx := &mockTransactionContext{stub: stub}
	return ctx
}

func TestCreateSecurity(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	err := sc.CreateSecurity(ctx, "RELIANCE", "brokerA", 100)
	ctx.stub.MockTransactionEnd("tx1")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	// Verify state
	assetJSON := ctx.stub.State["RELIANCE_brokerA"]
	if assetJSON == nil {
		t.Fatal("expected asset to exist on ledger")
	}

	var asset SecurityAsset
	json.Unmarshal(assetJSON, &asset)

	if asset.Symbol != "RELIANCE" || asset.Owner != "brokerA" || asset.Quantity != 100 {
		t.Errorf("unexpected asset: %+v", asset)
	}
}

func TestCreateSecurityDuplicate(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	sc.CreateSecurity(ctx, "TCS", "brokerB", 50)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := sc.CreateSecurity(ctx, "TCS", "brokerB", 50)
	ctx.stub.MockTransactionEnd("tx2")

	if err == nil {
		t.Fatal("expected error for duplicate creation")
	}
}

func TestIssueShares(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	sc.CreateSecurity(ctx, "INFY", "brokerA", 100)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := sc.IssueShares(ctx, "INFY", "brokerA", 50)
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	var asset SecurityAsset
	json.Unmarshal(ctx.stub.State["INFY_brokerA"], &asset)

	if asset.Quantity != 150 {
		t.Errorf("expected 150 shares, got %d", asset.Quantity)
	}
}

func TestTransferShares(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	// Setup: brokerB owns 100 RELIANCE
	ctx.stub.MockTransactionStart("tx1")
	sc.CreateSecurity(ctx, "RELIANCE", "brokerB", 100)
	ctx.stub.MockTransactionEnd("tx1")

	// Transfer 60 shares from brokerB to brokerA
	ctx.stub.MockTransactionStart("tx2")
	err := sc.TransferShares(ctx, "brokerB", "brokerA", "RELIANCE", 60)
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	// Verify sender
	var sender SecurityAsset
	json.Unmarshal(ctx.stub.State["RELIANCE_brokerB"], &sender)
	if sender.Quantity != 40 {
		t.Errorf("sender expected 40 shares, got %d", sender.Quantity)
	}

	// Verify receiver
	var receiver SecurityAsset
	json.Unmarshal(ctx.stub.State["RELIANCE_brokerA"], &receiver)
	if receiver.Quantity != 60 {
		t.Errorf("receiver expected 60 shares, got %d", receiver.Quantity)
	}
}

func TestTransferSharesInsufficientShares(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	sc.CreateSecurity(ctx, "HDFC", "brokerA", 10)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := sc.TransferShares(ctx, "brokerA", "brokerB", "HDFC", 50)
	ctx.stub.MockTransactionEnd("tx2")

	if err == nil {
		t.Fatal("expected error for insufficient shares")
	}
}

func TestQuerySecurityOwner(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	sc.CreateSecurity(ctx, "RELIANCE", "brokerA", 100)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	asset, err := sc.QuerySecurityOwner(ctx, "RELIANCE", "brokerA")
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if asset.Quantity != 100 {
		t.Errorf("expected 100 shares, got %d", asset.Quantity)
	}
}

func TestQuerySecurityOwnerNotFound(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	ctx.stub.MockTransactionStart("tx1")
	_, err := sc.QuerySecurityOwner(ctx, "UNKNOWN", "nobody")
	ctx.stub.MockTransactionEnd("tx1")

	if err == nil {
		t.Fatal("expected error for non-existent asset")
	}
}

func TestGetShares(t *testing.T) {
	ctx := newMockCtx()
	sc := new(SecuritiesContract)

	// Non-existent: should return 0
	ctx.stub.MockTransactionStart("tx1")
	qty, err := sc.GetShares(ctx, "brokerX", "RELIANCE")
	ctx.stub.MockTransactionEnd("tx1")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if qty != 0 {
		t.Errorf("expected 0 shares, got %d", qty)
	}

	// Existing
	ctx.stub.MockTransactionStart("tx2")
	sc.CreateSecurity(ctx, "RELIANCE", "brokerA", 200)
	ctx.stub.MockTransactionEnd("tx2")

	ctx.stub.MockTransactionStart("tx3")
	qty, err = sc.GetShares(ctx, "brokerA", "RELIANCE")
	ctx.stub.MockTransactionEnd("tx3")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if qty != 200 {
		t.Errorf("expected 200 shares, got %d", qty)
	}
}

// Suppress unused import warnings
var _ = fmt.Sprintf
