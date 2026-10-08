import path from 'node:path'
import { fileURLToPath } from 'node:url'

const _path = process.cwd().replace(/\\/g, '/')

const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginName = path.basename(pluginRoot)
const pluginResources = path.join(pluginRoot, 'resources')

export { _path, pluginName, pluginRoot, pluginResources }
