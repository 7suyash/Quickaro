# Architecture - Real-Time Settlement Blockchain

## Overview

This system implements a blockchain-based settlement layer for Indian stock markets using Hyperledger Fabric. It replaces the traditional T+1 settlement cycle with **real-time atomic settlement in 2–10 seconds**.

## Network Topology

```mermaid
graph TB
    subgraph "Hyperledger Fabric Network"
        O[Orderer<br/>Raft Consensus]
        
        subgraph "Settlement Channel"
            EP[Exchange Peer<br/>ExchangeMSP]
            BP[Broker Peer<br/>BrokerMSP]
            BKP[Bank Peer<br/>BankMSP]
            CP[Clearing Peer<br/>ClearingMSP]
            RP[Regulator Peer<br/>RegulatorMSP<br/>Read-Only]
        end
        
        CA1[CA: Exchange]
        CA2[CA: Broker]
        CA3[CA: Bank]
        CA4[CA: Clearing]
        CA5[CA: Regulator]
    end
    
    O --> EP
    O --> BP
    O --> BKP
    O --> CP
    O --> RP
    
    CA1 --> EP
    CA2 --> BP
    CA3 --> BKP
    CA4 --> CP
    CA5 --> RP
```

## Participants

| Participant            | MSP ID         | Role                                    | Port  |
|------------------------|----------------|-----------------------------------------|-------|
| Exchange               | ExchangeMSP    | Submits trades, endorses settlements    | 7051  |
| Broker                 | BrokerMSP      | Represents buy/sell parties             | 8051  |
| Bank                   | BankMSP        | Manages cash settlement accounts        | 9051  |
| Clearing Corporation   | ClearingMSP    | Validates clearing obligations          | 10051 |
| Regulator              | RegulatorMSP   | Read-only audit and compliance          | 11051 |

## Smart Contract Architecture

```mermaid
graph LR
    subgraph "Chaincode Layer"
        SC[Securities Contract]
        PC[Payment Contract]
        ST[Settlement Contract]
    end
    
    ST -->|Transfer Shares| SC
    ST -->|Transfer Funds| PC
    
    SC -->|Security Assets| L[(Fabric Ledger)]
    PC -->|Bank Accounts| L
    ST -->|Trade Records| L
```

### Securities Contract
Manages equity ownership records. Stores `SecurityAsset` objects keyed by `{Symbol}_{Owner}`.

**Functions:** `CreateSecurity`, `IssueShares`, `TransferShares`, `QuerySecurityOwner`, `GetShares`

### Payment Contract
Manages settlement cash accounts. Stores `BankAccount` objects keyed by account ID.

**Functions:** `CreateAccount`, `CreditAccount`, `DebitAccount`, `TransferFunds`, `QueryBalance`, `GetBalance`

### Settlement Contract (Atomic DvP)
Orchestrates simultaneous securities and cash transfer in a single atomic Fabric transaction.

**Core Function:** `AtomicSettlement(tradeID, buyer, seller, symbol, qty, price)`

## Technology Stack

| Component          | Technology              |
|--------------------|-------------------------|
| Blockchain         | Hyperledger Fabric 2.5  |
| Consensus          | Raft (etcdraft)         |
| Smart Contracts    | Go (contractapi)        |
| State Database     | CouchDB 3.3            |
| Client SDK         | Node.js (fabric-network)|
| Containerization   | Docker Compose          |
| Certificate Auth   | Fabric CA 1.5           |

## Security Model

- **Permissioned Network:** All participants are identified via X.509 certificates
- **MSP (Membership Service Provider):** Each organization has its own CA and MSP
- **TLS:** All communication is encrypted with TLS
- **Endorsement Policy:** Majority of organizations must endorse transactions
- **Regulator Access:** Read-only access for audit without write permissions
- **Atomic Transactions:** DvP settlement is atomic — both legs succeed or both fail
