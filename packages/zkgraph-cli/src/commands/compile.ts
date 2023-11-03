import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import to from 'await-to-js'
import FormData from 'form-data'
import type { AxiosRequestConfig } from 'axios'
import axios from 'axios'
import { codegenImportReplace, createOnNonexist, fromHexString, getTsFiles, loadZKGraphSources, parseYaml } from '../utils'
import type { ZkGraphYaml } from '../types'
import { logger } from '../logger'
import { zkGraphCache } from '../cache'

export interface CompileOptions {
  local: boolean
  yamlPath?: string
  compilerServerEndpoint: string
  wasmPath: string
  watPath: string
  mappingPath: string
  isUseAscLib?: boolean
}

const wasmStartName = '__as_start'

// const ascBin = path.join(`${__dirname}`, '../..', 'node_modules/.bin/asc')
const abortPath = '~lib/@hyperoracle/zkgraph-lib/common/type/abort'

export async function compile(options: CompileOptions) {
  const {
    local,
  } = options
  if (local)
    await compileLocal(options)
  else
    await compileServer(options)
}

async function compileServer(options: CompileOptions) {
  const {
    yamlPath,
    compilerServerEndpoint,
    wasmPath,
    watPath,
    mappingPath,
    isUseAscLib = true,
  } = options
  if (!yamlPath) {
    logger.error('no yaml path provided')
    return
  }
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8')
  const [yamlErr, yaml] = await to(parseYaml<Partial<ZkGraphYaml>>(yamlContent))
  if (yamlErr) {
    logger.error(`[-] LOAD YAML ERROR. ${yamlErr.message}`)
    return
  }
  if (!yaml) {
    logger.error('invalid yaml')
    return
  }

  const [source_address, source_esigs] = loadZKGraphSources(yaml)
  logger.info(`[*] Source contract address:${source_address}`)
  logger.info(`[*] Source events signatures:${source_esigs}` + '\n')

  // const mappingRoot = path.join(mappingPath, '..')
  // const entryFilename = getEntryFilename('full')
  // const innerFile = await codegen(mappingRoot, entryFilename, COMPILE_CODEGEN)

  // NOTE: This is temporary
  if (!isUseAscLib)
    zkGraphCache.copyLibToCacheDir(mappingPath)

  const codegenMappingPath = copyDirAndCodegen(mappingPath)
  if (!codegenMappingPath)
    return

  const innerPrePrePath = path.join(path.dirname(wasmPath), '/temp/inner_pre_pre.wasm')
  createOnNonexist(innerPrePrePath)

  const [compileErr] = await to(ascCompile('node_modules/.zkgraph/common/inner.ts', codegenMappingPath, isUseAscLib, innerPrePrePath))

  if (compileErr) {
    logger.error(`[-] COMPILATION ERROR. ${compileErr.message}`)
    return
  }

  // Set up form data
  const data = new FormData()
  // data.append("asFile", createReadStream(mappingPath));
  data.append('wasmFile', fs.createReadStream(innerPrePrePath))
  data.append('yamlFile', fs.createReadStream(yamlPath))

  // Set up request config
  const requestConfig: AxiosRequestConfig = {
    method: 'post',
    maxBodyLength: Infinity,
    url: compilerServerEndpoint,
    headers: {
      ...data.getHeaders(),
    },
    data,
    timeout: 50000,
  }
  const [requestErr, response] = await to(axios.request(requestConfig))

  if (requestErr) {
    logger.error(`[-] ERROR WHEN COMPILING. ${requestErr.message}`)
    return
  }
  if (!response) {
    logger.error('[-] ERROR WHEN COMPILING. invalid response')
    return
  }
  const wasmModuleHex = response.data.wasmModuleHex
  const wasmWat = response.data.wasmWat

  createOnNonexist(wasmPath)
  fs.writeFileSync(wasmPath, fromHexString(wasmModuleHex))

  createOnNonexist(watPath)
  fs.writeFileSync(watPath, wasmWat)

  // Log compiled file size by line count
  const compiledFileContent = fs.readFileSync(watPath, 'utf-8')
  const compiledFileLineCount = compiledFileContent.split('\n').length
  logger.info(`[*] ${compiledFileLineCount}${compiledFileLineCount > 1 ? 'lines' : 'line'}in ${watPath}`)
  // Log status
  logger.info(`[+] Output written to \`${path.dirname(wasmPath)}\` folder.`)
  logger.info('[+] COMPILATION SUCCESS!' + '\n')
  zkGraphCache.clearCacheDir()
}

async function compileLocal(options: CompileOptions) {
  const {
    wasmPath,
    watPath,
    mappingPath,
    isUseAscLib = true,
  } = options
  // const mappingRoot = path.join(mappingPath, '..')
  // const entryFilename = getEntryFilename('local')
  // const innerFile = await codegen(mappingRoot, entryFilename, COMPILE_CODEGEN_LOCAL)
  // NOTE: This is temporary
  if (!isUseAscLib)
    zkGraphCache.copyLibToCacheDir(mappingPath)

  const codegenMappingPath = copyDirAndCodegen(mappingPath)
  if (!codegenMappingPath)
    return

  const [compileErr] = await to(ascCompileLocal('node_modules/.zkgraph/main_local.ts', wasmPath, watPath, codegenMappingPath, isUseAscLib))
  if (compileErr) {
    logger.error(`[-] COMPILATION ERROR. ${compileErr.message}`)
    return
  }

  logger.info(`[+] Output written to \`${path.dirname(wasmPath)}\` folder.`)
  logger.info('[+] COMPILATION SUCCESS!' + '\n')

  zkGraphCache.clearCacheDir()
}

async function ascCompile(innerTsFilePath: string, mappingPath: string, isUseAscLib: boolean, innerPrePrePath: string) {
  let commands: string[] = [
    'npx asc',
  ]
  const common = [
    `-o ${innerPrePrePath}`,
    '--disable', 'bulk-memory',
    '--disable', 'mutable-globals',
    '--exportRuntime',
    '--exportStart', wasmStartName,
    '--memoryBase', '70000',
    '--runtime stub',
  ]
  if (isUseAscLib) {
    commands = commands.concat([
      'node_modules/@hyperoracle/zkgraph-lib/common/main_state.ts',
      `--use abort=${abortPath}`,
      `--lib ${path.dirname(mappingPath)}`,
    ])
  }
  else {
    commands = commands.concat([
      innerTsFilePath,
      '--use', 'abort=node_modules/.zkgraph/common/type/abort',
    ])
  }
  commands = commands.concat(common)

  return await execAndRmSync(commands.join(' '))
}

async function ascCompileLocal(innerTsFilePath: string, wasmPath: string, watPath: string, mappingPath: string, isUseAscLib: boolean) {
  let commands: string[] = [
    'npx asc',
  ]
  const common = [
    '-t', watPath,
    '-O', '--noAssert',
    '-o', wasmPath,
    '--runtime', 'stub',
    '--disable', 'bulk-memory',
    '--exportRuntime',
    '--exportStart', wasmStartName,
    '--memoryBase', '70000',
  ]
  if (isUseAscLib) {
    commands = commands.concat([
      'node_modules/@hyperoracle/zkgraph-lib/main_state.ts',
      `--use abort=${abortPath}`,
      `--lib ${path.dirname(mappingPath)}`,
    ])
  }
  else {
    commands.concat([
      'npx asc',
      innerTsFilePath,
      '--use', 'abort=node_modules/.zkgraph/common/type/abort',
    ])
  }
  commands = commands.concat(common)

  return execAndRmSync(commands.join(' '))
}

async function execAndRmSync(command: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      execSync(command)
      // fs.rmSync(filepath)
      resolve()
    }
    catch (error) {
      reject(error)
    }
  })
}
function copyDirAndCodegen(mappingPath: string) {
  const mappingDir = path.dirname(mappingPath)

  if (fs.existsSync(mappingDir)) {
    zkGraphCache.copyDirToCacheDir(mappingDir)
    const tsFils = getTsFiles(zkGraphCache.cacheDir)
    // const libPath = path.join(process.cwd(), 'node_modules/@hyperoracle/zkgraph-lib')
    for (const tsFile of tsFils) {
      const rawCode = fs.readFileSync(tsFile, 'utf-8')
      // const [relativePath] = getRelativePath(tsFile, libPath)
      const transformCode = codegenImportReplace(rawCode, '~lib/@hyperoracle/zkgraph-lib')
      fs.writeFileSync(tsFile, transformCode)
    }
    const codegenMappingPath = path.join(zkGraphCache.cacheDir, 'mapping.ts')
    return codegenMappingPath
  }
  else {
    logger.error(`[-] ${mappingDir} not exist.`)
  }
}

// function getEntryFilename(env: string) {
//   return parseTemplateTag(COMPILE_TEMP_ENTRY_FILE_NAME_TEMPLATE, {
//     env,
//     salt: randomUniqueKey(10),
//   })
// }

// function getAbortTsFilepath(innerTsFilePath: string) {
//   return `${innerTsFilePath.replace(process.cwd(), '').substring(1).replace('.ts', '')}/abort`
// }
