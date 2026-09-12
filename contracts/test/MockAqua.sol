// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract MockAqua {
    mapping(address => mapping(address => mapping(bytes32 => mapping(address => uint256)))) public balances;
    address public wusdc;
    constructor(address _wusdc) { wusdc = _wusdc; }
    
    function setVirtualBalance(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external {
        balances[maker][app][strategyHash][token] = amount;
    }
    
    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external {
        uint256 bal = balances[maker][msg.sender][strategyHash][token];
        require(bal >= amount, "Not enough virtual balance");
        balances[maker][msg.sender][strategyHash][token] = bal - amount;
        
        // Transfer physical tokens
        (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", maker, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }
}
