# CRYPTO FOR PALESTINE 

## Original 
> https://bscscan.com/address/0x666f5c788178acd7fa4661c52c5bee8a0b4e8b5e#code

* Added ERC20, Ownable, SafeERC20
* Added fallback function
* Removed sell and transfer tax

## How to test

1. Clone repo
2. In the terminal run the command ```npm install```
3. create a .env file based on .env.example
4. Run the Test ```npx hardhat test```
5. Deploy to Mainnet ```npx hardhat run ./scripts/deploy.js --network BSCMainnet```
6. Verify contract (replace [address] with the address of deployed contract)  ```npx hardhat verify --network BSCMainnet [address]```
