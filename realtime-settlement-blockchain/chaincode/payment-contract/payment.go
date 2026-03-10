// =============================================================================
// Payment Smart Contract - Manages bank settlement accounts
// =============================================================================
// This chaincode handles the cash/payment leg of DvP settlement.
// It manages settlement accounts with create, credit, debit, transfer,
// and query operations.
// =============================================================================

package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// BankAccount represents a settlement cash account on the ledger.
// Key: accountID (e.g., "brokerA_cash")
type BankAccount struct {
	DocType   string `json:"docType"`   // "bankAccount" — for CouchDB rich queries
	AccountID string `json:"accountID"` // Unique account identifier
	Owner     string `json:"owner"`     // Account owner (e.g., brokerA)
	Balance   int    `json:"balance"`   // Balance in smallest currency unit (paise)
}

// PaymentContract provides functions for managing settlement accounts.
type PaymentContract struct {
	contractapi.Contract
}

// =============================================================================
// CreateAccount creates a new settlement account with an initial balance.
// =============================================================================
func (p *PaymentContract) CreateAccount(ctx contractapi.TransactionContextInterface,
	accountID string, owner string, initialBalance int) error {

	if initialBalance < 0 {
		return fmt.Errorf("initial balance must be non-negative, got %d", initialBalance)
	}

	// Check for duplicates
	existing, err := ctx.GetStub().GetState(accountID)
	if err != nil {
		return fmt.Errorf("failed to read ledger: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("account %s already exists", accountID)
	}

	account := BankAccount{
		DocType:   "bankAccount",
		AccountID: accountID,
		Owner:     owner,
		Balance:   initialBalance,
	}

	accountJSON, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %v", err)
	}

	return ctx.GetStub().PutState(accountID, accountJSON)
}

// =============================================================================
// CreditAccount adds funds to an existing account.
// =============================================================================
func (p *PaymentContract) CreditAccount(ctx contractapi.TransactionContextInterface,
	accountID string, amount int) error {

	if amount <= 0 {
		return fmt.Errorf("credit amount must be positive, got %d", amount)
	}

	account, err := p.getAccount(ctx, accountID)
	if err != nil {
		return err
	}

	account.Balance += amount

	return p.putAccount(ctx, account)
}

// =============================================================================
// DebitAccount removes funds from an existing account.
// =============================================================================
func (p *PaymentContract) DebitAccount(ctx contractapi.TransactionContextInterface,
	accountID string, amount int) error {

	if amount <= 0 {
		return fmt.Errorf("debit amount must be positive, got %d", amount)
	}

	account, err := p.getAccount(ctx, accountID)
	if err != nil {
		return err
	}

	if account.Balance < amount {
		return fmt.Errorf("insufficient funds: account %s has %d, attempted to debit %d",
			accountID, account.Balance, amount)
	}

	account.Balance -= amount

	return p.putAccount(ctx, account)
}

// =============================================================================
// TransferFunds atomically moves funds from one account to another.
// =============================================================================
func (p *PaymentContract) TransferFunds(ctx contractapi.TransactionContextInterface,
	fromAccountID string, toAccountID string, amount int) error {

	if amount <= 0 {
		return fmt.Errorf("transfer amount must be positive, got %d", amount)
	}

	fromAccount, err := p.getAccount(ctx, fromAccountID)
	if err != nil {
		return fmt.Errorf("sender account error: %v", err)
	}

	toAccount, err := p.getAccount(ctx, toAccountID)
	if err != nil {
		return fmt.Errorf("receiver account error: %v", err)
	}

	if fromAccount.Balance < amount {
		return fmt.Errorf("insufficient funds: account %s has %d, attempted to transfer %d",
			fromAccountID, fromAccount.Balance, amount)
	}

	fromAccount.Balance -= amount
	toAccount.Balance += amount

	err = p.putAccount(ctx, fromAccount)
	if err != nil {
		return fmt.Errorf("failed to update sender: %v", err)
	}

	return p.putAccount(ctx, toAccount)
}

// =============================================================================
// QueryBalance returns the balance of the specified account.
// =============================================================================
func (p *PaymentContract) QueryBalance(ctx contractapi.TransactionContextInterface,
	accountID string) (int, error) {

	account, err := p.getAccount(ctx, accountID)
	if err != nil {
		return 0, err
	}

	return account.Balance, nil
}

// =============================================================================
// GetBalance is a helper that returns balance or 0 if account doesn't exist.
// =============================================================================
func (p *PaymentContract) GetBalance(ctx contractapi.TransactionContextInterface,
	accountID string) (int, error) {

	accountJSON, err := ctx.GetStub().GetState(accountID)
	if err != nil {
		return 0, fmt.Errorf("failed to read ledger: %v", err)
	}
	if accountJSON == nil {
		return 0, nil
	}

	var account BankAccount
	err = json.Unmarshal(accountJSON, &account)
	if err != nil {
		return 0, fmt.Errorf("failed to unmarshal account: %v", err)
	}

	return account.Balance, nil
}

// =============================================================================
// Internal helpers
// =============================================================================
func (p *PaymentContract) getAccount(ctx contractapi.TransactionContextInterface,
	accountID string) (*BankAccount, error) {

	accountJSON, err := ctx.GetStub().GetState(accountID)
	if err != nil {
		return nil, fmt.Errorf("failed to read ledger: %v", err)
	}
	if accountJSON == nil {
		return nil, fmt.Errorf("account %s does not exist", accountID)
	}

	var account BankAccount
	err = json.Unmarshal(accountJSON, &account)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal account: %v", err)
	}

	return &account, nil
}

func (p *PaymentContract) putAccount(ctx contractapi.TransactionContextInterface,
	account *BankAccount) error {

	accountJSON, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %v", err)
	}

	return ctx.GetStub().PutState(account.AccountID, accountJSON)
}

// =============================================================================
// Main
// =============================================================================
func main() {
	chaincode, err := contractapi.NewChaincode(&PaymentContract{})
	if err != nil {
		log.Fatalf("Error creating payment chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Error starting payment chaincode: %v", err)
	}
}
