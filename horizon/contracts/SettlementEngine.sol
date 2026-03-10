// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
// SettlementEngine.sol
// PURPOSE: Orchestrates Delivery vs Payment (DvP) atomic settlement.
// A trade is created, confirmed, and then settled in one atomic transaction.
// This is a simulation contract for educational purposes only.
// DO NOT use with real financial systems or real money.
// ============================================================

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SettlementEngine {
    // Possible states of a trade
    enum TradeStatus { Created, Confirmed, Settled }

    // Trade data structure
    struct Trade {
        uint256 tradeId;
        address buyer;
        address seller;
        uint256 assetAmount;    // Amount of BOND tokens to transfer from seller to buyer
        uint256 paymentAmount;  // Amount of SET tokens to transfer from buyer to seller
        TradeStatus status;
    }

    // References to the ERC-20 token contracts
    IERC20 public assetToken;
    IERC20 public paymentToken;

    // Trade counter to generate unique IDs
    uint256 private tradeCounter;

    // Maps tradeId => Trade
    mapping(uint256 => Trade) public trades;

    // Array of all trade IDs for enumeration
    uint256[] public tradeIds;

    // Events emitted throughout the trade lifecycle
    event TradeCreated(uint256 indexed tradeId, address indexed buyer, address indexed seller);
    event TradeConfirmed(uint256 indexed tradeId);
    event TradeSettled(uint256 indexed tradeId);

    /**
     * @dev Constructor sets the addresses of the two ERC-20 token contracts.
     * @param _assetToken   Address of AssetContract (BOND token)
     * @param _paymentToken Address of PaymentToken (SET token)
     */
    constructor(address _assetToken, address _paymentToken) {
        assetToken = IERC20(_assetToken);
        paymentToken = IERC20(_paymentToken);
    }

    /**
     * @dev Creates a new pending trade.
     * The caller is the BUYER; the other party is the seller.
     * @param seller        Address of the seller
     * @param assetAmount   Amount of BOND tokens the seller will deliver
     * @param paymentAmount Amount of SET tokens the buyer will pay
     */
    function createTrade(
        address seller,
        uint256 assetAmount,
        uint256 paymentAmount
    ) external returns (uint256) {
        require(seller != address(0), "Invalid seller address");
        require(assetAmount > 0, "Asset amount must be > 0");
        require(paymentAmount > 0, "Payment amount must be > 0");

        tradeCounter++;
        uint256 tradeId = tradeCounter;

        trades[tradeId] = Trade({
            tradeId: tradeId,
            buyer: msg.sender,
            seller: seller,
            assetAmount: assetAmount,
            paymentAmount: paymentAmount,
            status: TradeStatus.Created
        });

        tradeIds.push(tradeId);

        emit TradeCreated(tradeId, msg.sender, seller);
        return tradeId;
    }

    /**
     * @dev Confirms a trade. Must be called by the seller.
     * @param tradeId ID of the trade to confirm
     */
    function confirmTrade(uint256 tradeId) external {
        Trade storage trade = trades[tradeId];
        require(trade.tradeId != 0, "Trade does not exist");
        require(trade.status == TradeStatus.Created, "Trade not in Created state");
        require(msg.sender == trade.seller, "Only seller can confirm");

        trade.status = TradeStatus.Confirmed;
        emit TradeConfirmed(tradeId);
    }

    /**
     * @dev Settles a confirmed trade atomically.
     * Both the buyer and seller must have pre-approved this contract
     * to spend their respective tokens using the approve() function.
     *
     * Settlement atomically executes:
     *   BOND tokens: seller -> buyer (asset delivery)
     *   SET tokens:  buyer -> seller (payment)
     *
     * If either transfer fails, the entire transaction reverts.
     * @param tradeId ID of the trade to settle
     */
    function settleTrade(uint256 tradeId) external {
    Trade storage trade = trades[tradeId];

    require(trade.tradeId != 0, "Trade does not exist");
    require(trade.status == TradeStatus.Confirmed, "Trade not confirmed");

    // asset transfer
    bool assetTransferred = assetToken.transferFrom(
        trade.seller,
        trade.buyer,
        trade.assetAmount
    );
    require(assetTransferred, "Asset transfer failed");

    // payment transfer
    bool paymentTransferred = paymentToken.transferFrom(
        trade.buyer,
        trade.seller,
        trade.paymentAmount
    );
    require(paymentTransferred, "Payment transfer failed");

    trade.status = TradeStatus.Settled;

    emit TradeSettled(tradeId);
}

    /**
     * @dev Returns the total number of trades created.
     */
    function getTradeCount() external view returns (uint256) {
        return tradeCounter;
    }

    /**
     * @dev Returns all trade IDs for enumeration.
     */
    function getAllTradeIds() external view returns (uint256[] memory) {
        return tradeIds;
    }
}