import { execSync } from 'node:child_process'
import path from 'node:path'
import { consola } from 'consola'
import { version } from '../package.json'
import { haveWorkspacePackages, packages } from './constants'

let command = 'npm publish --access public'

if (version.includes('beta'))
  command += ' --tag beta'
else if (version.includes('alpha'))
  command += ' --tag alpha'

for (const name of packages) {
  let cwd = path.join('packages', name)
  if (haveWorkspacePackages.includes(name))
    cwd = path.join(cwd, 'dist')

  execSync(command, { stdio: 'inherit', cwd })
  consola.success(`Published zkGraph ${name}`)
}
