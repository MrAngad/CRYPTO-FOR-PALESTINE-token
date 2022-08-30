//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./IDividendDistributor.sol";
import "./DividendDistributor.sol";
import "./IDEXFactory.sol";

contract CFPToken is ERC20, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    address constant BUSD = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    string constant _name    = "CRYPTO FOR PALESTINE";
    string constant _symbol  = "CFPAL";
    uint8 constant _decimals = 18;

    uint256 _totalSupply        = 1000000000 * (10 ** _decimals); // 1B Tokens
    uint256 public _maxTxAmount = _totalSupply.div(100).mul(5); // 5%

    mapping (address => uint256) _balances;

    mapping (address => bool) isFeeExempt;
    mapping (address => bool) isTxLimitExempt;
    mapping (address => bool) isDividendExempt;
    mapping (address => bool) public isAutomatedMarketMakerPair;

    bool feeEnabled = true;

    bool autoLiquifyEnabled = true;
    uint256 liquidityFeeAccumulator;

    uint256 buybackFee     = 0;
    uint256 reflectionFee  = 100;
    uint256 marketingFee   = 400;
    uint256 liquidityFee   = 100;
    uint256 rndFee         = 400;
    uint256 totalFee       = 1000;
    uint256 feeDenominator = 10000;

    address public autoLiquidityReceiver;
    address public marketingFeeReceiver = 0xf24666bCEC696B1d2F5edd44cCb40FE8E3e00AFb;
    address public rndFeeReceiver       = 0x2b125f5990A4Ef14EDA0E8F3E93a4B790208fc88;
    uint256 marketingFees;
    uint256 rndFees;
    

    IDEXRouter public router;
    address public pair;

    uint256 public launchedAt;

    bool autoBuybackEnabled = false;
    uint256 autoBuybackCap;
    uint256 autoBuybackAccumulator;
    uint256 autoBuybackAmount;
    uint256 autoBuybackBlockPeriod;
    uint256 autoBuybackBlockLast;

    DividendDistributor public distributor;
    bool autoClaimEnabled = false;
    uint256 distributorGas = 500000;

    bool swapEnabled = true;
    uint256 swapThreshold = _totalSupply / 8000;
    
    bool inSwap;
    modifier swapping() { inSwap = true; _; inSwap = false; }

    constructor () ERC20(_name, _symbol) {
        router = IDEXRouter(0x10ED43C718714eb63d5aA57B78B54704E256024E);
        pair   = IDEXFactory(router.factory()).createPair(WBNB, address(this));
        // _allowances[address(this)][address(router)] = uint256(-1);

        distributor = new DividendDistributor(address(router));

        isFeeExempt[msg.sender]     = true;
        isTxLimitExempt[msg.sender] = true;

        isDividendExempt[pair]          = true;
        isDividendExempt[address(this)] = true;
        isDividendExempt[DEAD]          = true;
        isDividendExempt[msg.sender]    = true;

        autoLiquidityReceiver = msg.sender;

        _setAutomatedMarketMakerPair(pair, true);

        _mint(msg.sender, _totalSupply);
        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    receive() external payable { 
      require(msg.value == 0, "Canot send BNB to the contract");
    }

    function _transfer(address sender, address recipient, uint256 amount) internal override {
      require(balanceOf(sender) >= amount, "BEP20: transfer amount exceeds balance");

      checkTxLimit(sender, amount);

      if(inSwap){ super._transfer(sender, recipient, amount); }

      if (amount == 0) {
          super._transfer(sender, recipient, 0);
          return;
      }

      checkLaunched(sender);

      if(shouldSwapBack()){ swapBack(); }
      if(shouldAutoBuyback()){ triggerAutoBuyback(); }

      if(!launched() && recipient == pair){ require(balanceOf(sender) > 0); launch(); }

      uint256 amountReceived = shouldTakeFee(sender, recipient) ? takeFee(sender, recipient, amount) : amount;


      if(!isDividendExempt[sender]){ try distributor.setShare(sender, balanceOf(sender)) {} catch {} }
      if(!isDividendExempt[recipient]){ try distributor.setShare(recipient, balanceOf(recipient)) {} catch {} }

      if(autoClaimEnabled){
          try distributor.process(distributorGas) {} catch {}
      }

      super._transfer(sender, recipient, amountReceived);
      super._transfer(sender, address(this), amount.sub(amountReceived));
      emit Transfer(sender, recipient, amountReceived);
    }

    function checkLaunched(address sender) internal view {
        require(launched() || sender == owner(), "Pre-Launch Protection");
    }

    function checkTxLimit(address sender, uint256 amount) internal view {
        require(amount <= _maxTxAmount || isTxLimitExempt[sender], "TX Limit Exceeded");
    }

    function shouldTakeFee(address sender, address recipient) internal view returns (bool) {
        return feeEnabled && !isFeeExempt[sender] && isAutomatedMarketMakerPair[recipient];
    }

    function takeFee(address sender, address receiver, uint256 amount) internal returns (uint256) {
        uint256 feeAmount = amount.mul(totalFee).div(feeDenominator);

        _balances[address(this)] = _balances[address(this)].add(feeAmount);
        emit Transfer(sender, address(this), feeAmount);

        if(receiver == pair && autoLiquifyEnabled){
            liquidityFeeAccumulator = liquidityFeeAccumulator.add(feeAmount.mul(liquidityFee).div(totalFee.add(liquidityFee)));
        }

        return amount.sub(feeAmount);
    }

    function shouldSwapBack() internal view returns (bool) {
        return msg.sender != pair
        && !inSwap
        && swapEnabled
        && _balances[address(this)] >= swapThreshold;
    }

    function swapBack() internal swapping {
        if(liquidityFeeAccumulator >= swapThreshold && autoLiquifyEnabled){
            liquidityFeeAccumulator = liquidityFeeAccumulator.sub(swapThreshold);
            uint256 amountToLiquify = swapThreshold.div(2);

            address[] memory path = new address[](2);
            path[0] = address(this);
            path[1] = WBNB;

            uint256 balanceBefore = address(this).balance;

            router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amountToLiquify,
                0,
                path,
                address(this),
                block.timestamp
            );

            uint256 amountBNB = address(this).balance.sub(balanceBefore);

            router.addLiquidityETH{value: amountBNB}(
                address(this),
                amountToLiquify,
                0,
                0,
                autoLiquidityReceiver,
                block.timestamp
            );
            
            emit AutoLiquify(amountBNB, amountToLiquify);
        }else{
            uint256 amountToSwap = swapThreshold;

            address[] memory path = new address[](2);
            path[0] = address(this);
            path[1] = WBNB;

            uint256 balanceBefore = address(this).balance;

            router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amountToSwap,
                0,
                path,
                address(this),
                block.timestamp
            );

            uint256 amountBNB = address(this).balance.sub(balanceBefore);

            uint256 amountBNBReflection = amountBNB.mul(reflectionFee).div(totalFee);
            uint256 amountBNBMarketing = amountBNB.mul(marketingFee).div(totalFee);
            uint256 amountBNBRnD = amountBNB.mul(rndFee).div(totalFee);
            

            try distributor.deposit{value: amountBNBReflection}() {} catch {}

            (bool success, ) = payable(0x401784A0F7e43De465269018A2BA968050dCdAB5).call{value: amountBNBMarketing, gas: 30000}("");
            if(success){ marketingFees = marketingFees.add(amountBNBMarketing); }

            (success, ) = payable(0x401784A0F7e43De465269018A2BA968050dCdAB5).call{value: amountBNBRnD, gas: 30000}("");
            if(success){ rndFees = rndFees.add(amountBNBRnD); }

            emit SwapBack(amountToSwap, amountBNB);
        }
    }

    function shouldAutoBuyback() internal view returns (bool) {
        return msg.sender != pair
        && !inSwap
        && autoBuybackEnabled
        && autoBuybackBlockLast + autoBuybackBlockPeriod <= block.number
        && address(this).balance >= autoBuybackAmount;
    }

    function buybackWEI(uint256 amount) external onlyOwner {
        _buyback(amount);
    }

    function buybackBNB(uint256 amount) external onlyOwner {
        _buyback(amount * (10 ** 18));
    }

    function _buyback(uint256 amount) internal {
        buyTokens(amount, DEAD);
        emit Buyback(amount);
    }

    function triggerAutoBuyback() internal {
        buyTokens(autoBuybackAmount, DEAD);
        autoBuybackBlockLast = block.number;
        autoBuybackAccumulator = autoBuybackAccumulator.add(autoBuybackAmount);
        if(autoBuybackAccumulator > autoBuybackCap){ autoBuybackEnabled = false; }
    }

    function buyTokens(uint256 amount, address to) internal swapping {
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = address(this);

        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
            0,
            path,
            to,
            block.timestamp
        );
    }

    function setAutoBuybackSettings(bool _enabled, uint256 _cap, uint256 _amount, uint256 _period) external onlyOwner {
        autoBuybackEnabled = _enabled;
        autoBuybackCap = _cap;
        autoBuybackAccumulator = 0;
        autoBuybackAmount = _amount;
        autoBuybackBlockPeriod = _period;
        autoBuybackBlockLast = block.number;
        emit AutoBuybackSettingsUpdated(_enabled, _cap, _amount, _period);
    }

    function launched() internal view returns (bool) {
        return launchedAt != 0;
    }

    function launch() internal {
        launchedAt = block.number;
        autoClaimEnabled = true;
        emit Launch();
    }

    function setIsDividendExempt(address holder, bool exempt) external onlyOwner {
        require(holder != address(this) && holder != pair);
        isDividendExempt[holder] = exempt;
        if(exempt){
            distributor.setShare(holder, 0);
        }else{
            distributor.setShare(holder, _balances[holder]);
        }
        emit DividendExemptUpdated(holder, exempt);
    }

    function setIsFeeExempt(address holder, bool exempt) external onlyOwner {
        isFeeExempt[holder] = exempt;
        emit FeeExemptUpdated(holder, exempt);
    }

    function setIsTxLimitExempt(address holder, bool exempt) external onlyOwner {
        isTxLimitExempt[holder] = exempt;
        emit TxLimitExemptUpdated(holder, exempt);
    }

    function setFeeReceivers(address _liquidityReceiver, address _marketingFeeReceiver, address _rndFeeReceiver) external onlyOwner {
        autoLiquidityReceiver = _liquidityReceiver;
        marketingFeeReceiver = _marketingFeeReceiver;
        rndFeeReceiver = _rndFeeReceiver;
        emit FeeReceiversUpdated(_liquidityReceiver, _marketingFeeReceiver, _rndFeeReceiver);
    }

    function setSwapBackSettings(bool _enabled, uint256 _amount) external onlyOwner {
        swapEnabled = _enabled;
        swapThreshold = _amount;
        emit SwapBackSettingsUpdated(_enabled, _amount);
    }

    function setAutoLiquifyEnabled(bool _enabled) external onlyOwner {
        autoLiquifyEnabled = _enabled;
        emit AutoLiquifyUpdated(_enabled);
    }
    
    function setDistributionCriteria(uint256 _minPeriod, uint256 _minDistribution) external onlyOwner {
        distributor.setDistributionCriteria(_minPeriod, _minDistribution);
    }

    function setDistributorSettings(uint256 gas, bool _autoClaim) external onlyOwner {
        require(gas <= 1000000);
        distributorGas = gas;
        autoClaimEnabled = _autoClaim;
        emit DistributorSettingsUpdated(gas, _autoClaim);
    }

    function getAccumulatedFees() external view returns (uint256, uint256) {
        return (marketingFees, rndFees);
    }

    function getAutoBuybackSettings() external view returns (bool,uint256,uint256,uint256,uint256,uint256) {
        return (
            autoBuybackEnabled,
            autoBuybackCap,
            autoBuybackAccumulator,
            autoBuybackAmount,
            autoBuybackBlockPeriod,
            autoBuybackBlockLast
        );
    }
    
    function getAutoLiquifySettings() external view returns (bool,uint256,uint256) {
        return (
            autoLiquifyEnabled,
            liquidityFeeAccumulator,
            swapThreshold
        );
    }

    function getSwapBackSettings() external view returns (bool,uint256) {
        return (
            swapEnabled,
            swapThreshold
        );
    }

    function getFees() external view returns (bool,uint256,uint256,uint256,uint256,uint256,uint256) {
        return (
            feeEnabled,
            buybackFee,
            reflectionFee,
            marketingFee,
            rndFee,
            liquidityFee,
            feeDenominator
        );
    }
    
    
    function updateDividendTracker(address newAddress) public onlyOwner {
        require(newAddress != address(distributor), "The dividend tracker already has that address");

        DividendDistributor newDistributor = DividendDistributor(payable(newAddress));

        require(newDistributor.owner() == address(this), "The new dividend tracker must be owned by the $flix token contract");

        isDividendExempt[address(newDistributor)] = true;
        isDividendExempt[address(this)] = true;
        isDividendExempt[address(router)] = true;

        emit UpdateDividendTracker(newAddress, address(newDistributor));

        distributor = newDistributor;
    }

    function setAutomatedMarketMakerPair(address _pair, bool value) public onlyOwner {
        require(_pair != pair, "CFPAL: The PancakeSwap pair cannot be removed from automatedMarketMakerPairs");
        _setAutomatedMarketMakerPair(_pair, value);
    }

    function _setAutomatedMarketMakerPair(address _pair, bool value) private {
        require(isAutomatedMarketMakerPair[_pair] != value, "CFPAL: Automated market maker pair is already set to that value");
        isAutomatedMarketMakerPair[_pair] = value;

        if (value) {
            isDividendExempt[_pair] = true;
        }
    }

    event Launch();
    event AutoLiquify(uint256 amountBNB, uint256 amountToken);
    event SwapBack(uint256 amountToken, uint256 amountBNB);
    event Buyback(uint256 amountBNB);
    event AutoBuybackSettingsUpdated(bool enabled, uint256 cap, uint256 amount, uint256 period);
    //event TxLimitUpdated(uint256 amount);
    event DividendExemptUpdated(address holder, bool exempt);
    event FeeExemptUpdated(address holder, bool exempt);
    event TxLimitExemptUpdated(address holder, bool exempt);
    //event FeesUpdated(bool enabled, uint256 liquidityFee, uint256 buybackFee, uint256 reflectionFee, uint256 marketingFee, uint256 rndFee, uint256 feeDenominator);
    event FeeReceiversUpdated(address autoLiquidityReceiver, address marketingFeeReceiver, address rndFeeReceiver);
    event SwapBackSettingsUpdated(bool enabled, uint256 amount);
    event AutoLiquifyUpdated(bool enabled);
    event DistributorSettingsUpdated(uint256 gas, bool autoClaim);
    event UpdateUniswapV2Router(address newAddress, address router);
    event UpdateDividendTracker(address newAddress, address dividendTracker);
}