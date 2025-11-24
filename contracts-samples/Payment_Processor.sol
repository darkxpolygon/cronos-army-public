// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SoldierPaymentProcessorV2
 * @dev Handles CRO payments for Soldiers quota overage with enhanced security
 * @notice This is the security-enhanced version with reentrancy protection
 */
contract SoldierPaymentProcessorV2 is ReentrancyGuard {
    address public owner;
    address public pendingOwner; // For 2-step ownership transfer
    address public treasury;
    uint256 public jobPrice = 0.5 ether; // 0.5 CRO per job (adjustable)
    
    mapping(address => uint256) public credits;
    mapping(bytes32 => bool) public processedPayments;
    
    // Events
    event PaymentReceived(address indexed user, uint256 amount, uint256 creditsAdded);
    event JobPaid(address indexed user, bytes32 indexed jobId, uint256 cost);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event Withdrawal(address to, uint256 amount);
    event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury address");
        owner = msg.sender;
        treasury = _treasury;
    }
    
    /**
     * @dev Pay for jobs in advance (buy credits) with reentrancy protection
     */
    function buyCredits() external payable nonReentrant {
        require(msg.value >= jobPrice, "Insufficient payment");
        
        uint256 creditsToAdd = msg.value / jobPrice;
        require(creditsToAdd > 0, "Amount too small for credits");
        
        // Update state before external calls (checks-effects-interactions)
        credits[msg.sender] += creditsToAdd;
        
        emit PaymentReceived(msg.sender, msg.value, creditsToAdd);
        
        // Forward funds to treasury (external call last)
        (bool success, ) = treasury.call{value: msg.value}("");
        require(success, "Transfer to treasury failed");
    }
    
    /**
     * @dev Pay for a specific job (direct payment) with reentrancy protection
     */
    function payForJob(bytes32 jobId) external payable nonReentrant {
        require(msg.value >= jobPrice, "Insufficient payment");
        require(!processedPayments[jobId], "Job already paid");
        require(jobId != bytes32(0), "Invalid job ID");
        
        // Update state first (checks-effects-interactions pattern)
        processedPayments[jobId] = true;
        emit JobPaid(msg.sender, jobId, msg.value);
        
        // External call last to prevent reentrancy
        (bool success, ) = treasury.call{value: msg.value}("");
        require(success, "Transfer to treasury failed");
    }
    
    /**
     * @dev Use credits for a job (called by backend)
     */
    function useCredits(address user, bytes32 jobId) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(credits[user] > 0, "No credits available");
        require(!processedPayments[jobId], "Job already processed");
        require(jobId != bytes32(0), "Invalid job ID");
        
        credits[user]--;
        processedPayments[jobId] = true;
        
        emit JobPaid(user, jobId, jobPrice);
    }
    
    /**
     * @dev Check if user has credits or needs to pay
     */
    function canExecuteJob(address user) external view returns (bool hasCredits, uint256 creditBalance) {
        return (credits[user] > 0, credits[user]);
    }
    
    /**
     * @dev Update job price (owner only) with validation
     */
    function updatePrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be greater than zero");
        require(newPrice <= 100 ether, "Price too high"); // Max 100 CRO per job
        
        uint256 oldPrice = jobPrice;
        jobPrice = newPrice;
        emit PriceUpdated(oldPrice, newPrice);
    }
    
    /**
     * @dev Update treasury address (owner only) with validation
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        require(newTreasury != treasury, "Same treasury address");
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @dev Emergency withdrawal (owner only) with reentrancy protection
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        emit Withdrawal(owner, balance);
        
        // External call with proper error handling
        (bool success, ) = owner.call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @dev Initiate ownership transfer (2-step process for safety)
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        require(newOwner != owner, "Already the owner");
        
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(owner, newOwner);
    }
    
    /**
     * @dev Accept ownership transfer (must be called by pending owner)
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not the pending owner");
        
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        
        emit OwnershipTransferred(oldOwner, owner);
    }
    
    /**
     * @dev Cancel pending ownership transfer
     */
    function cancelOwnershipTransfer() external onlyOwner {
        pendingOwner = address(0);
    }
    
    /**
     * @dev Receive function with reentrancy protection
     */
    receive() external payable nonReentrant {
        // Automatically buy credits when CRO is sent
        require(msg.value >= jobPrice, "Insufficient payment for credits");
        
        uint256 creditsToAdd = msg.value / jobPrice;
        if (creditsToAdd > 0) {
            credits[msg.sender] += creditsToAdd;
            emit PaymentReceived(msg.sender, msg.value, creditsToAdd);
            
            // Forward to treasury
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Transfer to treasury failed");
        }
    }
}