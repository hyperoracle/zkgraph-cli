import type { UserConfig } from './config'

export const DEFAULT_CONFIG: Required<UserConfig> = {
  JsonRpcProviderUrl: {
    mainnet: 'https://rpc.ankr.com/eth',
    sepolia: 'https://rpc.ankr.com/eth_sepolia',
    goerli: '',
  },

  UserPrivateKey: '',

  ZkwasmProviderUrl: 'https://rpc.zkwasmhub.com:8090',
  CompilerServerEndpoint: 'http://compiler.dev.hyperoracle.io/compile',
  PinataEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
  PinataJWT: '',

  WasmBinPath: '[root]/build/zkgraph_full.wasm',
  LocalWasmBinPath: '[root]/build/zkgraph_local.wasm',

  YamlPath: '[root]/src/zkgraph.yaml',
  MappingPath: '[root]/src/mapping.ts',

  OutputProofFilePath: '[root]/build/proof_[taskId].txt',

  logger: {
    level: 'info',
  },
}

export const TAGS = {
  root: process.cwd(),
}

export const COMPILE_TEMP_ENTRY_FILE_NAME_TEMPLATE = 'entry_[salt].[env].ts'

export const COMPILE_CODEGEN = (libDSPName: string, mappingFileName: string, handleFuncName: string) => `
import { zkmain_lib, asmain_lib, registerHandle } from "@hyperoracle/zkgraph-lib/dsp/${libDSPName}"
import { ${handleFuncName} } from "./${mappingFileName}"

declare function __call_as_start(): void;

export function zkmain(): void {
  __call_as_start();
  registerHandle(${handleFuncName})
  return zkmain_lib()
}

export function asmain(): Uint8Array {
  __call_as_start();
  registerHandle(${handleFuncName})
  return asmain_lib()
}
function abort(a: usize, b: usize, c: u32, d: u32): void {}
`

export const NETWORKS = [
  {
    name: 'Sepolia',
    label: 'Sepolia',
    value: 11155111,
    expectedEth: 0.002,
    hex: '0xaa36a7',
  },
  {
    name: 'Goerli',
    label: 'Goerli',
    value: 5,
    expectedEth: 0.5,
    hex: '0x5',
  },
  {
    name: 'Mainnet',
    label: 'Mainnet',
    value: 1,
  },
]

export const TdConfig = {
  fee: '0.005',
  contract: '0x25AA9Ec3CA462f5AEA7fbd83A207E29Df4691380',
  queryrApi: 'https://zkwasm.hyperoracle.io/td',
  providerUrl: 'https://ethereum-sepolia.publicnode.com',
}

export const DspStaticParamsMap = {
  prove: 'proveParams',
  exec: 'execParams',
}
