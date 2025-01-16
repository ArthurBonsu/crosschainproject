import React, { createContext, useContext, useState, PropsWithChildren } from 'react';
import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { loadContracts, PasschainContract } from '../utils/contract-loader';
import { Logger } from '../utils/logger';

interface BlockchainContextType {
  web3: Web3 | null;
  accounts: string[];
  contracts: {
    [key: string]: Contract;
  };
  connect: () => Promise<void>;
  processTransaction: (data: any) => Promise<TransactionResult>;
  isLoading: boolean;
}

interface TransactionResult {
  parsedMetadata: string;
  speculativeTx: string;
  zkProof: string;
  clusterProcessing: string;
  relayCrossChain: string;
}

const BlockchainContext = createContext<BlockchainContextType>({
  web3: null,
  accounts: [],
  contracts: {},
  connect: async () => {},
  processTransaction: async () => {
    throw new Error('BlockchainContext not initialized');
  },
  isLoading: false
});

export const BlockchainProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [contracts, setContracts] = useState<{[key: string]: PasschainContract}>({});  // Changed type here
  const [isLoading, setIsLoading] = useState<boolean>(false);
 
  const loadBlockchainContracts = async (web3Instance: Web3): Promise<void> => {
    try {
      setIsLoading(true);
      const loadedContracts = await loadContracts(web3Instance);
      
      // Verify each contract was loaded correctly
      for (const [name, contract] of Object.entries(loadedContracts)) {
        if (!contract || !contract.methods) {
          throw new Error(`Failed to load contract: ${name}`);
        }
      }
      
      setContracts(loadedContracts);  // Now this should work with the correct types
    } catch (error) {
      Logger.error('Failed to load contracts', error);
      throw new Error('Contract loading failed');
    } finally {
      setIsLoading(false);
    }
  };

  const connect = async (): Promise<void> => {
    Logger.info('Attempting to connect blockchain');
    setIsLoading(true);
    
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setIsLoading(false);
      Logger.warn('Non-Ethereum browser detected. Consider trying MetaMask!');
      throw new Error('Ethereum provider not found');
    }

    try {
      const web3Instance = new Web3(ethereum);
      await ethereum.request({ method: 'eth_requestAccounts' });
      
      const accs = await web3Instance.eth.getAccounts();
      if (accs.length === 0) {
        throw new Error('No accounts found');
      }

      setAccounts(accs);
      setWeb3(web3Instance);

      // Load contracts after web3 is initialized
      await loadBlockchainContracts(web3Instance);

      Logger.info('Blockchain connected successfully', { accounts: accs });
    } catch (error) {
      Logger.error('Connection error', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const processTransaction = async (data: any): Promise<TransactionResult> => {
    if (isLoading) {
      throw new Error('Blockchain is still initializing');
    }

    Logger.info('Processing transaction', data);

    if (!web3 || accounts.length === 0) {
      await connect();
    }

    if (!web3 || accounts.length === 0) {
      throw new Error('Blockchain connection not established');
    }

    try {
      const { 
        MetadataParser, 
        PacechainChannel, 
        ZKPVerifierBase, 
        ClusterManager, 
        RelayChain 
      } = contracts;

      if (!MetadataParser || !PacechainChannel || !ZKPVerifierBase || 
          !ClusterManager || !RelayChain) {
        throw new Error('Required contracts not initialized');
      }

      const encodedData = web3.utils.fromAscii(JSON.stringify(data));
      const defaultOptions = { from: accounts[0] };

      const parsedMetadata = await MetadataParser.methods
        .parseMetadata(encodedData)
        .send(defaultOptions);

      const speculativeTx = await PacechainChannel.methods
        .initiateSpeculativeTransaction(encodedData)
        .send(defaultOptions);

      const zkProof = await ZKPVerifierBase.methods
        .generateProof(encodedData, web3.utils.fromAscii('witness'))
        .send(defaultOptions);

      const clusterProcessing = await ClusterManager.methods
        .processTransaction(encodedData)
        .send(defaultOptions);

      const relayCrossChain = await RelayChain.methods
        .relayTransaction(encodedData)
        .send(defaultOptions);

      const result: TransactionResult = {
        parsedMetadata: parsedMetadata.transactionHash,
        speculativeTx: speculativeTx.transactionHash,
        zkProof: zkProof.transactionHash,
        clusterProcessing: clusterProcessing.transactionHash,
        relayCrossChain: relayCrossChain.transactionHash
      };

      Logger.info('Transaction processed successfully', result);
      return result;
    } catch (error) {
      Logger.error('Transaction processing error', error);
      throw error;
    }
  };

  return (
    <BlockchainContext.Provider value={{ 
      web3, 
      accounts, 
      contracts, 
      connect, 
      processTransaction,
      isLoading 
    }}>
      {children}
    </BlockchainContext.Provider>
  );
};

export const useBlockchain = () => useContext(BlockchainContext);