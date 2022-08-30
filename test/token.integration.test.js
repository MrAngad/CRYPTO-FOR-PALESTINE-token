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

const ADMIN_WALLET                 = process.env.ACCOUNT;
const initial_rndFeeReceiver       = "0x2b125f5990A4Ef14EDA0E8F3E93a4B790208fc88";
const initial_marketingFeeReceiver = "0xf24666bCEC696B1d2F5edd44cCb40FE8E3e00AFb";

const panCakeV2RouterAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WETH_ADDRESS           = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FACTORY_ADDRESS        = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

const DECIMAL_ZEROS   = "000000000000000000"; // 18 zeros
const formatDecimals  = 1000000000000000000;

describe("Integration test original code", function () {
  async function deployToken() {
    let users, funds;
    const [owner, otherAccount, liquidityReceiver, marketingFeeReceiver, rndFeeReceiver, user1, user2] = await ethers.getSigners();

    // Impersonate owner account
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ADMIN_WALLET],
    });

    const admin = await ethers.provider.getSigner(ADMIN_WALLET);

    await network.provider.send("hardhat_setBalance", [
      ADMIN_WALLET, 
      ethers.utils.parseEther('4000').toHexString(),
    ]);

    const Token = await ethers.getContractFactory("CFPToken");
    const token = await Token.connect(admin).deploy();

    const rewardToken    = await ethers.getContractAt("IERC20", "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56");
    const panCakeRouter  = await ethers.getContractAt("IPancakeV2Router02", panCakeV2RouterAddress);
    const panCakeFactory = await ethers.getContractAt("IPancakeV2Factory", FACTORY_ADDRESS);
    const pairAddress    = await panCakeFactory.getPair(WETH_ADDRESS, token.address);
    const panCakePair    = await ethers.getContractAt("IPancakeV2Pair", pairAddress);

    await token.connect(admin).approve(panCakeV2RouterAddress, '400000000' + DECIMAL_ZEROS); // 40M to pancake router
    await panCakeRouter.connect(admin).addLiquidityETH(token.address, '90000000' + DECIMAL_ZEROS, 0, 0, ADMIN_WALLET, (Date.now() + 100000), 
    {value: ethers.utils.parseEther('1000')}); // provide 1000 BNB + 90000000 token liquidity to pancakeswap

    token.connect(admin).setFeeReceivers(liquidityReceiver.address, marketingFeeReceiver.address, rndFeeReceiver.address);
    expect(await token.autoLiquidityReceiver()).to.equal(liquidityReceiver.address);
    expect(await token.marketingFeeReceiver()).to.equal(marketingFeeReceiver.address);
    expect(await token.rndFeeReceiver()).to.equal(rndFeeReceiver.address);

    return { 
      token, 
      rewardToken, 
      panCakeRouter, 
      panCakeFactory, 
      panCakePair,
      admin, 
      liquidityReceiver, 
      marketingFeeReceiver, 
      rndFeeReceiver, 
      otherAccount,
      user1,
      user2
    };
  }

  describe("Test transfer function", function () {
    it("transaction 1 - no tax since from admin", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      await token.connect(admin).transfer(user1.address, '10000' + DECIMAL_ZEROS);
      expect(await token.balanceOf(user1.address) / 10**18).to.equal(10000);

    });
    it("transaction 2 - transfer between two EOA", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      await token.connect(admin).transfer(user1.address, '10000' + DECIMAL_ZEROS);
      expect(await token.balanceOf(user1.address) / 10**18).to.equal(10000);
      await token.connect(user1).transfer(user2.address, '10000' + DECIMAL_ZEROS);
      expect(await token.balanceOf(user2.address) / 10**18).to.equal(10000);
    });
    it("transaction 3 - transfer zero tokens", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      await token.connect(admin).transfer(user1.address, 0);
      expect(await token.balanceOf(user1.address)).to.equal(0);
    });
    it("transaction 4 - transfer more than maxTxAmount ", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      await token.connect(admin).transfer(user1.address, '100000000' + DECIMAL_ZEROS);
      expect(await token.balanceOf(user1.address) / 10**18).to.equal(100000000);
      await expect(token.connect(user1).transfer(user2.address, '100000000' + DECIMAL_ZEROS))
      .to.be.revertedWith("TX Limit Exceeded");
    });
    it("transaction 5 - sell tax for pancakeswap works ", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      let CFPALPrice, BNBReserve, CFPALReserve;
      const path = [token.address, WETH_ADDRESS];

      console.log("\nInitial price and liquidity on pancakeswap");

      let reserves = await panCakePair.getReserves();
      CFPALReserve = reserves['reserve0']/formatDecimals;
      BNBReserve   = reserves['reserve1']/formatDecimals;

      CFPALPrice = ((await panCakeRouter.getAmountsOut(ethers.utils.parseEther('1'), path))[1]) / formatDecimals;
      printTable(CFPALReserve, BNBReserve, CFPALPrice);

      await token.connect(admin).transfer(user1.address, '200' + DECIMAL_ZEROS);
      expect(await token.balanceOf(user1.address) / 10**18).to.equal(200);

      await token.connect(user1).approve(panCakeV2RouterAddress, '100' + DECIMAL_ZEROS);
      await panCakeRouter.connect(user1).swapExactTokensForETHSupportingFeeOnTransferTokens(
        '100' + DECIMAL_ZEROS,
        0, // accept any amount of ETH
        path,
        user1.address,
        new Date().getTime()
      )
      expect(await token.balanceOf(user1.address) / 10**18).to.equal(100);
      expect(await token.balanceOf(token.address) / 10**18).to.equal(10);

      reserves = await panCakePair.getReserves();
      CFPALReserve = reserves['reserve0']/formatDecimals;
      BNBReserve   = reserves['reserve1']/formatDecimals;

      CFPALPrice = ((await panCakeRouter.getAmountsOut(ethers.utils.parseEther('1'), path))[1]) / formatDecimals;
      printTable(CFPALReserve, BNBReserve, CFPALPrice);
    });
    it("transaction 6 - buy tax removed on pancakeswap ", async function () {
      const { 
        token, 
        rewardToken, 
        panCakeRouter, 
        panCakeFactory, 
        panCakePair,
        admin, 
        liquidityReceiver, 
        marketingFeeReceiver, 
        rndFeeReceiver, 
        otherAccount,
        user1,
        user2
      } = await loadFixture(deployToken);

      let CFPALPrice, BNBReserve, CFPALReserve;
      const path = [token.address, WETH_ADDRESS];
      CFPALPrice = ((await panCakeRouter.getAmountsOut(ethers.utils.parseEther('1'), path))[1]) / formatDecimals;

      await panCakeRouter.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0, // accept any amount of Tokens
        path.reverse(),
        user1.address,
        new Date().getTime(), {
            value: ethers.utils.parseEther((parseFloat(CFPALPrice)*100).toString())
        }
    )
      // expect(await token.balanceOf(user1.address) / 10**18).to.equal(100);
      expect(await token.balanceOf(token.address) / 10**18).to.equal(0);

      let reserves = await panCakePair.getReserves();
      CFPALReserve = reserves['reserve0']/formatDecimals;
      BNBReserve   = reserves['reserve1']/formatDecimals;

      CFPALPrice = ((await panCakeRouter.getAmountsOut(ethers.utils.parseEther('1'), path.reverse()))[1]) / formatDecimals;
      printTable(CFPALReserve, BNBReserve, CFPALPrice);
    });
  });
});

function printTable(CFPALReserve, BNBReserve, price) {
  console.table([
      ["LP CFPAL", "LP WBNB Amount", "Price"],
      [CFPALReserve, BNBReserve, `${price} BNB/CFPAL`]
  ]);
}