import path from 'node:path'
import { fileURLToPath } from 'node:url'

const _path = process.cwd().replace(/\\/g, '/')

// 用文件自身位置推导插件目录：放在哪、从哪个目录启动都不会错
const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginName = path.basename(pluginRoot)
const pluginResources = path.join(pluginRoot, 'resources')

export { _path, pluginName, pluginRoot, pluginResources }
