const { time, loadFixture, } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect }   = require("chai");
require("dotenv").config();

const name     = "CRYPTO FOR PALESTINE";
const symbol   = "CFPAL";
const supply   = 1000000000;
const decimals = 18;

const feeEnabled     = true;
const buybackFee     = 0;
const reflectionFee  = 100;
const marketingFee   = 400;
const liquidityFee   = 100;
const rndFee         = 400;
const totalFee       = 1000;
const feeDenominator = 10000;

const DEPLOYER_WALLET              = process.env.ACCOUNT;
const initial_rndFeeReceiver       = "0x2b125f5990A4Ef14EDA0E8F3E93a4B790208fc88";
const ZERO_ADDRESS                 = "0x0000000000000000000000000000000000000000";

const initial_marketingFeeReceiver = "0xf24666bCEC696B1d2F5edd44cCb40FE8E3e00AFb";

describe("UnitTest original code", function () {
  async function deployToken() {
    const [owner, otherAccount, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver] = await ethers.getSigners();

    // Impersonate owner account
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEPLOYER_WALLET],
    });

    const deployer = await ethers.provider.getSigner(DEPLOYER_WALLET);

    await network.provider.send("hardhat_setBalance", [
      DEPLOYER_WALLET, 
      ethers.utils.parseEther('10.0').toHexString(),
    ]);

    const Token = await ethers.getContractFactory("CFPToken");
    const token = await Token.connect(deployer).deploy();

    return { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount };
  }

  describe("On Deployment", function () {
    it("Should set the correct name", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.name()).to.equal(name);
    });
    it("Should set the correct symbol", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.symbol()).to.equal(symbol);
    });
    it("Should set the correct decimals", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.decimals()).to.equal(decimals);
    });
    it("Should set the correct supply", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.totalSupply() / 10 ** 18).to.equal(supply);
    });
    it("Owner set correctly", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.owner()).to.equal(DEPLOYER_WALLET);
    });
    it("Total supply minted to owner's wallet", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.balanceOf(DEPLOYER_WALLET) / 10 ** 18).to.equal(supply);
    });
    it("Initial Fee should be set correctly", async function () {
      const { token } = await loadFixture(deployToken);
      const fees = await token.getFees();
      expect(fees[0]).to.equal(feeEnabled);
      expect(fees[1]).to.equal(buybackFee);
      expect(fees[2]).to.equal(reflectionFee);
      expect(fees[3]).to.equal(marketingFee);
      expect(fees[4]).to.equal(rndFee);
      expect(fees[5]).to.equal(liquidityFee);
      expect(fees[6]).to.equal(feeDenominator);
    });
    it("Initial Fee receivers should be set correctly", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.autoLiquidityReceiver()).to.equal(DEPLOYER_WALLET);
      expect(await token.marketingFeeReceiver()).to.equal(initial_marketingFeeReceiver);
      expect(await token.rndFeeReceiver()).to.equal(initial_rndFeeReceiver);
    });
    it("Initial autobuyBack settings should be set correctly", async function () {
      const { token } = await loadFixture(deployToken);
      const fees = await token.getAutoBuybackSettings();
      expect(fees[0]).to.equal(false);
      expect(fees[1]).to.equal(0);
      expect(fees[2]).to.equal(0);
      expect(fees[3]).to.equal(0);
      expect(fees[4]).to.equal(0);
      expect(fees[5]).to.equal(0);
    });
  });

  describe("Test setters", function () {
    it("setAutoBuybackSettings works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setAutoBuybackSettings(true, 10, 20, 30))
      .to.emit(token, "AutoBuybackSettingsUpdated").withArgs(true, 10, 20, 30);
      await expect(token.connect(deployer).setAutoBuybackSettings(true, 10, 20, 30))
      .to.emit(token, "AutoBuybackSettingsUpdated").withArgs(true, 10, 20, 30);
    });
    it("setAutoBuybackSettings onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setAutoBuybackSettings(true, 10, 20, 30))
      .to.be.reverted;
    });
    it("setIsDividendExempt works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setIsDividendExempt(liquidityReceiver.address, true))
      .to.emit(token, "DividendExemptUpdated").withArgs(liquidityReceiver.address, true);
      await expect(token.connect(deployer).setIsDividendExempt(liquidityReceiver.address, false))
      .to.emit(token, "DividendExemptUpdated").withArgs(liquidityReceiver.address, false);
    });
    it("setIsDividendExempt onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setIsDividendExempt(liquidityReceiver.address, true))
      .to.be.reverted;
    });
    it("setIsFeeExempt works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setIsFeeExempt(liquidityReceiver.address, true))
      .to.emit(token, "FeeExemptUpdated").withArgs(liquidityReceiver.address, true);
      await expect(token.connect(deployer).setIsFeeExempt(liquidityReceiver.address, false))
      .to.emit(token, "FeeExemptUpdated").withArgs(liquidityReceiver.address, false);
    });
    it("setIsFeeExempt onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setIsFeeExempt(liquidityReceiver.address, true))
      .to.be.reverted;
    });
    it("setIsTxLimitExempt works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setIsTxLimitExempt(liquidityReceiver.address, true))
      .to.emit(token, "TxLimitExemptUpdated").withArgs(liquidityReceiver.address, true);
      await expect(token.connect(deployer).setIsTxLimitExempt(liquidityReceiver.address, false))
      .to.emit(token, "TxLimitExemptUpdated").withArgs(liquidityReceiver.address, false);
    });
    it("setIsTxLimitExempt onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setIsTxLimitExempt(liquidityReceiver.address, true))
      .to.be.reverted;
    });
    it("setFeeReceivers works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setFeeReceivers(liquidityReceiver.address, marketingFeeReceiver.address, rndFeeReceiver.address))
      .to.emit(token, "FeeReceiversUpdated").withArgs(liquidityReceiver.address, marketingFeeReceiver.address, rndFeeReceiver.address);
      // await token.setFeeReceivers(liquidityReceiver.address, marketingFeeReceiver.address, rndFeeReceiver.address);
      expect(await token.autoLiquidityReceiver()).to.equal(liquidityReceiver.address);
      expect(await token.marketingFeeReceiver()).to.equal(marketingFeeReceiver.address);
      expect(await token.rndFeeReceiver()).to.equal(rndFeeReceiver.address);
    });
    it("setFeeReceivers onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setFeeReceivers(liquidityReceiver.address, marketingFeeReceiver.address, rndFeeReceiver.address))
      .to.be.reverted;
    });
    it("setSwapBackSettings works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setSwapBackSettings(true, 10)).to.emit(token, "SwapBackSettingsUpdated").withArgs(true, 10);
    });
    it("setSwapBackSettings onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setSwapBackSettings(true, 10))
      .to.be.reverted;
    });
    it("setAutoLiquifyEnabled works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(deployer).setAutoLiquifyEnabled(true)).to.emit(token, "AutoLiquifyUpdated").withArgs(true);
    });
    it("setAutoLiquifyEnabled onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setAutoLiquifyEnabled(true))
      .to.be.reverted;
    });
    it("setDistributionCriteria onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setDistributionCriteria(10, 10))
      .to.be.reverted;
    });
    it("setDistributorSettings onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setDistributorSettings(10, true))
      .to.be.reverted;
    });
    it("updateDividendTracker onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).updateDividendTracker(liquidityReceiver.address))
      .to.be.reverted;
    });
    it("setAutomatedMarketMakerPair onlyOwner works", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).setAutomatedMarketMakerPair(liquidityReceiver.address, true))
      .to.be.reverted;
    });
    it("Fallback works: Ether cannot be sent to the contract", async function () {
      const { token, deployer, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, otherAccount } = await loadFixture(deployToken);
      await expect(deployer.sendTransaction({
        to: token.address,
        value: ethers.utils.parseEther("1.0"), 
      })).to.be.revertedWith("Canot send BNB to the contract")
    });
  });


  describe("ERC20 Functions", function () {
    it("name()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.name()).to.equal(name);
    });
    it("symbol()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.symbol()).to.equal(symbol);
    });
    it("decimals()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.decimals()).to.equal(decimals);
    });
    it("supply()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.totalSupply() / 10 ** 18).to.equal(supply);
    });
    it("balanceOf()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.balanceOf(DEPLOYER_WALLET) / 10 ** 18).to.equal(supply);
    });
    it("transfer()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      await expect(token.connect(deployer).transfer(otherAccount.address, 1)).to.changeTokenBalances(
        token,
        [DEPLOYER_WALLET, otherAccount.address],
        [-1, 1]
      );
      await expect(token.connect(deployer).transfer(ZERO_ADDRESS, 1)).to.be.revertedWith("ERC20: transfer to the zero address");
    });
    it("allowance()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(0);
      await token.connect(deployer).approve(otherAccount.address, 10);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(10);

    });
    it("approve()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(0);
      await token.connect(deployer).approve(otherAccount.address, 10);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(10);

    });
    it("transferFrom()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(0);
      await token.connect(deployer).approve(otherAccount.address, 10);
      expect(await token.allowance(DEPLOYER_WALLET, otherAccount.address)).to.equal(10);

      await expect(token.connect(otherAccount).transferFrom(ZERO_ADDRESS, otherAccount.address, 1)).to.be.revertedWith("ERC20: insufficient allowance");
      await expect(token.connect(otherAccount).transferFrom(DEPLOYER_WALLET, ZERO_ADDRESS, 1)).to.be.revertedWith("ERC20: transfer to the zero address");

      await expect(token.connect(otherAccount).transferFrom(DEPLOYER_WALLET, otherAccount.address, 10)).to.changeTokenBalances(
        token,
        [DEPLOYER_WALLET, otherAccount.address],
        [-10, 10]
      );

    });
  });
  describe("Ownable Functions", function () {
    it("owner()", async function () {
      const { token } = await loadFixture(deployToken);
      expect(await token.owner()).to.equal(DEPLOYER_WALLET);
    });
    it("transferOwnership()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).transferOwnership(otherAccount.address)).to.be.revertedWith('Ownable: caller is not the owner');
      await token.connect(deployer).transferOwnership(otherAccount.address);
      expect(await token.owner()).to.equal(otherAccount.address);
    });
    it("renounceOwnership()", async function () {
      const { 
        token, 
        deployer, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount  
      } = await loadFixture(deployToken);
      await expect(token.connect(otherAccount).renounceOwnership()).to.be.revertedWith('Ownable: caller is not the owner');
      await token.connect(deployer).renounceOwnership();
      expect(await token.owner()).to.equal(ZERO_ADDRESS);
    });
  });
});

