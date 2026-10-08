import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (!global.segment) {
  global.segment = (await import('oicq')).segment
}

import './model/init.js'

let ret = []

logger.info(logger.yellow('- 正在载入 ComfyUI-PLUGIN'))

const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apps')
const files = fs.readdirSync(appsDir).filter((file) => file.endsWith('.js'))

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.info(logger.green('- ComfyUI-PLUGIN 载入成功'))

export { apps }
