// =============================================================================
// Payment Contract - Unit Tests
// =============================================================================

package main

import (
	"encoding/json"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type mockPaymentCtx struct {
	contractapi.TransactionContext
	stub *shimtest.MockStub
}

func (m *mockPaymentCtx) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func newMockPaymentCtx() *mockPaymentCtx {
	stub := shimtest.NewMockStub("payment", nil)
	return &mockPaymentCtx{stub: stub}
}

func TestCreateAccount(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	err := pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 500000)
	ctx.stub.MockTransactionEnd("tx1")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	accountJSON := ctx.stub.State["brokerA_cash"]
	if accountJSON == nil {
		t.Fatal("expected account to exist on ledger")
	}

	var account BankAccount
	json.Unmarshal(accountJSON, &account)

	if account.Balance != 500000 {
		t.Errorf("expected balance 500000, got %d", account.Balance)
	}
	if account.Owner != "brokerA" {
		t.Errorf("expected owner brokerA, got %s", account.Owner)
	}
}

func TestCreateAccountDuplicate(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 500000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 100000)
	ctx.stub.MockTransactionEnd("tx2")

	if err == nil {
		t.Fatal("expected error for duplicate account creation")
	}
}

func TestCreditAccount(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 100000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := pc.CreditAccount(ctx, "brokerA_cash", 50000)
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	var account BankAccount
	json.Unmarshal(ctx.stub.State["brokerA_cash"], &account)
	if account.Balance != 150000 {
		t.Errorf("expected balance 150000, got %d", account.Balance)
	}
}

func TestDebitAccount(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 100000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := pc.DebitAccount(ctx, "brokerA_cash", 30000)
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	var account BankAccount
	json.Unmarshal(ctx.stub.State["brokerA_cash"], &account)
	if account.Balance != 70000 {
		t.Errorf("expected balance 70000, got %d", account.Balance)
	}
}

func TestDebitAccountInsufficientFunds(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 10000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	err := pc.DebitAccount(ctx, "brokerA_cash", 50000)
	ctx.stub.MockTransactionEnd("tx2")

	if err == nil {
		t.Fatal("expected error for insufficient funds")
	}
}

func TestTransferFunds(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 500000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	pc.CreateAccount(ctx, "brokerB_cash", "brokerB", 0)
	ctx.stub.MockTransactionEnd("tx2")

	ctx.stub.MockTransactionStart("tx3")
	err := pc.TransferFunds(ctx, "brokerA_cash", "brokerB_cash", 250000)
	ctx.stub.MockTransactionEnd("tx3")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	var fromAccount BankAccount
	json.Unmarshal(ctx.stub.State["brokerA_cash"], &fromAccount)
	if fromAccount.Balance != 250000 {
		t.Errorf("sender expected 250000, got %d", fromAccount.Balance)
	}

	var toAccount BankAccount
	json.Unmarshal(ctx.stub.State["brokerB_cash"], &toAccount)
	if toAccount.Balance != 250000 {
		t.Errorf("receiver expected 250000, got %d", toAccount.Balance)
	}
}

func TestTransferFundsInsufficient(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 1000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	pc.CreateAccount(ctx, "brokerB_cash", "brokerB", 0)
	ctx.stub.MockTransactionEnd("tx2")

	ctx.stub.MockTransactionStart("tx3")
	err := pc.TransferFunds(ctx, "brokerA_cash", "brokerB_cash", 50000)
	ctx.stub.MockTransactionEnd("tx3")

	if err == nil {
		t.Fatal("expected error for insufficient funds in transfer")
	}
}

func TestQueryBalance(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	pc.CreateAccount(ctx, "brokerA_cash", "brokerA", 500000)
	ctx.stub.MockTransactionEnd("tx1")

	ctx.stub.MockTransactionStart("tx2")
	balance, err := pc.QueryBalance(ctx, "brokerA_cash")
	ctx.stub.MockTransactionEnd("tx2")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if balance != 500000 {
		t.Errorf("expected 500000, got %d", balance)
	}
}

func TestGetBalanceNonExistent(t *testing.T) {
	ctx := newMockPaymentCtx()
	pc := new(PaymentContract)

	ctx.stub.MockTransactionStart("tx1")
	balance, err := pc.GetBalance(ctx, "nonexistent")
	ctx.stub.MockTransactionEnd("tx1")

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if balance != 0 {
		t.Errorf("expected 0, got %d", balance)
	}
}
